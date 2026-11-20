import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/utils.js', () => ({ prisma: {}, logServer: () => {} }));

import type { CatalogOpsProduct } from './CatalogOpsLookup.js';
import { CatalogOpsCache, buildCatalogOpsIndex } from './CatalogOpsCache.js';

function product(over: Partial<CatalogOpsProduct>): CatalogOpsProduct {
  const at = new Date('2026-01-01T00:00:00Z');
  return {
    id: 0,
    sku: '01001',
    name: 'Борщ',
    costPerItem: 100,
    currency: 'UAH',
    categoryId: 1,
    categoryName: 'Перші страви',
    set: null,
    additionalPrices: null,
    stockBalanceByStock: { '1': 5, '2': 1 },
    stockBalanceByStockRaw: '{"1":5,"2":1}',
    dilovodId: '1100300000000001',
    parent: '1100300000000100',
    lastSyncAt: at,
    createdAt: at,
    updatedAt: at,
    weight: 420,
    manualOrder: 10,
    unitRatio: 1,
    barcode: null,
    barcodes: [],
    isOutdated: false,
    portionsPerBox: 24,
    ...over,
  };
}

describe('buildCatalogOpsIndex', () => {
  it('indexes by lowercase sku and Dilovod id, without raw stock field', () => {
    const p = product({ sku: 'AbC-1', dilovodId: '1100300000000009' });
    const map = buildCatalogOpsIndex([p], ({ stockBalanceByStockRaw: _raw, ...rest }) => rest);
    expect(map.get('abc-1')?.sku).toBe('AbC-1');
    expect(map.get('1100300000000009')).toBe(map.get('abc-1'));
    expect(map.get('abc-1')).not.toHaveProperty('stockBalanceByStockRaw');
  });

  it('keeps component without sku reachable by Dilovod id (sku = id)', () => {
    const p = product({ sku: '1100300000000042', dilovodId: '1100300000000042' });
    const map = buildCatalogOpsIndex([p], (x) => x);
    expect(map.size).toBe(1);
    expect(map.get('1100300000000042')?.dilovodId).toBe('1100300000000042');
  });

  it('first record wins on key collision', () => {
    const a = product({ sku: 'X1', dilovodId: '1', name: 'A' });
    const b = product({ sku: 'x1', dilovodId: '2', name: 'B' });
    const map = buildCatalogOpsIndex([a, b], (x) => x);
    expect(map.get('x1')?.name).toBe('A');
    expect(map.get('2')?.name).toBe('B');
  });
});

describe('CatalogOpsCache', () => {
  it('serves snapshot within TTL and reloads after it', async () => {
    let now = 1_000;
    const loader = vi.fn(async () => [product({})]);
    const cache = new CatalogOpsCache(loader, 100, () => now);

    expect(cache.getSync('01001')).toBeNull();
    expect((await cache.get('01001'))?.name).toBe('Борщ');
    expect(cache.getSync(' 01001 ')?.name).toBe('Борщ');
    now += 50;
    await cache.get('01001');
    expect(loader).toHaveBeenCalledTimes(1);
    now += 100;
    await cache.get('01001');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent reloads', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const loader = vi.fn(async () => { await gate; return [product({})]; });
    const cache = new CatalogOpsCache(loader);
    const pending = Promise.all([cache.getMap(), cache.get('01001'), cache.getMap()]);
    release();
    const [m1, , m2] = await pending;
    expect(loader).toHaveBeenCalledTimes(1);
    expect(m1).toBe(m2);
  });

  it('invalidate forces reload; snapshot loaded during invalidate is not kept', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      if (calls === 1) await gate;
      return [product({ name: `v${calls}` })];
    });
    const cache = new CatalogOpsCache(loader);
    const first = cache.get('01001');
    cache.invalidate();
    release();
    expect((await first)?.name).toBe('v1');
    expect(cache.getSync('01001')).toBeNull();
    expect((await cache.get('01001'))?.name).toBe('v2');
  });

  it('returns null for empty key without loading', async () => {
    const loader = vi.fn(async () => []);
    const cache = new CatalogOpsCache(loader);
    expect(await cache.get('  ')).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });
});
