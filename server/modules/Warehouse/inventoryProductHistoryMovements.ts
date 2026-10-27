import { prisma } from '../../lib/utils.js';
import {
  collectSkusFromOrders,
  computeShippedQuantityForSku,
  getReportProductDescriptors,
  recomputeSetPortions,
  sumQuantityForSku,
} from '../../services/orderShipmentMetricsService.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import { kyivDayRangeExclusiveFromYmd } from '../../../shared/utils/kyivDateTime.js';
import { safeParseItems } from './historyNormalize.js';

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

/** Рухи за календарний день Kyiv для одного SKU. */
export async function computeInventoryProductHistoryDayMovements(
  normalizedSku: string,
  dayKeyYmd: string,
): Promise<ProductHistoryDayMovements> {
  const bounds = kyivDayRangeExclusiveFromYmd(dayKeyYmd);
  if (!bounds) return emptyMovements();

  const { start: startOfDay, endExclusive: endOfDay } = bounds;

  try {
    const orders = await prisma.order.findMany({
      where: { dilovodSaleExportDate: { gte: startOfDay, lt: endOfDay } },
      select: { externalId: true, payloadData: true, items: true },
    });

    const orderExternalIds = orders.map((o) => o.externalId).filter(Boolean);
    let shipped = 0;
    if (orderExternalIds.length > 0) {
      const caches = await prisma.ordersCache.findMany({
        where: { externalId: { in: orderExternalIds } },
        select: { externalId: true, processedItems: true },
      });

      const cachedItemsByExternalId = new Map<
        string,
        Array<{ sku?: string; name?: string; orderedQuantity?: number; quantity?: number }>
      >();
      for (const cache of caches) {
        if (!cache.processedItems) continue;
        try {
          const parsed = JSON.parse(cache.processedItems);
          if (Array.isArray(parsed)) {
            cachedItemsByExternalId.set(cache.externalId, parsed);
          }
        } catch {
          // ignore malformed cache
        }
      }

      const allSkus = collectSkusFromOrders(orders, cachedItemsByExternalId, true);
      const productDescriptors = await getReportProductDescriptors(allSkus);
      recomputeSetPortions(productDescriptors);

      for (const order of orders) {
        const cachedItems = cachedItemsByExternalId.get(order.externalId) ?? null;
        shipped += computeShippedQuantityForSku(order, cachedItems, normalizedSku, productDescriptors);
      }
    }

    const [smallStorageSetting, mainStorageSetting] = await Promise.all([
      prisma.settingsBase.findUnique({ where: { key: 'dilovod_small_storage_id' } }),
      prisma.settingsBase.findUnique({ where: { key: 'dilovod_main_storage_id' } }),
    ]);
    const smallStorageId = smallStorageSetting?.value || '1100700000001019';
    const mainStorageId = mainStorageSetting?.value || '1100700000001005';

    const kitReleases = await prisma.warehouseReleaseSet.findMany({
      where: {
        status: { not: 'deleted' },
        operationType: { in: ['kit', 'unkit'] },
        OR: [
          { operDate: { gte: startOfDay, lt: endOfDay } },
          { createdAt: { gte: startOfDay, lt: endOfDay } },
        ],
      },
      select: {
        quantity: true,
        operationType: true,
        createdAt: true,
        operDate: true,
        items: true,
        setSku: true,
        storageId: true,
      },
    });

    const getReleaseOperationDate = (release: {
      operDate: Date | null;
      createdAt: Date;
      items: unknown;
    }): Date => {
      const items = Array.isArray(release.items) ? release.items : safeParseItems(release.items);
      const first = items[0] as { operationDate?: string; operation_date?: string } | undefined;
      const operationDateRaw = release.operDate || first?.operationDate || first?.operation_date || null;
      return operationDateRaw ? new Date(operationDateRaw) : release.createdAt;
    };

    const getSetNameFromRelease = (releaseItems: unknown): string | null => {
      const items = Array.isArray(releaseItems) ? releaseItems : safeParseItems(releaseItems);
      const first = items[0] as { name?: string; title?: string; setName?: string } | undefined;
      const name = first?.name ?? first?.title ?? first?.setName ?? null;
      return name ? String(name).trim() || null : null;
    };

    const getComponentQtyFromRelease = (releaseItems: unknown, sku: string, setQuantity: number): number => {
      const items = Array.isArray(releaseItems) ? releaseItems : safeParseItems(releaseItems);
      let total = 0;
      for (const setItem of items) {
        if (!setItem || typeof setItem !== 'object') continue;
        const quantityMode =
          String((setItem as { components_quantity_mode?: unknown }).components_quantity_mode ?? '')
            .toLowerCase() === 'total'
            ? 'total'
            : 'per_set';
        const itemSetQty = Number((setItem as { quantity?: unknown }).quantity ?? setQuantity) || setQuantity || 0;
        const compsRaw =
          (setItem as { components_snapshot?: unknown; componentsSnapshot?: unknown }).components_snapshot ??
          (setItem as { componentsSnapshot?: unknown }).componentsSnapshot ??
          [];
        if (!Array.isArray(compsRaw)) continue;
        for (const component of compsRaw) {
          if (!component || typeof component !== 'object') continue;
          const componentSku = String(
            (component as { sku?: unknown; id?: unknown }).sku ??
              (component as { id?: unknown }).id ??
              '',
          ).trim();
          if (componentSku !== sku) continue;
          const rawQty = Number(
            (component as { quantity?: unknown; qty?: unknown }).quantity ??
              (component as { qty?: unknown }).qty ??
              0,
          );
          if (!Number.isFinite(rawQty) || rawQty === 0) continue;
          total += quantityMode === 'total' ? rawQty : rawQty * itemSetQty;
        }
      }
      return total;
    };

    let kit = 0;
    let kitGp = 0;
    const kitDetails: ProductHistoryDayMovements['kitDetails'] = [];

    const resolveKitStorage = (storageId: string | null | undefined): 'ms' | 'gp' => {
      const resolved = storageId || mainStorageId;
      return resolved === smallStorageId ? 'ms' : 'gp';
    };

    const addKitToStorage = (storageId: string | null | undefined, signedQty: number) => {
      if (!signedQty) return;
      if (resolveKitStorage(storageId) === 'ms') kit += signedQty;
      else kitGp += signedQty;
    };

    for (const release of kitReleases) {
      const operationDate = getReleaseOperationDate(release);
      if (operationDate < startOfDay || operationDate >= endOfDay) continue;

      const isUnkit = release.operationType === 'unkit';
      const releaseSetSku = String(release.setSku ?? '').trim();

      if (releaseSetSku === normalizedSku) {
        const quantity = Number(release.quantity) || 0;
        addKitToStorage(release.storageId, isUnkit ? -quantity : quantity);
        continue;
      }

      const componentQty = getComponentQtyFromRelease(
        release.items,
        normalizedSku,
        Number(release.quantity) || 0,
      );
      if (componentQty === 0) continue;
      const signedQuantity = isUnkit ? componentQty : -componentQty;
      addKitToStorage(release.storageId, signedQuantity);
      kitDetails.push({
        setSku: releaseSetSku || '—',
        setName: getSetNameFromRelease(release.items),
        operationType: isUnkit ? 'unkit' : 'kit',
        quantity: componentQty,
        signedQuantity,
        storage: resolveKitStorage(release.storageId),
      });
    }

    const returns = await prisma.warehouseReturnHistory.findMany({
      where: {
        OR: [
          { returnDate: { gte: startOfDay, lt: endOfDay } },
          { AND: [{ returnDate: null }, { createdAt: { gte: startOfDay, lt: endOfDay } }] },
        ],
      },
      select: { items: true },
    });

    const writeoffs = await prisma.warehouseWriteOffHistory.findMany({
      where: {
        OR: [
          { writeOffDate: { gte: startOfDay, lt: endOfDay } },
          { AND: [{ writeOffDate: null }, { createdAt: { gte: startOfDay, lt: endOfDay } }] },
        ],
      },
      select: { items: true, storageId: true },
    });

    const returned = sumQuantityForSku(returns, normalizedSku);

    let writtenOff = 0;
    let writtenOffGp = 0;
    for (const row of writeoffs) {
      const qty = sumQuantityForSku([row], normalizedSku);
      if (qty <= 0) continue;
      const resolvedStorage = row.storageId || smallStorageId;
      if (resolvedStorage === mainStorageId) writtenOffGp += qty;
      else writtenOff += qty;
    }

    let moved = 0;
    let movedGp = 0;
    try {
      const movements = await prisma.warehouseMovement.findMany({
        where: {
          status: { not: 'deleted' },
          movementDate: { gte: startOfDay, lt: endOfDay },
          OR: [
            { sourceWarehouse: { in: [smallStorageId, mainStorageId] } },
            { destinationWarehouse: { in: [smallStorageId, mainStorageId] } },
          ],
        },
        select: { sourceWarehouse: true, destinationWarehouse: true, items: true },
      });

      const movementSkus = new Set<string>();
      for (const movement of movements) {
        const items = safeParseItems(movement.items);
        for (const it of items) {
          const s = String((it as { sku?: string }).sku ?? '').trim();
          if (s) movementSkus.add(s);
        }
      }
      let portionsPerBoxBySku = new Map<string, number>();
      if (movementSkus.size > 0) {
        const found = await catalogOpsLookup.getBySkus([...movementSkus]);
        portionsPerBoxBySku = new Map(
          catalogOpsLookup.listUnique(found).map((p) => [p.sku, Number(p.portionsPerBox) || 1]),
        );
      }

      const calcMovementQty = (item: Record<string, unknown>): number => {
        const itemSku = String(item.sku ?? '').trim();
        if (itemSku !== normalizedSku) return 0;
        if (typeof item.totalPortions === 'number' && item.totalPortions !== 0) {
          return item.totalPortions;
        }
        const ppb = portionsPerBoxBySku.get(itemSku) ?? 1;
        const portions = Number(item.portionQuantity) || 0;
        const boxes = Number(item.boxQuantity) || 0;
        return portions + boxes * ppb;
      };

      for (const movement of movements) {
        const items = safeParseItems(movement.items);
        let qty = 0;
        for (const it of items) {
          qty += calcMovementQty(it as Record<string, unknown>);
        }
        if (qty === 0) continue;

        if (movement.destinationWarehouse === smallStorageId) moved += qty;
        if (movement.sourceWarehouse === smallStorageId) moved -= qty;
        if (movement.destinationWarehouse === mainStorageId) movedGp += qty;
        if (movement.sourceWarehouse === mainStorageId) movedGp -= qty;
      }
    } catch {
      // ігноруємо помилки переміщень
    }

    return {
      kit,
      kitGp,
      kitDetails,
      shipped,
      moved,
      movedGp,
      returned,
      writtenOff,
      writtenOffGp,
    };
  } catch {
    return emptyMovements();
  }
}
