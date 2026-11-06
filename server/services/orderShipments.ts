import { Prisma } from '@prisma/client';
import { prisma } from '../lib/utils.js';
import type { OrderShipmentBriefDto, ShipmentRecordV2, ShipmentSummaryItemV2 } from '../../shared/types/orderShipments.js';
import { isShipmentSummaryV2, readMonolithicSkus } from '../../shared/utils/shipmentRecord.js';

/**
 * Цикли комплектації / відвантаження (`order_shipments`).
 *
 * Кожна комплектація (перехід у статус 3) – окремий цикл зі своїм складом. Цикл привʼязується
 * до свого `sale` і, якщо було повернення, до свого `saleReturn` з `order_dilovod_documents`.
 * `orders.payloadData` лишається копією останньої комплектації (перехідний період).
 */

/** Формат `summary` етапу 2: рівно те, з чого будується документ відвантаження. */
export const SHIPMENT_SUMMARY_VERSION = 1;

export type ShipmentSummaryItemV1 = {
  sku: string;
  quantity: number;
  productName?: string;
  price?: number;
  dilovodId?: string | null;
};

export type ShipmentSummaryV1 = {
  version: 1;
  /** Знімок `orders.items` у момент комплектації. */
  items: ShipmentSummaryItemV1[];
  /** SKU, відвантажені як монолітний набір → кількість (з `payloadData.shipment.bySku`). */
  monolithicBySku: Record<string, number>;
};

/** Допуск між моментом комплектації і датою документа Dilovod (TZ-зсуви, ручні дати). */
const LINK_TOLERANCE_MS = 12 * 60 * 60 * 1000;

function parseItems(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(raw: unknown): any {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw ?? null;
}

function toPositiveNumber(value: unknown): number {
  const num = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** `orders.items` + `orders.payloadData` → summary v1. */
export function buildShipmentSummaryV1(itemsRaw: unknown, payloadDataRaw: unknown): ShipmentSummaryV1 {
  const items: ShipmentSummaryItemV1[] = [];
  for (const item of parseItems(itemsRaw)) {
    const sku = String(item?.sku ?? '').trim();
    const quantity = toPositiveNumber(item?.quantity);
    if (!sku || quantity <= 0) continue;
    items.push({
      sku,
      quantity,
      ...(item?.productName ? { productName: String(item.productName) } : {}),
      ...(Number.isFinite(Number(item?.price)) ? { price: Number(item.price) } : {}),
      ...(item?.dilovodId != null ? { dilovodId: String(item.dilovodId) } : {}),
    });
  }

  const monolithicBySku: Record<string, number> = {};
  const bySku = parseJsonObject(payloadDataRaw)?.shipment?.bySku;
  if (bySku && typeof bySku === 'object') {
    for (const [sku, entry] of Object.entries(bySku as Record<string, any>)) {
      const normalizedSku = sku.trim();
      const quantity = toPositiveNumber(entry?.quantity ?? entry?.orderedQuantity);
      if (normalizedSku && quantity > 0) monolithicBySku[normalizedSku] = quantity;
    }
  }

  return { version: 1, items, monolithicBySku };
}

export function isShipmentSummaryV1(value: unknown): value is ShipmentSummaryV1 {
  return !!value && typeof value === 'object' && (value as any).version === 1 && Array.isArray((value as any).items);
}

/** Позиції циклу з summary будь-якої версії (v1 / v2); null – формат невідомий. */
export function getShipmentSummaryItems(summary: unknown): Array<ShipmentSummaryItemV1 | ShipmentSummaryItemV2> | null {
  if (isShipmentSummaryV2(summary) || isShipmentSummaryV1(summary)) return summary.items;
  return null;
}

// ---------- Привʼязка документів до циклів (pure) ----------

export type CycleLinkState = {
  id: number;
  cycle: number;
  pickedAt: Date;
  saleDocumentId: number | null;
  returnDocumentId: number | null;
  saleDate?: Date | null;
};

export type DocumentLinkState = { id: number; dilovodId: string; docDate: Date };

/**
 * Відвантаження → цикли. Відкритий цикл (без sale) отримує найраніше неприв'язане відвантаження,
 * не раніше за комплектацію (з допуском). Відвантаження з `createForSaleIds` без циклу – новий цикл.
 */
export function planSaleLinks(
  cycles: CycleLinkState[],
  sales: DocumentLinkState[],
  createForSaleIds: Set<string>,
): { links: Array<{ cycleId: number; saleDocumentId: number }>; creates: DocumentLinkState[] } {
  const linkedSaleIds = new Set(cycles.map((cycle) => cycle.saleDocumentId).filter((id): id is number => id != null));
  const unlinked = sales
    .filter((sale) => !linkedSaleIds.has(sale.id))
    .sort((left, right) => left.docDate.getTime() - right.docDate.getTime());

  const links: Array<{ cycleId: number; saleDocumentId: number }> = [];
  const openCycles = cycles.filter((cycle) => cycle.saleDocumentId == null).sort((left, right) => left.cycle - right.cycle);
  for (const cycle of openCycles) {
    const index = unlinked.findIndex((sale) => sale.docDate.getTime() >= cycle.pickedAt.getTime() - LINK_TOLERANCE_MS);
    if (index === -1) continue;
    links.push({ cycleId: cycle.id, saleDocumentId: unlinked[index].id });
    unlinked.splice(index, 1);
  }

  const creates = unlinked.filter((sale) => createForSaleIds.has(sale.dilovodId));
  return { links, creates };
}

/** Повернення → цикл з найпізнішим відвантаженням, не пізнішим за повернення, без повернення. */
export function planReturnLinks(
  cycles: CycleLinkState[],
  returns: DocumentLinkState[],
): Array<{ cycleId: number; returnDocumentId: number }> {
  const linkedReturnIds = new Set(cycles.map((cycle) => cycle.returnDocumentId).filter((id): id is number => id != null));
  const taken = new Set(cycles.filter((cycle) => cycle.returnDocumentId != null).map((cycle) => cycle.id));
  const result: Array<{ cycleId: number; returnDocumentId: number }> = [];

  const unlinked = returns
    .filter((doc) => !linkedReturnIds.has(doc.id))
    .sort((left, right) => left.docDate.getTime() - right.docDate.getTime());

  for (const doc of unlinked) {
    const candidate = cycles
      .filter((cycle) =>
        !taken.has(cycle.id) &&
        cycle.saleDocumentId != null &&
        cycle.saleDate != null &&
        cycle.saleDate.getTime() <= doc.docDate.getTime() + LINK_TOLERANCE_MS)
      .sort((left, right) => right.saleDate!.getTime() - left.saleDate!.getTime())[0];
    if (!candidate) continue;
    taken.add(candidate.id);
    result.push({ cycleId: candidate.id, returnDocumentId: doc.id });
  }
  return result;
}

// ---------- БД ----------

async function nextCycleNumber(orderId: number): Promise<number> {
  const last = await prisma.orderShipment.findFirst({ where: { orderId }, orderBy: { cycle: 'desc' }, select: { cycle: true } });
  return (last?.cycle ?? 0) + 1;
}

async function createCycle(data: Omit<Prisma.OrderShipmentUncheckedCreateInput, 'cycle'>): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.orderShipment.create({ data: { ...data, cycle: await nextCycleNumber(data.orderId) } });
      return;
    } catch (error) {
      const isUniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!isUniqueConflict || attempt === 2) throw error;
    }
  }
}

