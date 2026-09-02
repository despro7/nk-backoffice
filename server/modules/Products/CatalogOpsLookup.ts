/**
 * Операційний lookup товарів з catalog_* (сумісна форма legacy `products`).
 * `products` лишається кешем; читачі мають ходити сюди.
 */

import { prisma } from '../../lib/utils.js';
import { productOpsCache } from './ProductOpsCache.js';
import {
  CATALOG_FINISHED_PRODUCTS_FOLDER_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
  CATALOG_TRASH_ID,
} from '../../../shared/types/catalog.js';
import { DEFAULT_DILOVOD_CONFIG, getPriceTypeNameById } from '../../services/dilovod/DilovodUtils.js';
import { isArchiveFolderName, isKitAccPolicy } from './ProductsTypes.js';
import { collectBarcodeCodes, pickPrimaryBarcode } from './barcodeUtils.js';

export interface CatalogOpsSetItem {
  id: string;
  name?: string;
  quantity: number;
}

export interface CatalogOpsProduct {
  id: number;
  sku: string;
  name: string;
  costPerItem: number | null;
  currency: string;
  categoryId: number | null;
  categoryName: string | null;
  set: CatalogOpsSetItem[] | null;
  additionalPrices: Array<{ priceType: string; priceValue: string }> | null;
  stockBalanceByStock: Record<string, number> | null;
  stockBalanceByStockRaw: string | null;
  dilovodId: string;
  parent: string | null;
  lastSyncAt: Date;
  createdAt: Date;
  updatedAt: Date;
  weight: number | null;
  manualOrder: number | null;
  unitRatio: number | null;
  barcode: string | null;
  barcodes: string[];
  isOutdated: boolean;
  portionsPerBox: number;
}

/** Без description/fullDescription — flatten не тягне TEXT на кожен рядок. */
const opsSelect = {
  id: true,
  parentId: true,
  isGroup: true,
  name: true,
  sku: true,
  packageRatio: true,
  weight: true,
  accPolicyId: true,
  sortOrder: true,
  unitRatio: true,
  stockBalanceByStock: true,
  syncedAt: true,
  createdAt: true,
  updatedAt: true,
  prices: { select: { priceType: true, price: true, currency: true } },
  barcodes: {
    select: { code: true, goodPart: true },
    orderBy: { id: 'asc' as const },
  },
} as const;

type CatalogGoodOpsRow = Awaited<
  ReturnType<typeof prisma.catalogGood.findMany<{ select: typeof opsSelect }>>
>[number];

type CatalogRow = CatalogGoodOpsRow & {
  components: Array<{
    qty: number;
    componentGoodId: string;
    componentGood: { sku: string | null; name: string } | null;
  }>;
};


function weightKgToGrams(weightKg: number | null | undefined): number | null {
  if (weightKg == null || Number.isNaN(Number(weightKg))) return null;
  return Math.round(Number(weightKg) * 1000);
}

function parseStock(raw: string | null | undefined): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function categoryIdFromName(name: string | null): number | null {
  if (!name) return null;
  const map = DEFAULT_DILOVOD_CONFIG.categoriesMap as Record<string, number>;
  if (map[name] != null) return map[name];
  const lower = name.trim().toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (key.trim().toLowerCase() === lower) return value;
  }
  return null;
}

function mapSet(row: CatalogRow): CatalogOpsSetItem[] | null {
  // Лише облікова політика «комплект». Рецептура звичайного товару (spec/BOM) — не set.
  if (!isKitAccPolicy(row.accPolicyId)) return null;
  const items = row.components.map((c) => ({
    id: (c.componentGood?.sku?.trim() || c.componentGoodId).trim(),
    name: c.componentGood?.name,
    quantity: Number(c.qty) || 0,
  })).filter((item) => item.id && item.quantity > 0);
  return items.length > 0 ? items : [];
}

function mapPrices(row: CatalogRow): {
  costPerItem: number | null;
  additionalPrices: Array<{ priceType: string; priceValue: string }> | null;
  currency: string;
} {
  let costPerItem: number | null = null;
  const additional: Array<{ priceType: string; priceValue: string }> = [];
  let currency = 'UAH';
  for (const p of row.prices) {
    if (p.currency) currency = p.currency;
    if (p.priceType === CATALOG_PRICE_TYPE_RETAIL_ID) {
      costPerItem = Number(p.price) || 0;
    } else if (Number(p.price) > 0) {
      additional.push({
        priceType: getPriceTypeNameById(p.priceType),
        priceValue: String(p.price),
      });
    }
  }
  return {
    costPerItem,
    additionalPrices: additional.length > 0 ? additional : null,
    currency,
  };
}

