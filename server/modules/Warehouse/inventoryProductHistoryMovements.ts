import { prisma } from '../../lib/utils.js';
import { computeShippedQuantityForSku, sumQuantityForSku } from '../../services/orderShipmentMetricsService.js';
import { kyivDayRangeExclusiveFromYmd, kyivYmd } from '../../../shared/utils/kyivDateTime.js';
import { safeParseItems } from './historyNormalize.js';
import {
  calcMovementItemQty,
  collectItemSkus,
  getComponentQtyFromRelease,
  getReleaseOperationDate,
  getSetNameFromRelease,
  loadInventoryStorageIds,
  loadPortionsPerBoxBySku,
  loadShipmentContext,
  resolveKitStorage,
  type InventoryStorageIds,
  type ShipmentContext,
} from './inventoryOperationParsing.js';
import { getInventoryHistoryCacheSettings } from './inventoryHistoryCacheSettings.js';

export type ProductHistoryDayMovements = {
  kit: number;
  kitGp: number;
  kitDetails: Array<{
    setSku: string;
    setName: string | null;
    operationType: 'kit' | 'unkit';
    quantity: number;
    signedQuantity: number;
    storage: 'ms' | 'gp';
  }>;
  shipped: number;
  moved: number;
  movedGp: number;
  returned: number;
  writtenOff: number;
  writtenOffGp: number;
};

const emptyMovements = (): ProductHistoryDayMovements => ({
  kit: 0,
  kitGp: 0,
  kitDetails: [],
  shipped: 0,
  moved: 0,
  movedGp: 0,
  returned: 0,
  writtenOff: 0,
  writtenOffGp: 0,
});

type ReleaseRow = {
  quantity: number;
  operationType: string;
  createdAt: Date;
  operDate: Date;
  items: unknown;
  setSku: string | null;
  storageId: string | null;
};

/** Усі документи дня (незалежно від SKU): завантажуються один раз і кешуються. */
type DayContext = {
  start: Date;
  endExclusive: Date;
  shipments: ShipmentContext;
  storageIds: InventoryStorageIds;
  kitReleases: ReleaseRow[];
  returns: Array<{ items: string }>;
  writeoffs: Array<{ items: string; storageId: string | null }>;
  movements: Array<{ sourceWarehouse: string; destinationWarehouse: string; items: string }> | null;
  portionsPerBoxBySku: Map<string, number>;
};

async function loadDayContext(dayKeyYmd: string): Promise<DayContext | null> {
  const bounds = kyivDayRangeExclusiveFromYmd(dayKeyYmd);
  if (!bounds) return null;
  const { start, endExclusive } = bounds;

  const storageIds = await loadInventoryStorageIds();
  const { smallStorageId, mainStorageId } = storageIds;

  const [shipments, kitReleases, returns, writeoffs, movements] = await Promise.all([
    // Події відвантаження за день: кожен документ sale окремо, склад циклу (order_shipments)
    loadShipmentContext({ start, end: new Date(endExclusive.getTime() - 1) }),
    prisma.warehouseReleaseSet.findMany({
      where: {
        status: { not: 'deleted' },
        operationType: { in: ['kit', 'unkit'] },
        OR: [
          { operDate: { gte: start, lt: endExclusive } },
          { createdAt: { gte: start, lt: endExclusive } },
        ],
      },
      select: { quantity: true, operationType: true, createdAt: true, operDate: true, items: true, setSku: true, storageId: true },
    }),
    prisma.warehouseReturnHistory.findMany({
      where: {
        OR: [
          { returnDate: { gte: start, lt: endExclusive } },
          { AND: [{ returnDate: null }, { createdAt: { gte: start, lt: endExclusive } }] },
        ],
      },
      select: { items: true },
    }),
    prisma.warehouseWriteOffHistory.findMany({
      where: {
        OR: [
          { writeOffDate: { gte: start, lt: endExclusive } },
          { AND: [{ writeOffDate: null }, { createdAt: { gte: start, lt: endExclusive } }] },
        ],
      },
      select: { items: true, storageId: true },
    }),
    prisma.warehouseMovement
      .findMany({
        where: {
          status: { not: 'deleted' },
          movementDate: { gte: start, lt: endExclusive },
          OR: [
            { sourceWarehouse: { in: [smallStorageId, mainStorageId] } },
            { destinationWarehouse: { in: [smallStorageId, mainStorageId] } },
          ],
        },
        select: { sourceWarehouse: true, destinationWarehouse: true, items: true },
      })
      // ігноруємо помилки переміщень (як і раніше)
      .catch(() => null),
  ]);

  let portionsPerBoxBySku = new Map<string, number>();
  if (movements && movements.length > 0) {
    const movementSkus = new Set<string>();
    for (const movement of movements) {
      for (const s of collectItemSkus(safeParseItems(movement.items))) movementSkus.add(s);
    }
    portionsPerBoxBySku = await loadPortionsPerBoxBySku(movementSkus).catch(() => new Map<string, number>());
  }

  return {
    start,
    endExclusive,
    shipments,
    storageIds,
    kitReleases: kitReleases as ReleaseRow[],
    returns,
    writeoffs,
    movements,
    portionsPerBoxBySku,
  };
}