async function loadOrderSnapshot(orderId: number) {
  return prisma.order.findUnique({ where: { id: orderId }, select: { items: true, payloadData: true } });
}

/**
 * Комплектація (статус 3). Перехід у статус: новий цикл, якщо останній уже відвантажено,
 * інакше оновлюємо відкритий (перекомплектація до відвантаження). Без зміни статусу лише
 * оновлюємо відкритий цикл.
 */
export async function recordShipmentPicking(
  orderId: number,
  options: { pickedAt: Date; pickedById?: number | null; statusChanged: boolean; record?: ShipmentRecordV2 | null },
): Promise<void> {
  // v2 від клієнта (склад + коробки + рішення); без нього – v1 зі знімка замовлення
  let summary: Prisma.InputJsonValue;
  let manifest: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let schemaVersion: number = SHIPMENT_SUMMARY_VERSION;
  if (options.record) {
    summary = options.record.summary as unknown as Prisma.InputJsonValue;
    manifest = options.record.manifest as unknown as Prisma.InputJsonValue;
    schemaVersion = 2;
  } else {
    const snapshot = await loadOrderSnapshot(orderId);
    if (!snapshot) return;
    summary = buildShipmentSummaryV1(snapshot.items, snapshot.payloadData) as unknown as Prisma.InputJsonValue;
  }

  const latest = await prisma.orderShipment.findFirst({ where: { orderId }, orderBy: { cycle: 'desc' } });
  if (latest && latest.saleDocumentId == null) {
    await prisma.orderShipment.update({
      where: { id: latest.id },
      data: {
        summary,
        manifest,
        schemaVersion,
        ...(options.statusChanged ? { pickedAt: options.pickedAt, pickedById: options.pickedById ?? null } : {}),
      },
    });
    return;
  }
  if (!options.statusChanged) return;

  await createCycle({
    orderId,
    pickedAt: options.pickedAt,
    pickedById: options.pickedById ?? null,
    source: 'picking',
    schemaVersion,
    summary,
    manifest,
  });
}

/**
 * Звіряє цикли з документами `order_dilovod_documents`: привʼязує sale і saleReturn.
 * `createForSaleIds`: відвантаження, щойно створені нами (експорт); якщо для них немає
 * відкритого циклу (статус 3 прийшов із SalesDrive), створюється цикл із поточного складу.
 * Відвантаження, знайдені синхронізацією, нових циклів не створюють (старі цикли – backfill).
 */
