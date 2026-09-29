import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../services/dilovod/DilovodUtils.js', () => ({
  getDilovodConfigFromDB: vi.fn().mockResolvedValue({
    categoriesMap: {
      Салати: 20,
    },
  }),
}));

import { getDilovodConfigFromDB } from '../../services/dilovod/DilovodUtils.js';
import {
  WooCommerceCategoryService,
  categoryFieldConflict,
  resolveWcPrimaryCategoryName,
} from './WooCommerceCategoryService.js';
import type { WooCommerceApiClient } from './WooCommerceApiClient.js';

describe('WooCommerceCategoryService helpers', () => {
  it('resolveWcPrimaryCategoryName returns first category name', () => {
    expect(
      resolveWcPrimaryCategoryName({
        categories: [{ name: 'Салати' }, { name: 'Інше' }],
      }),
    ).toBe('Салати');
  });

  it('categoryFieldConflict detects mismatch between BO group and WC category', () => {
    expect(categoryFieldConflict('Салати', 'Другі страви')).toEqual({
      field: 'category',
      localValue: 'Салати',
      remoteValue: 'Другі страви',
    });
  });

  it('categoryFieldConflict returns null when names match case-insensitively', () => {
    expect(categoryFieldConflict('Салати', 'салати')).toBeNull();
  });

  it('categoryFieldConflict flags missing WC category when BO group exists', () => {
    expect(categoryFieldConflict('Салати', null)).toEqual({
      field: 'category',
      localValue: 'Салати',
      remoteValue: null,
    });
  });
});

describe('WooCommerceCategoryService.resolveCategoryId', () => {
  const service = new WooCommerceCategoryService();

  beforeEach(() => {
    service.clearCache();
    vi.clearAllMocks();
  });

  it('uses dilovod categoriesMap before WooCommerce API', async () => {
    const client = {
      findProductCategoryByName: vi.fn(),
      createProductCategory: vi.fn(),
    } as unknown as WooCommerceApiClient;

    const id = await service.resolveCategoryId(client, 'Салати');

    expect(id).toBe(20);
    expect(client.findProductCategoryByName).not.toHaveBeenCalled();
    expect(client.createProductCategory).not.toHaveBeenCalled();
  });

  it('searches WooCommerce when mapping is missing', async () => {
    vi.mocked(getDilovodConfigFromDB).mockResolvedValueOnce({ categoriesMap: {} } as never);
    const client = {
      findProductCategoryByName: vi.fn().mockResolvedValue({ id: 33, name: 'Напої', slug: 'napoi' }),
      createProductCategory: vi.fn(),
    } as unknown as WooCommerceApiClient;

    const id = await service.resolveCategoryId(client, 'Напої');

    expect(id).toBe(33);
    expect(client.createProductCategory).not.toHaveBeenCalled();
  });

  it('creates WooCommerce category when not found', async () => {
    vi.mocked(getDilovodConfigFromDB).mockResolvedValueOnce({ categoriesMap: {} } as never);
    const client = {
      findProductCategoryByName: vi.fn().mockResolvedValue(null),
      createProductCategory: vi.fn().mockResolvedValue({ id: 99, name: 'Новинки', slug: 'novynky' }),
    } as unknown as WooCommerceApiClient;

    const id = await service.resolveCategoryId(client, 'Новинки');

    expect(id).toBe(99);
    expect(client.createProductCategory).toHaveBeenCalledWith({ name: 'Новинки' });
  });
});
