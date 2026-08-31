/** Спільний in-memory кеш товарів для комплектації (flatten + рядки чек-листа). */

const cache = new Map<string, unknown>();

export function productCacheKey(sku: string): string {
  return String(sku || '').trim().toLowerCase();
}

export function getCachedProduct<T = any>(sku: string): T | undefined {
  const key = productCacheKey(sku);
  if (!key) return undefined;
  return cache.get(key) as T | undefined;
}

export function setCachedProduct(sku: string, product: unknown): void {
  if (!product || typeof product !== 'object') return;
  const row = product as { sku?: string; dilovodId?: string };
  const keys = [sku, row.sku, row.dilovodId]
    .map((value) => productCacheKey(String(value || '')))
    .filter(Boolean);
  for (const key of keys) cache.set(key, product);
}

export function seedCachedProducts(products: Record<string, unknown>): void {
  for (const [key, product] of Object.entries(products)) {
    if (product) setCachedProduct(key, product);
  }
}
