import { prisma } from '../../../lib/utils.js';
import { computeShippedQuantityForSku, getReportProductDescriptors } from '../../../services/orderShipmentMetricsService.js';
import { catalogOpsLookup } from '../../Products/CatalogOpsLookup.js';
import type { InventoryWarehouseScope } from '../../../../shared/types/inventoryWarehouse.js';
import { safeParseItems } from '../historyNormalize.js';
import {
  calcMovementItemQty,
  collectComponentQtyBySku,
  collectItemSkus,
  getReleaseOperationDate,
  loadInventoryStorageIds,
  loadPortionsPerBoxBySku,
  loadShipmentContext,
  resolveKitStorage,
  type ShipmentContext,
} from '../inventoryOperationParsing.js';
import { addToVector, negateVector, vectorSignature, type DeviationSessionItem, type DeviationVector } from './deviationVector.js';
import { buildKitSwapCandidates, linkReleaseByQuantity, type KitReleaseInput } from './kitSwapCandidates.js';
import { loadPreviousCompletedSessions } from './previousSessions.js';
import { buildMovementLineCandidates } from './movementLineCandidates.js';
import { buildReturnCandidates, RETURN_LOOKBACK_DAYS, RETURN_STATUSES } from './returnCandidates.js';
import type { HypothesisCandidate } from './scoreHypotheses.js';

export const WINDOW_AFTER_MS = 6 * 60 * 60 * 1000;
export const WINDOW_MAX_MS = 14 * 24 * 60 * 60 * 1000;
/** Понад цей добуток (події x SKU) рахуємо відвантаження лише для SKU з відхиленням. */
const ORDER_SKU_PRODUCT_LIMIT = 400_000;

export type AnalysisWindow = { start: Date; end: Date };

export type SessionItemWithMeta = DeviationSessionItem & { type?: string; categoryName?: string | null };

const negate = negateVector;
const signature = vectorSignature;


/** Вікно аналізу: від попередньої завершеної сесії того ж складу до дати інвентаризації + 6 год, максимум 14 днів. */
export async function resolveAnalysisWindow(
  sessionId: number,
  inventoryDate: Date,
  scope: InventoryWarehouseScope,
): Promise<AnalysisWindow> {
  const end = new Date(inventoryDate.getTime() + WINDOW_AFTER_MS);
  const earliest = new Date(end.getTime() - WINDOW_MAX_MS);
  const [prev] = await loadPreviousCompletedSessions({ sessionId, inventoryDate, scope, limit: 1, earliest });
  if (prev) return { start: prev.inventoryDate, end };
  return { start: earliest, end };
}

type Composition = Array<{ sku: string; quantity: number }>;

function compositionFromSnapshot(snapshot: unknown): Composition {
  if (!Array.isArray(snapshot)) return [];
  const result: Composition = [];
  for (const c of snapshot) {
    if (!c || typeof c !== 'object') continue;
    const sku = String((c as { sku?: unknown; id?: unknown }).sku ?? (c as { id?: unknown }).id ?? '').trim();
    const quantity = Number((c as { quantity?: unknown; qty?: unknown }).quantity ?? (c as { qty?: unknown }).qty ?? 0);
    if (sku && Number.isFinite(quantity) && quantity !== 0) result.push({ sku, quantity });
  }
  return result;
}

