import { prisma } from '../lib/utils.js';
import { orderDatabaseService } from './orderDatabaseService.js';
import { ordersCacheService } from './ordersCacheService.js';
import { getShipmentSummaryItems } from './orderShipments.js';
import { monolithicSkusToLegacyPayload, readMonolithicSkus } from '../../shared/utils/shipmentRecord.js';

/**
 * Події відвантаження для звітів (`shippedOnly`, історія руху товару).
 *
 * Одна подія = один документ `sale` у діапазоні дат (з `order_dilovod_documents`):
 * - документ привʼязаний до циклу (`order_shipments`): склад циклу;
 * - документ без циклу: поточний склад замовлення (як раніше);
 * - замовлення без жодного `sale` у таблиці (ще не синхронізоване): як раніше,
 *   за `orders.dilovodSaleExportDate` і поточним складом.
 *
 * Подія має форму замовлення з `getOrders` (звіти рахують її тими самими функціями),
 * дату відвантаження в `dilovodSaleExportDate` і власний ключ кешу `reportKey`.
 * Для подій з документом поточний статус замовлення не фільтрується: документ уже
 * доводить відвантаження (інакше відвантаження повернених замовлень випадали б зі звіту).
 */

export type ShipmentEventOrder = Record<string, any> & {
  id: number;
  externalId: string;
  items?: unknown;
  payloadData?: unknown;
  dilovodSaleExportDate: Date | string | null;
  /** Унікальний ключ події (кеш позицій, React key): `externalId` або `externalId#dilovodId`. */
  reportKey: string;
  shipmentCycle?: number | null;
  saleDocumentNumber?: string | null;
};

export type ShipmentEventsResult = {
  orders: ShipmentEventOrder[];
  /** Розгорнуті позиції (`processedItems`) за `reportKey`. */
  caches: Map<string, { processedItems: string | null }>;
};

type SaleDocRow = {
  orderId: number;
  dilovodId: string;
  number: string | null;
  docDate: Date;
  shipment: { cycle: number; summary: unknown } | null;
};

type OrderRow = Record<string, any> & { id: number; externalId: string; items?: unknown; payloadData?: unknown };

/** Чиста частина: документи + замовлення → події (без розгортання позицій). */
export function composeShipmentEvents(
  saleDocs: SaleDocRow[],
  ordersById: Map<number, OrderRow>,
  legacyOrders: OrderRow[],
): Array<ShipmentEventOrder & { cycleItems: unknown[] | null }> {
  const events: Array<ShipmentEventOrder & { cycleItems: unknown[] | null }> = [];

  for (const doc of saleDocs) {
    const order = ordersById.get(doc.orderId);
    if (!order) continue;
    const cycleItems = doc.shipment ? getShipmentSummaryItems(doc.shipment.summary) : null;
    events.push({
      ...order,
      ...(cycleItems
        ? {
            items: JSON.stringify(cycleItems),
            payloadData: monolithicSkusToLegacyPayload(readMonolithicSkus(doc.shipment!.summary)),
          }
        : {}),
      dilovodSaleExportDate: doc.docDate,
      reportKey: `${order.externalId}#${doc.dilovodId}`,
      shipmentCycle: doc.shipment?.cycle ?? null,
      saleDocumentNumber: doc.number,
      cycleItems,
    });
  }

  for (const order of legacyOrders) {
    events.push({
      ...order,
      dilovodSaleExportDate: order.dilovodSaleExportDate ?? null,
      reportKey: order.externalId,
      shipmentCycle: null,
      saleDocumentNumber: null,
      cycleItems: null,
    });
  }

  return events;
}

export async function loadShipmentEvents(filters: {
  range: { start: Date; end: Date };
  /** Статус для замовлень без документів (як у `getOrders`). */
  status?: string | string[];
  includeItems?: boolean;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}): Promise<ShipmentEventsResult> {
  const { start, end } = filters.range;

  const saleDocs: SaleDocRow[] = (await prisma.orderDilovodDocument.findMany({
    where: { type: 'sale', docDate: { gte: start, lte: end } },
    select: {
      orderId: true,
      dilovodId: true,
      number: true,
      docDate: true,
      saleOfShipment: { select: { cycle: true, summary: true } },
    },
  })).map((doc) => ({ ...doc, shipment: doc.saleOfShipment }));

  const docOrderIds = [...new Set(saleDocs.map((doc) => doc.orderId))];
  const docOrders = docOrderIds.length > 0
    ? await orderDatabaseService.getOrders({ orderIds: docOrderIds, limit: docOrderIds.length, includeItems: filters.includeItems })
    : [];
  const ordersById = new Map<number, OrderRow>((docOrders as OrderRow[]).map((order) => [order.id, order]));

  // Замовлення без документів у таблиці: стара логіка за dilovodSaleExportDate
  const candidates = await orderDatabaseService.getOrders({
    status: filters.status,
    limit: filters.limit ?? 10000,
    sortBy: 'dilovodSaleExportDate',
    sortOrder: filters.sortOrder ?? 'desc',
    shippedOnly: true,
    shippedDateRange: { start, end },
    includeItems: filters.includeItems,
  }) as OrderRow[];
  const candidateIds = candidates.map((order) => order.id);
  const withDocs = candidateIds.length > 0
    ? new Set((await prisma.orderDilovodDocument.findMany({
        where: { type: 'sale', orderId: { in: candidateIds } },
        select: { orderId: true },
        distinct: ['orderId'],
      })).map((row) => row.orderId))
    : new Set<number>();
  const legacyOrders = candidates.filter((order) => !withDocs.has(order.id));

  const events = composeShipmentEvents(saleDocs, ordersById, legacyOrders);

  // Позиції: цикл – розгортаємо його склад; інакше – кеш замовлення
  const caches = new Map<string, { processedItems: string | null }>();
  const orderCaches = await ordersCacheService.getMultipleOrderCaches(
    [...new Set(events.filter((event) => !event.cycleItems).map((event) => event.externalId))],
  );
  for (const event of events) {
    if (event.cycleItems) {
      const expanded = await orderDatabaseService.expandOrderItemsForReport(event.cycleItems as any[], event.reportKey);
      caches.set(event.reportKey, { processedItems: JSON.stringify(expanded) });
    } else {
      caches.set(event.reportKey, { processedItems: orderCaches.get(event.externalId)?.processedItems ?? null });
    }
  }

  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  const orders: ShipmentEventOrder[] = events
    .map(({ cycleItems: _cycleItems, ...event }) => event)
    .sort((left, right) => direction * (new Date(left.dilovodSaleExportDate ?? 0).getTime() - new Date(right.dilovodSaleExportDate ?? 0).getTime()));

  return { orders, caches };
}
