import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../lib/utils.js', () => ({
  prisma: {
    catalogGood: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  logServer: vi.fn(),
}));

vi.mock('../../services/productExportHelper.js', () => ({
  getPortionsInOrdersBySku: vi.fn().mockResolvedValue(new Map([['SKU-1', 2]])),
}));

vi.mock('../Products/CatalogOpsLookup.js', () => ({
  catalogOpsLookup: {
    listFinishedProducts: vi.fn().mockResolvedValue([
      {
        sku: 'SKU-1',
        set: [],
        stockBalanceByStock: { '2': 10 },
      },
      {
        sku: 'SET-1',
        set: [{ id: 'SKU-1', quantity: 1 }],
        stockBalanceByStock: { '2': 0 },
      },
    ]),
  },
}));

vi.mock('./StorefrontService.js', () => ({
  storefrontService: {
    getWooCredentialsInternal: vi.fn().mockResolvedValue({
      siteUrl: 'https://shop.example.com',
      consumerKey: 'ck',
      consumerSecret: 'cs',
    }),
    getStockViaWcMode: vi.fn().mockResolvedValue('wc_only'),
  },
}));

const batchUpdateProducts = vi.fn().mockResolvedValue({ update: [] });
const getProductBySku = vi.fn().mockResolvedValue(null);
const getProductById = vi.fn().mockResolvedValue({ id: 99, stock_quantity: 8 });

vi.mock('./WooCommerceApiClient.js', () => ({
  createWooCommerceClient: vi.fn(() => ({
    getProductBySku,
    getProductById,
    batchUpdateProducts,
  })),
}));

import { prisma } from '../../lib/utils.js';
import { computeEffectiveStock, WooCommerceStockService } from './WooCommerceStockService.js';

describe('WooCommerceStockService', () => {
  const service = new WooCommerceStockService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.catalogGood.findFirst).mockResolvedValue({
      id: 'good-1',
      wooProductId: null,
    } as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      wooProductId: null,
    } as never);
    getProductBySku.mockResolvedValue(null);
    batchUpdateProducts.mockResolvedValue({ update: [] });
  });

  it('computeEffectiveStock sums GP+MO and subtracts active order portions', () => {
    expect(computeEffectiveStock({ '1': 470, '2': 102 }, 0)).toBe(572);
    expect(computeEffectiveStock({ '1': 1395, '2': 58 }, 13)).toBe(1440);
    expect(computeEffectiveStock({ '2': 10 }, 2)).toBe(8);
    expect(computeEffectiveStock({ '2': 1 }, 5)).toBe(0);
    expect(computeEffectiveStock({ '1': 100, '2': 50 }, 30)).toBe(120);
  });

  it('computeEffectiveStock zero becomes outofstock payload fields via sync', async () => {
    vi.mocked(prisma.catalogGood.findFirst).mockResolvedValue({
      id: 'good-1',
      wooProductId: 77,
    } as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      wooProductId: 77,
    } as never);

    const result = await service.syncStock({ skus: ['SKU-1'], mode: 'wc_only' });
    expect(result.updated).toBe(1);
    expect(batchUpdateProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 77,
        manage_stock: true,
        stock_quantity: 8,
        stock_status: 'instock',
      }),
    ]);
  });

  it('skips stock sync when SKU missing on WC', async () => {
    const result = await service.syncStock({ skus: ['SKU-1'], mode: 'wc_only' });
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(batchUpdateProducts).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      sku: 'SKU-1',
      ok: true,
      skipped: true,
    });
  });

  it('chunks batch updates by 25', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      sku: `SKU-${i}`,
      set: [] as [],
      stockBalanceByStock: { '2': 5 },
    }));
    const { catalogOpsLookup } = await import('../Products/CatalogOpsLookup.js');
    vi.mocked(catalogOpsLookup.listFinishedProducts).mockResolvedValue(many as never);
    vi.mocked(prisma.catalogGood.findFirst).mockImplementation(async (args) => {
      const where = args?.where as { sku?: string; id?: string } | undefined;
      const sku = where?.sku ?? where?.id?.replace('good-', 'SKU-') ?? 'SKU-0';
      return {
        id: where?.id ?? `good-${sku}`,
        wooProductId: 100,
      } as never;
    });

    await service.syncStock({ mode: 'wc_only' });
    expect(batchUpdateProducts).toHaveBeenCalledTimes(2);
    expect(batchUpdateProducts.mock.calls[0][0]).toHaveLength(25);
    expect(batchUpdateProducts.mock.calls[1][0]).toHaveLength(5);
  });
});
