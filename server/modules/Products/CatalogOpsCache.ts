/**
 * Операційний знімок товарів для комплектації з `catalog_*` (без читання legacy `products`).
 * Замінив `ProductOpsCache` (лишився невикористаним до видалення): той самий API (`get` / `getSync` / `getMap` / `invalidate`)
 * і TTL, але джерело: `catalogOpsLookup.listAllLeavesForOps()`.
 * Форма значень = `catalogOpsLookup.toApiShape` (як у fallback-гілці `expandService`).
 */

import { logServer } from '../../lib/utils.js';
import { catalogOpsLookup, type CatalogOpsProduct } from './CatalogOpsLookup.js';

const SNAPSHOT_TTL_MS = 120_000;

export type CatalogOpsCachedProduct = ReturnType<typeof catalogOpsLookup.toApiShape>;

type Loader = () => Promise<CatalogOpsProduct[]>;

function indexKey(value: string | null | undefined): string | null {
  const k = String(value || '').trim().toLowerCase();
  return k || null;
}

/** Індекс за sku і Dilovod id (lowercase). Перший запис для ключа виграє. */
export function buildCatalogOpsIndex(
  products: CatalogOpsProduct[],
  toShape: (p: CatalogOpsProduct) => CatalogOpsCachedProduct,
): Map<string, CatalogOpsCachedProduct> {
  const byKey = new Map<string, CatalogOpsCachedProduct>();
  for (const p of products) {
    const shaped = toShape(p);
    for (const key of [indexKey(p.sku), indexKey(p.dilovodId)]) {
      if (key && !byKey.has(key)) byKey.set(key, shaped);
    }
  }
  return byKey;
}

export class CatalogOpsCache {
  private snapshot: { loadedAt: number; byKey: Map<string, CatalogOpsCachedProduct> } | null = null;
  private inflight: Promise<Map<string, CatalogOpsCachedProduct>> | null = null;
  private generation = 0;

  constructor(
    private readonly loader: Loader = () => catalogOpsLookup.listAllLeavesForOps(),
    private readonly ttlMs: number = SNAPSHOT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.snapshot = null;
    this.generation += 1;
  }

  getSync(sku: string): CatalogOpsCachedProduct | null {
    const key = indexKey(sku);
    if (!key || !this.snapshot) return null;
    return this.snapshot.byKey.get(key) ?? null;
  }

  async get(sku: string): Promise<CatalogOpsCachedProduct | null> {
    const key = indexKey(sku);
    if (!key) return null;
    const map = await this.getMap();
    return map.get(key) ?? null;
  }

  async getMap(): Promise<Map<string, CatalogOpsCachedProduct>> {
    if (this.snapshot && this.now() - this.snapshot.loadedAt < this.ttlMs) {
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

  private async reload(): Promise<Map<string, CatalogOpsCachedProduct>> {
    const t0 = this.now();
    const generation = this.generation;
    const products = await this.loader();
    const byKey = buildCatalogOpsIndex(products, (p) => catalogOpsLookup.toApiShape(p));
    // invalidate() під час завантаження: знімок міг застаріти, не кешуємо його.
    if (generation === this.generation) {
      this.snapshot = { loadedAt: this.now(), byKey };
    }
    logServer(
      `CatalogOpsCache: goods=${products.length}, keys=${byKey.size}, time=${this.now() - t0}ms`,
    );
    return byKey;
  }
}

export const catalogOpsCache = new CatalogOpsCache();
