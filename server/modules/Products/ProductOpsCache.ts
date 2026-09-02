/**
 * Операційний знімок товарів для комплектації: products + залишки/BOM комплектів з каталогу.
 * Один завантажувальний round-trip на TTL, далі lookup у пам'яті.
 */

import { prisma, logServer } from '../../lib/utils.js';
import { CATALOG_ACC_POLICY_KIT } from '../../../shared/types/catalog.js';
import { collectBarcodeCodes, pickPrimaryBarcode } from './barcodeUtils.js';

const SNAPSHOT_TTL_MS = 120_000;

function parseJsonField(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const productSelect = {
  id: true,
  sku: true,
  name: true,
  costPerItem: true,
  currency: true,
  categoryId: true,
  categoryName: true,
  set: true,
  dilovodId: true,
  parent: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
  weight: true,
  manualOrder: true,
  unitRatio: true,
  barcode: true,
  isOutdated: true,
  portionsPerBox: true,
  stockBalanceByStock: true,
} as const;

export type OpsCachedProduct = {
  id: number;
  sku: string;
  name: string;
  costPerItem: number | null;
  currency: string;
  categoryId: number | null;
  categoryName: string | null;
  set: Array<{ id: string; name?: string; quantity: number }> | null;
  additionalPrices: null;
  dilovodId: string | null;
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
  stockBalanceByStock: Record<string, number> | null;
};

function parseStock(raw: string | null | undefined): Record<string, number> | null {
  const parsed = parseJsonField(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as Record<string, number>;
}

function parseSet(raw: string | null | undefined): OpsCachedProduct['set'] {
  const parsed = parseJsonField(raw);
  return Array.isArray(parsed) ? (parsed as OpsCachedProduct['set']) : null;
}

function indexKey(value: string | null | undefined): string | null {
  const k = String(value || '').trim().toLowerCase();
  return k || null;
}

function put(map: Map<string, OpsCachedProduct>, product: OpsCachedProduct): void {
  const skuKey = indexKey(product.sku);
  if (skuKey) map.set(skuKey, product);
  const idKey = indexKey(product.dilovodId);
  if (idKey) map.set(idKey, product);
}

class ProductOpsCache {
  private snapshot: { loadedAt: number; byKey: Map<string, OpsCachedProduct> } | null = null;
  private inflight: Promise<Map<string, OpsCachedProduct>> | null = null;

  invalidate(): void {
    this.snapshot = null;
  }

  getSync(sku: string): OpsCachedProduct | null {
    const key = indexKey(sku);
    if (!key || !this.snapshot) return null;
    return this.snapshot.byKey.get(key) ?? null;
  }

  async get(sku: string): Promise<OpsCachedProduct | null> {
    const map = await this.getMap();
    const key = indexKey(sku);
    if (!key) return null;
    return map.get(key) ?? null;
  }

  async getMap(): Promise<Map<string, OpsCachedProduct>> {
    if (this.snapshot && Date.now() - this.snapshot.loadedAt < SNAPSHOT_TTL_MS) {
      return this.snapshot.byKey;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.reload();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async reload(): Promise<Map<string, OpsCachedProduct>> {
    const t0 = Date.now();
    const rows = await prisma.product.findMany({ select: productSelect });
    const dilovodIds = rows.map((r) => r.dilovodId).filter((id): id is string => Boolean(id));

    const [catalogStocks, kits, catalogBarcodes] = await Promise.all([
      dilovodIds.length
        ? prisma.catalogGood.findMany({
            where: { id: { in: dilovodIds } },
            select: { id: true, stockBalanceByStock: true },
          })
        : Promise.resolve([]),
      prisma.catalogGood.findMany({
        where: { isGroup: false, accPolicyId: CATALOG_ACC_POLICY_KIT },
        select: {
          id: true,
          sku: true,
          stockBalanceByStock: true,
          components: {
            orderBy: { rowNum: 'asc' },
            select: {
              qty: true,
              componentGoodId: true,
              componentGood: { select: { sku: true, name: true } },
            },
          },
        },
      }),
      dilovodIds.length
        ? prisma.catalogGoodBarcode.findMany({
            where: { goodId: { in: dilovodIds } },
            select: { goodId: true, code: true, goodPart: true },
            orderBy: { id: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const stockByCatalogId = new Map(
      catalogStocks.map((row) => [row.id, parseStock(row.stockBalanceByStock)]),
    );
    const kitById = new Map(kits.map((kit) => [kit.id, kit]));
    const kitBySku = new Map(
      kits.filter((kit) => kit.sku).map((kit) => [String(kit.sku).trim().toLowerCase(), kit]),
    );
    const barcodesByGood = new Map<string, Array<{ code: string; goodPart: string }>>();
    for (const row of catalogBarcodes) {
      const list = barcodesByGood.get(row.goodId) ?? [];
      list.push({ code: row.code, goodPart: row.goodPart });
      barcodesByGood.set(row.goodId, list);
    }

    const byKey = new Map<string, OpsCachedProduct>();
    for (const row of rows) {
      const kit = (row.dilovodId && kitById.get(row.dilovodId)) || kitBySku.get(row.sku.trim().toLowerCase());
      const catalogStock =
        (row.dilovodId ? stockByCatalogId.get(row.dilovodId) : null) ||
        (kit ? parseStock(kit.stockBalanceByStock) : null);
      const setFromKit = kit
        ? kit.components
            .map((c) => ({
              id: (c.componentGood?.sku?.trim() || c.componentGoodId).trim(),
              name: c.componentGood?.name,
              quantity: Number(c.qty) || 0,
            }))
            .filter((item) => item.id && item.quantity > 0)
        : null;

      const parsed: OpsCachedProduct = {
        id: row.id,
        sku: row.sku,
        name: row.name,
        costPerItem: row.costPerItem,
        currency: row.currency,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        set: setFromKit && setFromKit.length > 0 ? setFromKit : parseSet(row.set),
        additionalPrices: null,
        dilovodId: row.dilovodId,
        parent: row.parent,
        lastSyncAt: row.lastSyncAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        weight: row.weight,
        manualOrder: row.manualOrder,
        unitRatio: row.unitRatio,
        barcode: (row.dilovodId && pickPrimaryBarcode(barcodesByGood.get(row.dilovodId) ?? [])) || row.barcode,
        barcodes: collectBarcodeCodes(
          row.dilovodId ? (barcodesByGood.get(row.dilovodId) ?? []) : [],
          row.barcode,
        ),
        isOutdated: row.isOutdated,
        portionsPerBox: row.portionsPerBox,
        stockBalanceByStock: catalogStock ?? parseStock(row.stockBalanceByStock),
      };
      put(byKey, parsed);
    }

    this.snapshot = { loadedAt: Date.now(), byKey };
    logServer(
      `ProductOpsCache: products=${rows.length}, kits=${kits.length}, keys=${byKey.size}, time=${Date.now() - t0}ms`,
    );
    return byKey;
  }
}

export const productOpsCache = new ProductOpsCache();
