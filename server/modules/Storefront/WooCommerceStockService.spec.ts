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
    getProductById.mockResolvedValue({ id: 99, stock_quantity: 8 });
    batchUpdateProducts.mockResolvedValue({ update: [] });
  });

  it('computeEffectiveStock sums GP+MO and subtracts active order portions', () => {
    expect(computeEffectiveStock({ '1': 470, '2': 102 }, 0)).toBe(572);
    expect(computeEffectiveStock({ '1': 1395, '2': 58 }, 13)).toBe(1440);
    expect(computeEffectiveStock({ '2': 10 }, 2)).toBe(8);
    expect(computeEffectiveStock({ '2': 1 }, 5)).toBe(0);
    expect(computeEffectiveStock({ '1': 100, '2': 50 }, 30)).toBe(120);
  });

  it('pushes balance minus active order portions as instock', async () => {
    vi.mocked(prisma.catalogGood.findFirst).mockResolvedValue({
      id: 'good-1',
      wooProductId: 77,
    } as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      wooProductId: 77,
    } as never);
    getProductById.mockResolvedValue({ id: 77, stock_quantity: 3 });

    const result = await service.syncStock({ skus: ['SKU-1'], mode: 'wc_only' });
    expect(result.updated).toBe(1);
    expect(batchUpdateProducts).toHaveBeenCalledWith([
      expect.objectContaining({ id: 77, stock_quantity: 8, stock_status: 'instock' }),
    ]);
  });

  it('pushes outofstock when active orders consume the whole balance', async () => {
    const { catalogOpsLookup } = await import('../Products/CatalogOpsLookup.js');
    vi.mocked(catalogOpsLookup.listFinishedProducts).mockResolvedValueOnce([
      { sku: 'SKU-1', set: [], stockBalanceByStock: { '2': 1 } },
    ] as never);
    vi.mocked(prisma.catalogGood.findFirst).mockResolvedValue({
      id: 'good-1',
      wooProductId: 77,
    } as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      wooProductId: 77,
    } as never);
    getProductById.mockResolvedValue({ id: 77, stock_quantity: 3 });

    await service.syncStock({ skus: ['SKU-1'], mode: 'wc_only' });
    expect(batchUpdateProducts).toHaveBeenCalledWith([
      expect.objectContaining({ id: 77, stock_quantity: 0, stock_status: 'outofstock' }),
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
});