function pickBarcode(row: CatalogRow): string | null {
  return pickPrimaryBarcode(row.barcodes);
}

function toOpsProduct(
  row: CatalogRow,
  parentById: Map<string, { name: string; isGroup: boolean }>,
  cacheIdBySku: Map<string, number>,
): CatalogOpsProduct | null {
  if (row.isGroup) return null;
  // Компоненти BOM часто без productNum — тоді ключ = Dilovod id (як у legacy set[].id)
  const sku = row.sku?.trim() || row.id;
  const parent = row.parentId ? parentById.get(row.parentId) : undefined;
  const categoryName = parent?.name ?? null;
  const isOutdated = Boolean(parent?.isGroup && isArchiveFolderName(parent.name));
  const prices = mapPrices(row);
  const set = mapSet(row);
  const stockObj = parseStock(row.stockBalanceByStock);
  const portionsPerBox =
    row.packageRatio != null && !Number.isNaN(Number(row.packageRatio))
      ? Math.max(1, Math.round(Number(row.packageRatio)))
      : 1;
  return {
    id: cacheIdBySku.get(sku) ?? 0,
    sku,
    name: row.name,
    costPerItem: prices.costPerItem,
    currency: prices.currency,
    categoryId: categoryIdFromName(categoryName),
    categoryName,
    set,
    additionalPrices: prices.additionalPrices,
    stockBalanceByStock: stockObj,
    stockBalanceByStockRaw: row.stockBalanceByStock,
    dilovodId: row.id,
    parent: row.parentId,
    lastSyncAt: row.syncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    weight: weightKgToGrams(row.weight),
    manualOrder: row.sortOrder ?? 0,
    unitRatio: row.unitRatio ?? 1,
    barcode: pickBarcode(row),
    barcodes: collectBarcodeCodes(row.barcodes),
    isOutdated,
    portionsPerBox,
  };
}

function uniqueOps(map: Map<string, CatalogOpsProduct>): CatalogOpsProduct[] {
  const seen = new Set<string>();
  const out: CatalogOpsProduct[] = [];
  for (const p of map.values()) {
    if (seen.has(p.sku)) continue;
    seen.add(p.sku);
    out.push(p);
  }
  return out;
}

function indexOps(products: CatalogOpsProduct[]): Map<string, CatalogOpsProduct> {
  const map = new Map<string, CatalogOpsProduct>();
  for (const p of products) {
    map.set(p.sku, p);
    map.set(p.sku.toLowerCase(), p);
    if (p.dilovodId) {
      map.set(p.dilovodId, p);
      map.set(p.dilovodId.toLowerCase(), p);
    }
  }
  return map;
}

export class CatalogOpsLookup {
  listUnique(map: Map<string, CatalogOpsProduct>): CatalogOpsProduct[] {
    return uniqueOps(map);
  }

  async getBySkus(skus: string[]): Promise<Map<string, CatalogOpsProduct>> {
    const unique = [...new Set(skus.map((s) => String(s).trim()).filter(Boolean))];
    if (unique.length === 0) return new Map();

    // Два індексні запити замість OR. Якщо всі ключі схожі на Dilovod id — лише PK.
    const allLookLikeDilovodId = unique.every((s) => /^\d{10,}$/.test(s));
    const [bySku, byId] = allLookLikeDilovodId
      ? [[], await prisma.catalogGood.findMany({
          where: { isGroup: false, id: { in: unique } },
          select: opsSelect,
        })]
      : await Promise.all([
          prisma.catalogGood.findMany({
            where: { isGroup: false, sku: { in: unique } },
            select: opsSelect,
          }),
          prisma.catalogGood.findMany({
            where: { isGroup: false, id: { in: unique } },
            select: opsSelect,
          }),
        ]);
    const merged = new Map<string, CatalogGoodOpsRow>();
    for (const row of bySku) merged.set(row.id, row);
    for (const row of byId) merged.set(row.id, row);
    return indexOps(await this.hydrate([...merged.values()]));
  }

