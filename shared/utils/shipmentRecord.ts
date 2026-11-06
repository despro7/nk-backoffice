import type {
  ShipmentItemMode,
  ShipmentManifestBoxV1,
  ShipmentManifestLineV1,
  ShipmentManifestV1,
  ShipmentRecordV2,
  ShipmentSummaryItemV2,
  ShipmentSummaryV2,
} from '../types/orderShipments.js';
import { SHIPMENT_MONOLITHIC_ACC_GOOD } from './dilovodShipmentCycle.js';

/**
 * Склад циклу відвантаження v2: будується на клієнті зі стану комплектації (`OrderView`),
 * перевіряється і читається на сервері. Чисті функції, без залежностей від UI.
 */

type QuantityLike = number | string | null | undefined;

export interface ShipmentRecordInput {
  /** Позиції замовлення верхнього рівня (`order.items`). */
  orderItems: Array<{ sku?: string | null; quantity?: QuantityLike; productName?: string | null; price?: QuantityLike; dilovodId?: string | null }>;
  /** Розгорнуті позиції комплектації (`expandedItems`). */
  expandedItems: Array<{ type?: string; sku?: string | null; quantity?: QuantityLike; dynamicMonolithic?: boolean }>;
  /** Чекліст з коробками (`checklistItems`): коробки і товари з `boxIndex`. */
  checklistItems: Array<{
    type?: string;
    sku?: string | null;
    name?: string;
    quantity?: QuantityLike;
    boxIndex?: number;
    portionsPerItem?: number;
    dynamicMonolithic?: boolean;
    monolithicSplitIndex?: number;
    monolithicSplitTotal?: number;
    boxSettings?: { name?: string; qntTo?: QuantityLike } | null;
  }>;
  /** SKU наборів, які комплектувальник вручну розклав (не моноліт). */
  forcedRegularSkus: string[];
  unallocatedItems: Array<{ name: string; quantity: number }>;
}

function toQuantity(value: QuantityLike): number {
  const num = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function normalizeSku(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

/**
 * Монолітні SKU: рівно ті, що потрапляють у `payloadData.shipment.bySku`
 * (набори з `dynamicMonolithic`), щоб облік не змінився при переході на v2.
 */
export function collectMonolithicSkus(expandedItems: ShipmentRecordInput['expandedItems']): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of expandedItems) {
    if (item.type !== 'product' || !item.dynamicMonolithic) continue;
    const sku = normalizeSku(item.sku);
    const quantity = toQuantity(item.quantity);
    if (!sku || quantity <= 0) continue;
    result[sku] = (result[sku] ?? 0) + quantity;
  }
  return result;
}

function toManifestLine(item: ShipmentRecordInput['checklistItems'][number]): ShipmentManifestLineV1 {
  const portionsPerItem = Number(item.portionsPerItem) > 0 ? Number(item.portionsPerItem) : undefined;
  const lineType = item.dynamicMonolithic ? 'monolithic_set' : portionsPerItem ? 'set_unit' : 'product';
  const hasSplit = Number(item.monolithicSplitTotal) > 1;
  return {
    sku: normalizeSku(item.sku) || null,
    name: item.name ?? '',
    quantity: toQuantity(item.quantity),
    lineType,
    ...(portionsPerItem ? { portionsPerItem } : {}),
    ...(hasSplit ? { split: { index: Number(item.monolithicSplitIndex ?? 0), total: Number(item.monolithicSplitTotal) } } : {}),
  };
}

function linePortions(line: ShipmentManifestLineV1): number {
  return line.quantity * (line.portionsPerItem ?? 1);
}