async function collectKitCandidates(
  items: SessionItemWithMeta[],
  deviation: DeviationVector,
  scope: InventoryWarehouseScope,
  window: AnalysisWindow,
): Promise<HypothesisCandidate[]> {
  const candidates: HypothesisCandidate[] = [];
  const ids = await loadInventoryStorageIds();
  const scopeKitStorage = scope === 'gp' ? 'gp' : 'ms';

  const releases = await prisma.warehouseReleaseSet.findMany({
    where: {
      status: { not: 'deleted' },
      operationType: { in: ['kit', 'unkit'] },
      OR: [
        { operDate: { gte: window.start, lte: window.end } },
        { createdAt: { gte: window.start, lte: window.end } },
      ],
    },
    select: {
      id: true, internalDocNumber: true, setSku: true, quantity: true, operationType: true,
      storageId: true, items: true, operDate: true, createdAt: true,
    },
  });
  const inScopeReleases = releases
    .map((r) => ({ ...r, at: getReleaseOperationDate(r) }))
    .filter((r) => r.at >= window.start && r.at <= window.end)
    .filter((r) => resolveKitStorage(r.storageId, ids) === scopeKitStorage);

  const releaseInputs: KitReleaseInput[] = inScopeReleases
    .filter((r) => String(r.setSku ?? '').trim() && Number(r.quantity))
    .map((r) => ({
      id: r.id,
      internalDocNumber: r.internalDocNumber,
      setSku: String(r.setSku).trim(),
      quantity: Math.abs(Number(r.quantity) || 0),
      operationType: r.operationType,
      at: r.at,
      componentQty: collectComponentQtyBySku(r.items, Math.abs(Number(r.quantity) || 0)),
    }));

  // Склад наборів сесії: снапшот позиції, інакше каталог
  const setItems = items.filter((it) => it.sku && deviation.has(String(it.sku).trim()));
  const needCatalog = setItems.filter((it) => compositionFromSnapshot(it.componentsSnapshot).length === 0 && it.type === 'set');
  const descriptors = needCatalog.length > 0
    ? await getReportProductDescriptors(needCatalog.map((it) => String(it.sku).trim()))
    : new Map();
  const compositions = new Map<string, Composition>();
  for (const item of items) {
    const sku = String(item.sku ?? '').trim();
    if (!sku) continue;
    let composition = compositionFromSnapshot(item.componentsSnapshot);
    if (composition.length === 0 && item.type === 'set') {
      composition = descriptors.get(sku)?.setComponents ?? [];
    }
    if (composition.length > 0) compositions.set(sku, composition);
  }

  // Віртуальні кандидати: набір з відхиленням k => {set:+k, comp:-k*q}
  const virtualSignatures = new Set<string>();
  for (const item of setItems) {
    const setSku = String(item.sku).trim();
    const composition = compositions.get(setSku) ?? [];
    if (composition.length === 0) continue;
    const k = deviation.get(setSku) ?? 0;
    if (k === 0) continue;
    if (!composition.some((c) => (deviation.get(c.sku) ?? 0) !== 0)) continue;

    const vector: DeviationVector = new Map();
    addToVector(vector, setSku, k);
    for (const c of composition) addToVector(vector, c.sku, -k * c.quantity);

    // Найближча комплектація цього набору з будь-якою кількістю: проведено X, фізично Y
    const link = linkReleaseByQuantity(releaseInputs, setSku, k, window.end.getTime());
    virtualSignatures.add(signature(vector));
    candidates.push({
      id: `kit-virtual-${setSku}`,
      type: k < 0 ? 'kit_not_done' : 'kit_unposted',
      vector,
      at: link ? link.release.at.getTime() : null,
      ...(link
        ? {
            reference: { kind: 'release_set' as const, id: link.release.id, number: link.release.internalDocNumber, date: link.release.at.toISOString() },
            kit: { postedQty: link.postedQty, impliedQty: link.impliedQty },
          }
        : {}),
    });
  }

  // Реальні комплектації: проведено в обліку, але фізично не виконано => вектор з протилежним знаком
  for (const r of inScopeReleases) {
    const setSku = String(r.setSku ?? '').trim();
    const qty = Number(r.quantity) || 0;
    if (!setSku || qty === 0) continue;
    const sign = r.operationType === 'unkit' ? -1 : 1;
    const posted: DeviationVector = new Map();
    addToVector(posted, setSku, sign * qty);
    for (const [compSku, compQty] of collectComponentQtyBySku(r.items, qty)) {
      addToVector(posted, compSku, -sign * compQty);
    }
    const notDone = negate(posted);
    if (notDone.size < 2 || virtualSignatures.has(signature(notDone))) continue;
    virtualSignatures.add(signature(notDone));
    candidates.push({
      id: `kit-release-${r.id}`,
      type: 'kit_not_done',
      vector: notDone,
      at: r.at.getTime(),
      reference: { kind: 'release_set', id: r.id, number: r.internalDocNumber, date: r.at.toISOString() },
    });
  }

  // Підміна компонента / набору в комплектації
  const categoryBySku = new Map<string, string | null>();
  for (const it of items) {
    const sku = String(it.sku ?? '').trim();
    if (sku) categoryBySku.set(sku, it.categoryName ?? null);
  }
  candidates.push(...buildKitSwapCandidates({
    releases: releaseInputs,
    deviation,
    categoryBySku,
    compositions,
    existingSignatures: virtualSignatures,
  }));
  return candidates;
}

