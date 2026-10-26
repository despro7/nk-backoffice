import { prisma } from '../../lib/utils.js';
import { resolveWarehouseDocumentKind } from '../../../shared/utils/warehouseDocumentKind.js';
import type {
  WarehouseDocumentEditContextResponse,
  WarehouseDocumentEditShipmentOrder,
  WarehouseDilovodObjectSnapshot,
} from '../../../shared/types/warehouseDocumentEdit.js';
import { MovementHistoryService } from './MovementHistoryService.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function extractOrderNumberFromLabel(documentLabel: string): string | null {
  const orderWord = documentLabel.match(/Замовлення\s+(\d+)/i);
  if (orderWord?.[1]) return orderWord[1];
  const match = documentLabel.match(/(\d{5,})/);
  return match?.[1] ?? null;
}

function extractDilovodRefId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = String((value as { id: unknown }).id ?? '').trim();
    return id || null;
  }
  return null;
}

function extractOrderNumberFromDilovodRef(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('pr' in value)) {
    return null;
  }
  const pr = String((value as { pr: unknown }).pr ?? '');
  const fromLabel = pr.match(/Замовлення\s+(\d+)/i);
  if (fromLabel?.[1]) return fromLabel[1];
  const digits = pr.match(/(\d{5,})/);
  return digits?.[1] ?? null;
}

function serializeShipmentOrder(order: {
  id: number;
  externalId: string;
  orderNumber: string;
  orderDate: Date | null;
  readyToShipAt: Date | null;
  quantity: number;
  customerName: string | null;
  status: string;
  totalPrice: number | null;
  shippingMethod: string | null;
  paymentMethod: string | null;
  ttn: string;
  sajt: string | null;
  dilovodDocId: string | null;
  dilovodSaleExportDate: Date | null;
  payloadData: unknown;
  items: string;
  rawData: string;
}): WarehouseDocumentEditShipmentOrder {
  const payload = order.payloadData ?? parseJsonField(order.rawData, null);
  const rawData = parseJsonField(order.rawData, {});
  const itemsFromColumn = parseJsonField(order.items, [] as unknown[]);
  const itemsFromPayload = payload && typeof payload === 'object' && 'items' in payload
    ? (payload as { items?: unknown }).items
    : undefined;
  const items = Array.isArray(itemsFromColumn) && itemsFromColumn.length > 0
    ? itemsFromColumn
    : itemsFromPayload;

  return {
    id: order.id,
    externalId: order.externalId,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate?.toISOString() ?? null,
    readyToShipAt: order.readyToShipAt?.toISOString() ?? null,
    quantity: order.quantity,
    customerName: order.customerName,
    status: order.status,
    totalPrice: order.totalPrice,
    shippingMethod: order.shippingMethod,
    paymentMethod: order.paymentMethod,
    ttn: order.ttn,
    sajt: order.sajt,
    dilovodDocId: order.dilovodDocId,
    dilovodSaleExportDate: order.dilovodSaleExportDate?.toISOString() ?? null,
    payloadData: payload,
    rawData,
    items,
  };
}

async function fetchDilovodSnapshot(dilovodDocumentId: string): Promise<WarehouseDilovodObjectSnapshot | null> {
  const client = new DilovodApiClient();
  await client.ensureReady();
  const apiKey = client.getApiKey();
  if (!apiKey) return null;

  const response = await client.makeRequest<{
    header?: Record<string, unknown>;
    tableParts?: { tpGoods?: Record<string, Record<string, unknown>> };
    misc?: Record<string, unknown>;
  }>({
    version: '0.25',
    key: apiKey,
    action: 'getObject',
    params: { id: dilovodDocumentId },
  });

  if (!response || typeof response !== 'object') return null;

  return {
    header: response.header ?? {},
    tableParts: {
      tpGoods: response.tableParts?.tpGoods ?? {},
    },
    misc: response.misc ?? {},
  };
}

