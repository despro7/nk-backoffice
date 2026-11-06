import { prisma, logServer } from '../../lib/utils.js';
import { getFinishedProductsFolderIds } from '../Products/catalogFinishedProductsFolder.js';
import { productsDilovodGateway } from '../Products/ProductsDilovodGateway.js';
import type { StockSnapshotCatalogMeta } from '../../../shared/types/warehouse.js';

export interface SnapshotCatalogGood {
  id: string;
  sku: string | null;
  mainUnitId: string | null;
  parentId: string | null;
}

/**
 * Ключ `stock-snapshot` (SKU або Dilovod id для товарів без SKU) → товар каталогу.
 * Збіг за SKU має пріоритет над збігом за id.
 */
export function matchSnapshotKeys(
  keys: string[],
  goods: SnapshotCatalogGood[],
): Map<string, { good: SnapshotCatalogGood; byId: boolean }> {
  const bySku = new Map<string, SnapshotCatalogGood>();
  const byId = new Map<string, SnapshotCatalogGood>();
  for (const good of goods) {
    const sku = good.sku?.trim();
    if (sku && !bySku.has(sku)) bySku.set(sku, good);
    byId.set(good.id, good);
  }
  const result = new Map<string, { good: SnapshotCatalogGood; byId: boolean }>();
  for (const key of keys) {
    const skuMatch = bySku.get(key);
    if (skuMatch) {
      result.set(key, { good: skuMatch, byId: false });
      continue;
    }
    const idMatch = byId.get(key);
    if (idMatch) result.set(key, { good: idMatch, byId: true });
  }
  return result;
}

/**
 * Довідка по товарах для `stock-snapshot`: Dilovod id, SKU, гілка, одиниця.
 * `idKeys`: ключі, що є Dilovod id товару (залишки треба питати за id, не за SKU).
 */
export async function resolveSnapshotCatalogMeta(keys: string[]): Promise<{
  meta: Record<string, StockSnapshotCatalogMeta>;
  idKeys: string[];
}> {
  if (keys.length === 0) return { meta: {}, idKeys: [] };
  const goods = await prisma.catalogGood.findMany({
    where: { isGroup: false, OR: [{ sku: { in: keys } }, { id: { in: keys } }] },
    select: { id: true, sku: true, mainUnitId: true, parentId: true },
  });
  const matches = matchSnapshotKeys(keys, goods);
  if (matches.size === 0) return { meta: {}, idKeys: [] };

  const [finishedFolderIds, units] = await Promise.all([
    getFinishedProductsFolderIds(),
    productsDilovodGateway.fetchCachedDict('units').catch((error) => {
      logServer('[stock-snapshot] units dict failed', error);
      return [] as Array<{ id: string; name: string }>;
    }),
  ]);
  const unitNameById = new Map<string, string>(
    units.map((u): [string, string] => [String(u.id), String(u.name ?? '').trim()]),
  );

  const meta: Record<string, StockSnapshotCatalogMeta> = {};
  const idKeys: string[] = [];
  for (const [key, { good, byId }] of matches) {
    meta[key] = {
      dilovodId: good.id,
      sku: good.sku?.trim() || null,
      isFinishedProduct: !!good.parentId && finishedFolderIds.has(good.parentId),
      unitName: (good.mainUnitId && unitNameById.get(good.mainUnitId)) || null,
    };
    if (byId) idKeys.push(key);
  }
  return { meta, idKeys };
}