  async getBySku(sku: string): Promise<CatalogOpsProduct | null> {
    const map = await this.getBySkus([sku]);
    const key = sku.trim();
    return map.get(key) ?? map.get(key.toLowerCase()) ?? null;
  }

  async getByDilovodIds(ids: string[]): Promise<Map<string, CatalogOpsProduct>> {
    const unique = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await prisma.catalogGood.findMany({
      where: { isGroup: false, id: { in: unique } },
      select: opsSelect,
    });
    const products = await this.hydrate(rows);
    return new Map(products.map((p) => [p.dilovodId, p]));
  }

  private async resolveFinishedProductFolderIds(): Promise<string[]> {
    const folderIds = new Set<string>([CATALOG_FINISHED_PRODUCTS_FOLDER_ID]);
    let frontier = [CATALOG_FINISHED_PRODUCTS_FOLDER_ID];
    while (frontier.length > 0) {
      const children = await prisma.catalogGood.findMany({
        where: { isGroup: true, parentId: { in: frontier }, id: { not: CATALOG_TRASH_ID } },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (folderIds.has(child.id)) continue;
        folderIds.add(child.id);
        frontier.push(child.id);
      }
    }
    return [...folderIds];
  }

  async listFinishedProducts(options?: { includeOutdated?: boolean }): Promise<CatalogOpsProduct[]> {
    const parentIds = await this.resolveFinishedProductFolderIds();
    const rows = await prisma.catalogGood.findMany({
      where: { isGroup: false, parentId: { in: parentIds }, NOT: { sku: null } },
      select: opsSelect,
    });
    const products = await this.hydrate(rows);
    const filtered = options?.includeOutdated ? products : products.filter((p) => !p.isOutdated);
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    return filtered;
  }

  async search(params: {
    search?: string;
    category?: string;
    showOutdated?: boolean;
    skip?: number;
    take?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ products: CatalogOpsProduct[]; total: number }> {
    const all = await this.listFinishedProducts({ includeOutdated: params.showOutdated === true });
    let filtered = all;
    const q = params.search?.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    if (params.category) {
      const parts = params.category.split(',').map((s) => s.trim()).filter(Boolean);
      const numericIds = parts.map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));
      const names = parts.filter((p) => Number.isNaN(parseInt(p, 10)));
      filtered = filtered.filter((p) => {
        const byId = numericIds.length > 0 && p.categoryId != null && numericIds.includes(p.categoryId);
        const byName = names.length > 0 && p.categoryName != null && names.includes(p.categoryName);
        return byId || byName;
      });
    }
    const sortBy = params.sortBy || 'lastSyncAt';
    const dir = params.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortBy];
      const bv = (b as unknown as Record<string, unknown>)[sortBy];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv, 'uk') * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
      return 0;
    });
    const total = filtered.length;
    const skip = params.skip ?? 0;
    const take = params.take ?? 20;
    return { products: filtered.slice(skip, skip + take), total };
  }

  async getStats() {
    const all = await this.listFinishedProducts({ includeOutdated: true });
    const outdated = all.filter((p) => p.isOutdated);
    const sets = all.filter((p) => Array.isArray(p.set) && p.set.length > 0);
    const outdatedSets = sets.filter((p) => p.isOutdated);
    const dishes = all.filter((p) => !p.set || p.set.length === 0);
    const byCategory = new Map<string, { count: number; activeCount: number }>();
    for (const p of all) {
      const name = p.categoryName || 'Без категорії';
      const cur = byCategory.get(name) ?? { count: 0, activeCount: 0 };
      cur.count += 1;
      if (!p.isOutdated) cur.activeCount += 1;
      byCategory.set(name, cur);
    }
    const lastSync = all.reduce<Date | null>((acc, p) => {
      if (!acc || p.lastSyncAt > acc) return p.lastSyncAt;
      return acc;
    }, null);
    const categoriesWithActive = [...byCategory.entries()].map(([name, v]) => ({
      name,
      count: v.count,
      activeCount: v.activeCount,
    }));
    return {
      totalProducts: all.length,
      outdatedProducts: outdated.length,
      activeProducts: all.length - outdated.length,
      totalSets: sets.length,
      outdatedSets: outdatedSets.length,
      totalDishes: dishes.length,
      outdatedDishes: dishes.filter((p) => p.isOutdated).length,
      lastSyncAt: lastSync,
      categoriesWithActive,
      activeCategoriesTotal: categoriesWithActive.filter((c) => c.activeCount > 0).length,
    };
  }

  async getCategoryMapping(): Promise<Record<string, number>> {
    const all = await this.listFinishedProducts({ includeOutdated: true });
    const mapping: Record<string, number> = {};
    for (const p of all) {
      if (p.categoryName && p.categoryId && mapping[p.categoryName] == null) {
        mapping[p.categoryName] = p.categoryId;
      }
    }
    return mapping;
  }

  async listGoodsDict(): Promise<Array<{ id: number; good_id: string; productNum: string; name: string | null; parent: string | null }>> {
    const all = await this.listFinishedProducts({ includeOutdated: true });
    return all.map((p) => ({
      id: p.id,
      good_id: p.dilovodId,
      productNum: p.sku,
      name: p.name,
      parent: p.parent,
    }));
  }

  toApiShape(p: CatalogOpsProduct) {
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      costPerItem: p.costPerItem,
      currency: p.currency,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      set: p.set,
      additionalPrices: p.additionalPrices,
      stockBalanceByStock: p.stockBalanceByStock,
      dilovodId: p.dilovodId,
      parent: p.parent,
      lastSyncAt: p.lastSyncAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      weight: p.weight,
      manualOrder: p.manualOrder,
      unitRatio: p.unitRatio,
      barcode: p.barcode,
      barcodes: p.barcodes,
      isOutdated: p.isOutdated,
      portionsPerBox: p.portionsPerBox,
    };
  }

  async applyStockBalances(
    items: Array<{ sku: string; mainStorage: number; smallStorage: number }>
  ): Promise<{ updated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;
    let skipped = 0;
    const map = await this.getBySkus(items.map((i) => i.sku));
    const toUpdate: Array<{ sku: string; json: string; dilovodId: string }> = [];
    for (const item of items) {
      const p = map.get(item.sku) ?? map.get(item.sku.toLowerCase());
      if (!p) {
        skipped += 1;
        continue;
      }
      const existing = p.stockBalanceByStock;
      if (existing && (existing['1'] ?? 0) === item.mainStorage && (existing['2'] ?? 0) === item.smallStorage) {
        skipped += 1;
        continue;
      }
      toUpdate.push({
        sku: p.sku,
        dilovodId: p.dilovodId,
        json: JSON.stringify({ '1': item.mainStorage, '2': item.smallStorage }),
      });
    }
    const CHUNK = 25;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK);
      try {
        await prisma.$transaction([
          ...chunk.map((item) =>
            prisma.catalogGood.update({
              where: { id: item.dilovodId },
              data: { stockBalanceByStock: item.json },
            })
          ),
          ...chunk.map((item) =>
            prisma.product.updateMany({
              where: { sku: item.sku },
              data: { stockBalanceByStock: item.json },
            })
          ),
        ]);
        updated += chunk.length;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    productOpsCache.invalidate();
    return { updated, skipped, errors };
  }

  async deductSmallStock(deductions: Map<string, number>): Promise<void> {
    if (deductions.size === 0) return;
    const map = await this.getBySkus([...deductions.keys()]);
    for (const [sku, qty] of deductions) {
      const p = map.get(sku) ?? map.get(sku.toLowerCase());
      if (!p) continue;
      const stock = { ...(p.stockBalanceByStock ?? {}) };
      const current = Number(stock['2']) || 0;
      const next = Math.max(0, current - qty);
      if (next === current) continue;
      stock['2'] = next;
      const json = JSON.stringify(stock);
      await prisma.catalogGood.update({
        where: { id: p.dilovodId },
        data: { stockBalanceByStock: json },
      });
      await prisma.product.updateMany({
        where: { sku: p.sku },
        data: { stockBalanceByStock: json },
      });
    }
    productOpsCache.invalidate();
  }

  async projectToProductsCache(skus?: string[]): Promise<{
    success: boolean;
    message: string;
    syncedProducts: number;
    syncedSets: number;
    createdProducts: number;
    updatedProducts: number;
    skippedProducts: number;
    errors: string[];
  }> {
    const list = skus?.length
      ? [...(await this.getBySkus(skus)).values()].filter((p, i, arr) => arr.findIndex((x) => x.sku === p.sku) === i)
      : await this.listFinishedProducts({ includeOutdated: true });
    let created = 0;
    let updated = 0;
    let syncedSets = 0;
    const errors: string[] = [];

    for (const p of list) {
      try {
        const data = {
          name: p.name,
          costPerItem: p.costPerItem,
          currency: p.currency,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          set: p.set && p.set.length > 0 ? JSON.stringify(p.set) : null,
          additionalPrices: p.additionalPrices ? JSON.stringify(p.additionalPrices) : null,
          stockBalanceByStock: p.stockBalanceByStockRaw,
          dilovodId: p.dilovodId,
          parent: p.parent,
          weight: p.weight,
          manualOrder: p.manualOrder ?? 0,
          unitRatio: p.unitRatio ?? 1,
          barcode: p.barcode,
          isOutdated: p.isOutdated,
          portionsPerBox: p.portionsPerBox,
          lastSyncAt: new Date(),
        };
        const existing = await prisma.product.findUnique({ where: { sku: p.sku }, select: { id: true } });
        if (existing) {
          await prisma.product.update({ where: { sku: p.sku }, data });
          updated += 1;
        } else {
          await prisma.product.create({ data: { sku: p.sku, ...data } });
          created += 1;
        }
        if (p.set && p.set.length > 0) syncedSets += 1;
      } catch (err) {
        errors.push(`${p.sku}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const catalogSkus = new Set(list.map((p) => p.sku));
    if (!skus?.length && catalogSkus.size > 0) {
      await prisma.product.updateMany({
        where: { sku: { notIn: [...catalogSkus] } },
        data: { isOutdated: true },
      });
    }

    const syncedProducts = created + updated;
    productOpsCache.invalidate();
    return {
      success: errors.length === 0,
      message: `Оброблено ${list.length} товарів з каталогу (створено ${created}, оновлено ${updated})`,
      syncedProducts,
      syncedSets,
      createdProducts: created,
      updatedProducts: updated,
      skippedProducts: 0,
      errors,
    };
  }

  async projectGood(goodId: string): Promise<void> {
    const row = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: opsSelect,
    });
    if (!row || row.isGroup || !row.sku) return;
    const [p] = await this.hydrate([row]);
    if (!p) return;
    await this.projectToProductsCache([p.sku]);
  }

  private async hydrate(rows: CatalogGoodOpsRow[]): Promise<CatalogOpsProduct[]> {
    if (rows.length === 0) return [];
    const parentIds = [...new Set(rows.map((r) => r.parentId).filter((id): id is string => Boolean(id)))];
    const kitIds = rows.filter((r) => isKitAccPolicy(r.accPolicyId)).map((r) => r.id);
    const skus = rows.map((r) => r.sku).filter((s): s is string => Boolean(s));

    const [parents, kitComps, cache] = await Promise.all([
      parentIds.length
        ? prisma.catalogGood.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, name: true, isGroup: true },
          })
        : Promise.resolve([]),
      kitIds.length
        ? prisma.catalogGoodComponent.findMany({
            where: { parentGoodId: { in: kitIds } },
            orderBy: { rowNum: 'asc' },
            include: { componentGood: { select: { sku: true, name: true } } },
          })
        : Promise.resolve([]),
      skus.length
        ? prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } })
        : Promise.resolve([]),
    ]);

    const byParent = new Map<string, CatalogRow['components']>();
    for (const c of kitComps) {
      const list = byParent.get(c.parentGoodId) ?? [];
      list.push({
        qty: c.qty,
        componentGoodId: c.componentGoodId,
        componentGood: c.componentGood,
      });
      byParent.set(c.parentGoodId, list);
    }
    const parentById = new Map(parents.map((p) => [p.id, p]));
    const cacheIdBySku = new Map(cache.map((c) => [c.sku, c.id]));
    return rows
      .map((row) =>
        toOpsProduct(
          { ...row, components: byParent.get(row.id) ?? [] },
          parentById,
          cacheIdBySku,
        ),
      )
      .filter((p): p is CatalogOpsProduct => p !== null);
  }
}

export const catalogOpsLookup = new CatalogOpsLookup();