function shippedVector(order: ShipmentContext['orders'][number], ctx: ShipmentContext, skus: string[]): DeviationVector {
  const cached = ctx.cachedItemsByExternalId.get(order.reportKey) ?? null;
  const shipped: DeviationVector = new Map();
  for (const sku of skus) {
    const qty = computeShippedQuantityForSku({ ...order, items: order.items ?? null }, cached, sku, ctx.productDescriptors);
    if (qty > 0) shipped.set(sku, qty);
  }
  return shipped;
}

/** Склад відвантажень за lookback повернень (охоплює і вікно аналізу). */
function loadOrderContext(window: AnalysisWindow): Promise<ShipmentContext> {
  const lookbackStart = new Date(window.end.getTime() - RETURN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return loadShipmentContext({ start: lookbackStart < window.start ? lookbackStart : window.start, end: window.end });
}

function pickSkus(eventsCount: number, sessionSkus: Set<string>, deviation: DeviationVector): string[] {
  return eventsCount * sessionSkus.size > ORDER_SKU_PRODUCT_LIMIT ? [...deviation.keys()] : [...sessionSkus];
}

function collectReturnCandidates(
  ctx: ShipmentContext,
  sessionSkus: Set<string>,
  deviation: DeviationVector,
): HypothesisCandidate[] {
  const relevant = ctx.orders.filter(
    (o) => RETURN_STATUSES.includes(String(o.status)) || (Number(o.dilovodReturnDocsCount) || 0) > 1,
  );
  if (relevant.length === 0) return [];
  const skus = pickSkus(relevant.length, sessionSkus, deviation);
  return buildReturnCandidates(relevant.map((o) => ({
    reportKey: o.reportKey,
    externalId: String(o.externalId),
    orderNumber: o.orderNumber != null ? String(o.orderNumber) : null,
    saleDocumentNumber: o.saleDocumentNumber ?? null,
    status: o.status != null ? String(o.status) : null,
    dilovodSaleExportDate: o.dilovodSaleExportDate ?? null,
    dilovodReturnDate: o.dilovodReturnDate ?? null,
    dilovodReturnDocsCount: o.dilovodReturnDocsCount != null ? Number(o.dilovodReturnDocsCount) : null,
    shipped: shippedVector(o, ctx, skus),
  })));
}

function collectOrderCandidates(
  ctx: ShipmentContext,
  sessionSkus: Set<string>,
  deviation: DeviationVector,
  window: AnalysisWindow,
): HypothesisCandidate[] {
  const orders = ctx.orders.filter((o) => {
    const t = o.dilovodSaleExportDate ? new Date(o.dilovodSaleExportDate).getTime() : NaN;
    return t >= window.start.getTime() && t <= window.end.getTime();
  });
  if (orders.length === 0) return [];
  const skus = pickSkus(orders.length, sessionSkus, deviation);
  const candidates: HypothesisCandidate[] = [];
  for (const order of orders) {
    const shipped = shippedVector(order, ctx, skus);
    if (shipped.size === 0) continue;
    const at = order.dilovodSaleExportDate ? new Date(order.dilovodSaleExportDate) : null;
    const reference = {
      kind: 'order' as const,
      id: String(order.externalId ?? order.id),
      number: String(order.saleDocumentNumber ?? order.orderNumber ?? order.externalId ?? ''),
      orderNumber: order.orderNumber != null ? String(order.orderNumber) : null,
      date: at ? at.toISOString() : null,
    };
    // Відвантажено фізично, але не проведено / проведено двічі => факт менший за облік
    candidates.push({ id: `order-unposted-${order.reportKey}`, type: 'order_unposted', vector: negate(shipped), at: at?.getTime() ?? null, reference });
    // Проведено, але фізично не відвантажено => факт більший за облік
    candidates.push({ id: `order-notshipped-${order.reportKey}`, type: 'order_not_shipped', vector: shipped, at: at?.getTime() ?? null, reference });
  }
  return candidates;
}

async function collectMovementCandidates(
  sessionSkus: Set<string>,
  scope: InventoryWarehouseScope,
  window: AnalysisWindow,
): Promise<HypothesisCandidate[]> {
  const ids = await loadInventoryStorageIds();
  const scopeStorageId = scope === 'gp' ? ids.mainStorageId : ids.smallStorageId;
  const movements = await prisma.warehouseMovement.findMany({
    where: {
      status: { not: 'deleted' },
      OR: [{ sourceWarehouse: scopeStorageId }, { destinationWarehouse: scopeStorageId }],
      AND: [{
        OR: [
          { movementDate: { gte: window.start, lte: window.end } },
          { movementDate: null, draftCreatedAt: { gte: window.start, lte: window.end } },
        ],
      }],
    },
    select: {
      id: true, internalDocNumber: true, docNumber: true, movementDate: true, draftCreatedAt: true,
      sourceWarehouse: true, destinationWarehouse: true, items: true,
      submittedItemsSnapshot: true, receivedItemsSnapshot: true,
    },
  });
  if (movements.length === 0) return [];

  const allSkus = new Set<string>();
  for (const m of movements) {
    for (const raw of [m.items, m.submittedItemsSnapshot, m.receivedItemsSnapshot]) {
      for (const s of collectItemSkus(safeParseItems(raw))) allSkus.add(s);
    }
  }
  const ppb = await loadPortionsPerBoxBySku(allSkus);

  const toVector = (raw: unknown): DeviationVector => {
    const v: DeviationVector = new Map();
    for (const it of safeParseItems(raw)) {
      const sku = String((it as { sku?: string }).sku ?? '').trim();
      if (!sku || !sessionSkus.has(sku)) continue;
      addToVector(v, sku, calcMovementItemQty(it as Record<string, unknown>, ppb));
    }
    return v;
  };

  const candidates: HypothesisCandidate[] = [];
  for (const m of movements) {
    const orientation = m.destinationWarehouse === scopeStorageId ? 1 : -1;
    const at = (m.movementDate ?? m.draftCreatedAt).getTime();
    const reference = {
      kind: 'movement' as const,
      id: m.id,
      number: m.docNumber ?? m.internalDocNumber,
      date: (m.movementDate ?? m.draftCreatedAt).toISOString(),
    };
    const posted = new Map([...toVector(m.items)].map(([k, n]) => [k, n * orientation] as [string, number]));
    if (posted.size > 0) {
      candidates.push({ id: `mv-${m.id}-notdone`, type: 'movement_mismatch', vector: negate(posted), at, reference });
      candidates.push({ id: `mv-${m.id}-unposted`, type: 'movement_mismatch', vector: posted, at, reference });
    }
    candidates.push(...buildMovementLineCandidates(m.id, posted, at, reference));
    if (m.submittedItemsSnapshot && m.receivedItemsSnapshot) {
      const submitted = toVector(m.submittedItemsSnapshot);
      const received = toVector(m.receivedItemsSnapshot);
      const diff: DeviationVector = new Map();
      for (const sku of new Set([...submitted.keys(), ...received.keys()])) {
        addToVector(diff, sku, ((received.get(sku) ?? 0) - (submitted.get(sku) ?? 0)) * orientation);
      }
      if (diff.size > 0) {
        candidates.push({ id: `mv-${m.id}-diff`, type: 'movement_mismatch', vector: diff, at, reference });
        candidates.push({ id: `mv-${m.id}-diff-inv`, type: 'movement_mismatch', vector: negate(diff), at, reference });
      }
    }
  }
  return candidates;
}

export async function collectCandidates(args: {
  items: SessionItemWithMeta[];
  deviation: DeviationVector;
  scope: InventoryWarehouseScope;
  window: AnalysisWindow;
}): Promise<HypothesisCandidate[]> {
  const { items, deviation, scope, window } = args;
  const sessionSkus = new Set(items.map((it) => String(it.sku ?? '').trim()).filter(Boolean));
  const [kits, shipmentCtx, movements] = await Promise.all([
    collectKitCandidates(items, deviation, scope, window),
    loadOrderContext(window),
    collectMovementCandidates(sessionSkus, scope, window),
  ]);
  const orders = collectOrderCandidates(shipmentCtx, sessionSkus, deviation, window);
  const returns = collectReturnCandidates(shipmentCtx, sessionSkus, deviation);
  return [...kits, ...orders, ...returns, ...movements];
}

/** Назви SKU: з позицій сесії, для решти (компоненти поза сесією) з каталогу. */
export async function resolveSkuNames(items: SessionItemWithMeta[], extraSkus: Iterable<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const it of items) {
    const sku = String(it.sku ?? '').trim();
    if (sku && it.name) names.set(sku, it.name);
  }
  const missing = [...new Set(extraSkus)].filter((s) => !names.has(s));
  if (missing.length > 0) {
    try {
      const found = await catalogOpsLookup.getBySkus(missing);
      for (const p of catalogOpsLookup.listUnique(found)) names.set(p.sku, p.name);
    } catch {
      // назви не критичні
    }
  }
  return names;
}