export async function reconcileOrderShipments(orderId: number, options: { createForSaleIds?: string[] } = {}): Promise<void> {
  const docs = await prisma.orderDilovodDocument.findMany({
    where: { orderId, type: { in: ['sale', 'saleReturn'] } },
    select: { id: true, type: true, dilovodId: true, docDate: true },
  });
  const sales = docs.filter((doc) => doc.type === 'sale');
  const returns = docs.filter((doc) => doc.type === 'saleReturn');
  if (sales.length === 0) return;

  const loadCycles = async (): Promise<CycleLinkState[]> => {
    const rows = await prisma.orderShipment.findMany({
      where: { orderId },
      select: { id: true, cycle: true, pickedAt: true, saleDocumentId: true, returnDocumentId: true },
    });
    const saleDateById = new Map(sales.map((sale) => [sale.id, sale.docDate]));
    return rows.map((row) => ({ ...row, saleDate: row.saleDocumentId != null ? saleDateById.get(row.saleDocumentId) ?? null : null }));
  };

  const salePlan = planSaleLinks(await loadCycles(), sales, new Set(options.createForSaleIds ?? []));
  for (const link of salePlan.links) {
    await prisma.orderShipment.update({ where: { id: link.cycleId }, data: { saleDocumentId: link.saleDocumentId } });
  }
  if (salePlan.creates.length > 0) {
    const snapshot = await loadOrderSnapshot(orderId);
    const summary = buildShipmentSummaryV1(snapshot?.items, snapshot?.payloadData) as unknown as Prisma.InputJsonValue;
    for (const sale of salePlan.creates) {
      await createCycle({
        orderId,
        pickedAt: sale.docDate,
        source: 'export',
        schemaVersion: SHIPMENT_SUMMARY_VERSION,
        summary,
        saleDocumentId: sale.id,
      });
    }
  }

  if (returns.length === 0) return;
  for (const link of planReturnLinks(await loadCycles(), returns)) {
    await prisma.orderShipment.update({ where: { id: link.cycleId }, data: { returnDocumentId: link.returnDocumentId } });
  }
}

export async function reconcileOrderShipmentsSafe(
  orderId: number | null | undefined,
  options: { createForSaleIds?: string[] } = {},
  label = 'OrderShipments',
): Promise<void> {
  if (!orderId) return;
  try {
    await reconcileOrderShipments(orderId, options);
  } catch (error) {
    console.warn(`⚠️ [${label}] Не вдалося звірити цикли відвантаження orderId=${orderId}:`, error instanceof Error ? error.message : error);
  }
}

/** Цикл, який зараз можна повернути: останній відвантажений без повернення. */
export async function findReturnableShipment(orderId: number) {
  return prisma.orderShipment.findFirst({
    where: { orderId, saleDocumentId: { not: null }, returnDocumentId: null },
    orderBy: { cycle: 'desc' },
  });
}

/**
 * Монолітні SKU відкритого циклу (скомплектовано, ще без sale) для документа відвантаження.
 * null – відкритого циклу немає, споживач бере `orders.payloadData` як раніше.
 */
export async function getOpenShipmentMonolithicSkus(orderId: number): Promise<Record<string, number> | null> {
  const open = await prisma.orderShipment.findFirst({
    where: { orderId, saleDocumentId: null },
    orderBy: { cycle: 'desc' },
    select: { summary: true },
  });
  return open ? readMonolithicSkus(open.summary) : null;
}

/** Короткий опис циклів для UI одним запитом. */
export async function loadOrderShipmentBriefs(orderIds: number[]): Promise<Map<number, OrderShipmentBriefDto[]>> {
  const map = new Map<number, OrderShipmentBriefDto[]>();
  if (orderIds.length === 0) return map;
  const rows = await prisma.orderShipment.findMany({
    where: { orderId: { in: orderIds } },
    orderBy: [{ orderId: 'asc' }, { cycle: 'asc' }],
    select: {
      orderId: true,
      cycle: true,
      pickedAt: true,
      summary: true,
      saleDocument: { select: { dilovodId: true } },
      returnDocument: { select: { dilovodId: true } },
    },
  });
  for (const row of rows) {
    const items = getShipmentSummaryItems(row.summary);
    const list = map.get(row.orderId) ?? [];
    list.push({
      cycle: row.cycle,
      pickedAt: row.pickedAt.toISOString(),
      saleDilovodId: row.saleDocument?.dilovodId ?? null,
      returnDilovodId: row.returnDocument?.dilovodId ?? null,
      itemsCount: items?.length ?? 0,
      monolithicCount: Object.keys(readMonolithicSkus(row.summary) ?? {}).length,
      boxesCount: isShipmentSummaryV2(row.summary) ? row.summary.totals.boxes : null,
    });
    map.set(row.orderId, list);
  }
  return map;
}