/** Рухи одного SKU з уже завантаженого контексту дня (без звернень до БД). */
export function computeSkuDayMovements(ctx: DayContext, normalizedSku: string): ProductHistoryDayMovements {
  const { start, endExclusive, storageIds } = ctx;
  const { smallStorageId, mainStorageId } = storageIds;
  const { orders, cachedItemsByExternalId, productDescriptors } = ctx.shipments;

  let shipped = 0;
  for (const order of orders) {
    const cachedItems = cachedItemsByExternalId.get(order.reportKey) ?? null;
    shipped += computeShippedQuantityForSku({ ...order, items: order.items ?? null }, cachedItems, normalizedSku, productDescriptors);
  }

  let kit = 0;
  let kitGp = 0;
  const kitDetails: ProductHistoryDayMovements['kitDetails'] = [];
  const addKitToStorage = (storageId: string | null | undefined, signedQty: number) => {
    if (!signedQty) return;
    if (resolveKitStorage(storageId, storageIds) === 'ms') kit += signedQty;
    else kitGp += signedQty;
  };

  for (const release of ctx.kitReleases) {
    const operationDate = getReleaseOperationDate(release);
    if (operationDate < start || operationDate >= endExclusive) continue;

    const isUnkit = release.operationType === 'unkit';
    const releaseSetSku = String(release.setSku ?? '').trim();

    if (releaseSetSku === normalizedSku) {
      const quantity = Number(release.quantity) || 0;
      addKitToStorage(release.storageId, isUnkit ? -quantity : quantity);
      continue;
    }

    const componentQty = getComponentQtyFromRelease(release.items, normalizedSku, Number(release.quantity) || 0);
    if (componentQty === 0) continue;
    const signedQuantity = isUnkit ? componentQty : -componentQty;
    addKitToStorage(release.storageId, signedQuantity);
    kitDetails.push({
      setSku: releaseSetSku || '–',
      setName: getSetNameFromRelease(release.items),
      operationType: isUnkit ? 'unkit' : 'kit',
      quantity: componentQty,
      signedQuantity,
      storage: resolveKitStorage(release.storageId, storageIds),
    });
  }

  const returned = sumQuantityForSku(ctx.returns, normalizedSku);

  let writtenOff = 0;
  let writtenOffGp = 0;
  for (const row of ctx.writeoffs) {
    const qty = sumQuantityForSku([row], normalizedSku);
    if (qty <= 0) continue;
    const resolvedStorage = row.storageId || smallStorageId;
    if (resolvedStorage === mainStorageId) writtenOffGp += qty;
    else writtenOff += qty;
  }

  let moved = 0;
  let movedGp = 0;
  for (const movement of ctx.movements ?? []) {
    let qty = 0;
    for (const it of safeParseItems(movement.items)) {
      const item = it as Record<string, unknown>;
      if (String(item.sku ?? '').trim() !== normalizedSku) continue;
      qty += calcMovementItemQty(item, ctx.portionsPerBoxBySku);
    }
    if (qty === 0) continue;
    if (movement.destinationWarehouse === smallStorageId) moved += qty;
    if (movement.sourceWarehouse === smallStorageId) moved -= qty;
    if (movement.destinationWarehouse === mainStorageId) movedGp += qty;
    if (movement.sourceWarehouse === mainStorageId) movedGp -= qty;
  }

  return { kit, kitGp, kitDetails, shipped, moved, movedGp, returned, writtenOff, writtenOffGp };
}