async function resolveShipmentOrder(
  dilovodDocumentId: string,
  documentLabel: string,
  header: Record<string, unknown>,
): Promise<WarehouseDocumentEditShipmentOrder | null> {
  const baseDocRaw = header.baseDoc ?? header.contract;
  const baseDocId = extractDilovodRefId(baseDocRaw);
  if (baseDocId) {
    const byBase = await prisma.order.findFirst({
      where: { dilovodDocId: baseDocId },
    });
    if (byBase) return serializeShipmentOrder(byBase);
  }

  const orderNumberFromBase = extractOrderNumberFromDilovodRef(baseDocRaw);
  if (orderNumberFromBase) {
    const byBaseNumber = await prisma.order.findFirst({
      where: { orderNumber: orderNumberFromBase },
      orderBy: { createdAt: 'desc' },
    });
    if (byBaseNumber) return serializeShipmentOrder(byBaseNumber);
  }

  const fromLabel = extractOrderNumberFromLabel(documentLabel);
  if (fromLabel) {
    const byNumber = await prisma.order.findFirst({
      where: { orderNumber: fromLabel },
      orderBy: { createdAt: 'desc' },
    });
    if (byNumber) return serializeShipmentOrder(byNumber);
  }

  return null;
}

export class WarehouseDocumentEditContextService {
  async getContext(input: {
    dilovodDocumentId: string;
    documentLabel?: string;
    documentTypeId?: string;
  }): Promise<WarehouseDocumentEditContextResponse> {
    const dilovodDocumentId = String(input.dilovodDocumentId ?? '').trim();
    const documentLabel = String(input.documentLabel ?? '').trim();
    if (!dilovodDocumentId) {
      throw new Error('dilovodDocumentId обовʼязковий');
    }

    const kind = resolveWarehouseDocumentKind(documentLabel, input.documentTypeId);

    let dilovod: WarehouseDilovodObjectSnapshot | null = null;
    if (kind === 'goodMoving') {
      try {
        const details = await MovementHistoryService.getMovementDetails(dilovodDocumentId);
        dilovod = {
          header: (details.header ?? {}) as Record<string, unknown>,
          tableParts: {
            tpGoods: (details.tableParts?.tpGoods ?? {}) as unknown as Record<string, Record<string, unknown>>,
          },
          misc: (details.misc ?? {}) as Record<string, unknown>,
        };
      } catch {
        dilovod = await fetchDilovodSnapshot(dilovodDocumentId);
      }
    } else {
      dilovod = await fetchDilovodSnapshot(dilovodDocumentId);
    }

    const [movement, writeOff, surplus, release, returnHistory] = await Promise.all([
      prisma.warehouseMovement.findUnique({
        where: { dilovodDocId: dilovodDocumentId },
        select: { dilovodDocId: true },
      }),
      prisma.warehouseWriteOffHistory.findFirst({
        where: { writeOffNumber: dilovodDocumentId, status: { not: 'deleted' } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.warehouseSurplusHistory.findFirst({
        where: { surplusNumber: dilovodDocumentId, status: { not: 'deleted' } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.warehouseReleaseSet.findFirst({
        where: { dilovodDocId: dilovodDocumentId, status: { not: 'deleted' } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.warehouseReturnHistory.findFirst({
        where: { returnNumber: dilovodDocumentId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let localRecord: Record<string, unknown> | null = null;
    if (writeOff) {
      localRecord = {
        ...writeOff,
        items: parseJsonField(writeOff.items, []),
      };
    } else if (surplus) {
      localRecord = {
        ...surplus,
        items: parseJsonField(surplus.items, []),
      };
    } else if (release) {
      localRecord = { ...release };
    } else if (returnHistory) {
      localRecord = {
        ...returnHistory,
        items: parseJsonField(returnHistory.items, []),
      };
    }

    let shipmentOrder: WarehouseDocumentEditShipmentOrder | null = null;
    if (kind === 'shipment' && dilovod?.header) {
      shipmentOrder = await resolveShipmentOrder(
        dilovodDocumentId,
        documentLabel,
        dilovod.header,
      );
    }

    return {
      kind,
      dilovodDocumentId,
      documentLabel,
      dilovod,
      local: {
        movementDilovodDocId: movement?.dilovodDocId ?? null,
        writeOffHistoryId: writeOff?.id ?? null,
        surplusHistoryId: surplus?.id ?? null,
        releaseSetId: release?.id ?? null,
        returnHistoryId: returnHistory?.id ?? null,
      },
      localRecord,
      shipmentOrder,
    };
  }
}

export const warehouseDocumentEditContextService = new WarehouseDocumentEditContextService();