export function buildShipmentRecord(input: ShipmentRecordInput): ShipmentRecordV2 {
  const monolithic = collectMonolithicSkus(input.expandedItems);
  const forced = new Set(input.forcedRegularSkus.map(normalizeSku).filter(Boolean));

  const items: ShipmentSummaryItemV2[] = [];
  for (const orderItem of input.orderItems) {
    const sku = normalizeSku(orderItem.sku);
    const quantity = toQuantity(orderItem.quantity);
    if (!sku || quantity <= 0) continue;
    const itemMode: ShipmentItemMode = monolithic[sku] ? 'monolithic' : forced.has(sku) ? 'forced_regular' : 'regular';
    items.push({
      sku,
      quantity,
      itemMode,
      ...(orderItem.productName ? { productName: String(orderItem.productName) } : {}),
      ...(Number.isFinite(Number(orderItem.price)) ? { price: Number(orderItem.price) } : {}),
      ...(orderItem.dilovodId != null ? { dilovodId: String(orderItem.dilovodId) } : {}),
    });
  }

  const boxRows = input.checklistItems
    .filter((item) => item.type === 'box')
    .sort((left, right) => Number(left.boxIndex ?? 0) - Number(right.boxIndex ?? 0));
  const productRows = input.checklistItems.filter((item) => item.type === 'product');

  const boxes: ShipmentManifestBoxV1[] = boxRows.map((box, position) => {
    const boxIndex = Number(box.boxIndex ?? position);
    // Одна коробка: розподіл не застосовується, усі товари в ній
    const lines = productRows
      .filter((item) => (boxRows.length === 1 ? true : item.boxIndex === boxIndex))
      .map(toManifestLine);
    const hardCap = toQuantity(box.boxSettings?.qntTo);
    return {
      boxNum: position + 1,
      boxName: box.boxSettings?.name || box.name || `Коробка ${position + 1}`,
      hardCap: hardCap > 0 ? hardCap : null,
      usedPortions: lines.reduce((sum, line) => sum + linePortions(line), 0),
      lines,
    };
  });

  const looseLines = boxRows.length === 1
    ? []
    : productRows.filter((item) => item.boxIndex == null || !boxRows.some((box, position) => Number(box.boxIndex ?? position) === item.boxIndex)).map(toManifestLine);

  const decisions = [...forced]
    .filter((sku) => !monolithic[sku])
    .map((sku) => ({ sku, decision: 'forced_regular' as const, reason: 'operator_override' as const }));

  const monolithicItems = items.filter((item) => item.itemMode === 'monolithic').length;
  const summary: ShipmentSummaryV2 = {
    version: 2,
    mode: Object.keys(monolithic).length === 0 ? 'regular' : monolithicItems === items.length ? 'monolithic' : 'mixed',
    items,
    monolithic,
    totals: { items: items.length, monolithicItems, boxes: boxes.length },
  };

  const manifest: ShipmentManifestV1 = {
    version: 1,
    boxes,
    looseLines,
    unallocated: input.unallocatedItems.filter((item) => item && toQuantity(item.quantity) > 0),
    decisions,
  };

  return { summary, manifest };
}

// ---------- Перевірка і читання (сервер) ----------

const MAX_RECORD_JSON_LENGTH = 200_000;

const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

export function isShipmentSummaryV2(value: unknown): value is ShipmentSummaryV2 {
  return isObject(value) &&
    value.version === 2 &&
    Array.isArray(value.items) &&
    value.items.every((item: unknown) => isObject(item) && typeof item.sku === 'string' && Number(item.quantity) > 0 &&
      ['regular', 'monolithic', 'forced_regular'].includes(item.itemMode)) &&
    isObject(value.monolithic) &&
    Object.values(value.monolithic).every((quantity) => Number(quantity) > 0) &&
    isObject(value.totals);
}

export function isShipmentManifestV1(value: unknown): value is ShipmentManifestV1 {
  return isObject(value) &&
    value.version === 1 &&
    Array.isArray(value.boxes) &&
    Array.isArray(value.looseLines) &&
    Array.isArray(value.unallocated) &&
    Array.isArray(value.decisions);
}

/** Валідний склад v2 з тіла запиту, інакше null (тоді сервер пише v1 зі старих полів). */
export function parseShipmentRecordV2(value: unknown): ShipmentRecordV2 | null {
  if (!isObject(value)) return null;
  try {
    if (JSON.stringify(value).length > MAX_RECORD_JSON_LENGTH) return null;
  } catch {
    return null;
  }
  if (!isShipmentSummaryV2(value.summary) || !isShipmentManifestV1(value.manifest)) return null;
  return { summary: value.summary, manifest: value.manifest };
}

/**
 * Монолітні SKU зі складу будь-якої версії: v2 `monolithic`, v1 `monolithicBySku`,
 * або старий `payloadData.shipment.bySku`. null – складу немає.
 */
export function readMonolithicSkus(summaryOrPayload: unknown): Record<string, number> | null {
  if (!isObject(summaryOrPayload)) return null;
  const raw = summaryOrPayload.version === 2
    ? summaryOrPayload.monolithic
    : summaryOrPayload.version === 1
      ? summaryOrPayload.monolithicBySku
      : summaryOrPayload.shipment?.bySku
        ? Object.fromEntries(Object.entries(summaryOrPayload.shipment.bySku).map(([sku, entry]: [string, any]) => [sku, entry?.quantity ?? entry?.orderedQuantity]))
        : null;
  if (!isObject(raw)) return null;
  const result: Record<string, number> = {};
  for (const [sku, quantity] of Object.entries(raw)) {
    const normalizedSku = sku.trim();
    const normalizedQuantity = toQuantity(quantity as QuantityLike);
    if (normalizedSku && normalizedQuantity > 0) result[normalizedSku] = normalizedQuantity;
  }
  return result;
}

/** Монолітні SKU → старий формат `payloadData` (для споживачів, що читають `shipment.bySku`). */
export function monolithicSkusToLegacyPayload(
  monolithic: Record<string, number> | null | undefined,
): { shipment: { bySku: Record<string, { accGood: string; quantity: number }> } } | null {
  const entries = Object.entries(monolithic ?? {});
  if (entries.length === 0) return null;
  return {
    shipment: {
      bySku: Object.fromEntries(entries.map(([sku, quantity]) => [sku, { accGood: SHIPMENT_MONOLITHIC_ACC_GOOD, quantity }])),
    },
  };
}