// ---------------------------------------------------------------------------
// Кеш контексту дня: перший рядок історії вантажить день, наступні рядки беруть з памʼяті.
// Свіжі дні (сьогодні, вчора) живуть коротко, бо документи ще проводяться.
// TTL налаштовується в «Налаштування комплектування замовлень» (`inventory_history_cache`).
// ---------------------------------------------------------------------------

const MAX_CACHED_DAYS = 120;

const dayContextCache = new Map<string, { expiresAt: number; promise: Promise<DayContext | null> }>();

function isRecentDay(dayKeyYmd: string): boolean {
  const yesterday = kyivYmd(new Date(Date.now() - 24 * 60 * 60 * 1000));
  return dayKeyYmd >= yesterday;
}

async function getDayContext(dayKeyYmd: string): Promise<DayContext | null> {
  const now = Date.now();
  const cached = dayContextCache.get(dayKeyYmd);
  if (cached && cached.expiresAt > now) return cached.promise;

  const settings = await getInventoryHistoryCacheSettings();
  const ttlMinutes = isRecentDay(dayKeyYmd) ? settings.recentDayTtlMinutes : settings.pastDayTtlMinutes;
  // Повторна перевірка: поки читали налаштування, паралельний запит міг уже почати завантаження
  const raced = dayContextCache.get(dayKeyYmd);
  if (raced && raced.expiresAt > Date.now()) return raced.promise;

  const promise = loadDayContext(dayKeyYmd);
  // TTL 0: кеш вимкнено, але паралельні запити того самого дня все одно ділять одне завантаження
  const ttlMs = ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : 0;
  dayContextCache.set(dayKeyYmd, { expiresAt: ttlMs > 0 ? now + ttlMs : Number.POSITIVE_INFINITY, promise });
  if (ttlMs === 0) {
    void promise.finally(() => {
      if (dayContextCache.get(dayKeyYmd)?.promise === promise) dayContextCache.delete(dayKeyYmd);
    }).catch(() => undefined);
  }
  // Помилку не кешуємо: наступний запит спробує ще раз
  promise.catch(() => {
    if (dayContextCache.get(dayKeyYmd)?.promise === promise) dayContextCache.delete(dayKeyYmd);
  });

  if (dayContextCache.size > MAX_CACHED_DAYS) {
    for (const [key, entry] of dayContextCache) {
      if (entry.expiresAt <= now || dayContextCache.size > MAX_CACHED_DAYS) dayContextCache.delete(key);
      if (dayContextCache.size <= MAX_CACHED_DAYS) break;
    }
  }
  return promise;
}

/** Скинути кеш (усі дні або один `YYYY-MM-DD`), напр. після проведення документа. */
export function invalidateInventoryDayMovementsCache(dayKeyYmd?: string): void {
  if (dayKeyYmd) dayContextCache.delete(dayKeyYmd);
  else dayContextCache.clear();
}

/** Рухи за календарний день Kyiv для одного SKU. */
export async function computeInventoryProductHistoryDayMovements(
  normalizedSku: string,
  dayKeyYmd: string,
): Promise<ProductHistoryDayMovements> {
  try {
    const ctx = await getDayContext(dayKeyYmd);
    return ctx ? computeSkuDayMovements(ctx, normalizedSku) : emptyMovements();
  } catch {
    return emptyMovements();
  }
}
