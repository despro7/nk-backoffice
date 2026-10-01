import { describe, expect, it, vi, beforeEach } from 'vitest';
import { STOREFRONT_DEFAULT_BLOCKS } from '../../../shared/constants/storefrontDefaults.js';

vi.mock('../../lib/utils.js', () => ({
  prisma: {
    catalogGood: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    catalogGoodPrice: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    catalogGoodImage: {
      count: vi.fn(),
    },
  },
  logServer: vi.fn(),
}));

vi.mock('./WooCommerceMediaService.js', () => ({
  wooCommerceMediaService: {
    pullProductImages: vi.fn().mockResolvedValue({ goodId: 'good-1', imported: 1, replaced: false, errors: [] }),
    uploadProductImages: vi.fn().mockResolvedValue({ goodId: 'good-1', uploaded: [], errors: [] }),
  },
}));

vi.mock('./StorefrontService.js', () => ({
  storefrontService: {
    getWooCredentialsConfigured: vi.fn().mockResolvedValue({
      siteUrl: 'https://shop.example.com',
      consumerKey: 'ck',
      consumerSecret: 'cs',
    }),
    getWooCredentialsInternal: vi.fn().mockResolvedValue({
      siteUrl: 'https://shop.example.com',
      consumerKey: 'ck',
      consumerSecret: 'cs',
    }),
    getSettings: vi.fn().mockResolvedValue({ metaKeys: [] }),
    getPreset: vi.fn(),
    getDefaultPreset: vi.fn().mockResolvedValue({ blocks: STOREFRONT_DEFAULT_BLOCKS }),
  },
}));

vi.mock('../Products/ProductsDilovodGateway.js', () => ({
  productsDilovodGateway: {
    savePrice: vi.fn().mockResolvedValue(undefined),
    saveObject: vi.fn().mockResolvedValue({ id: 'good-1' }),
  },
}));

vi.mock('./WooCommerceApiClient.js', () => ({
  createWooCommerceClient: vi.fn(() => ({
    getProductBySku: vi.fn().mockResolvedValue({
      id: 77,
      sku: 'SKU-1',
      name: 'Test',
      description: '<p>Склад: вода.</p>',
      short_description: 'short',
      regular_price: '10',
      weight: '0.3',
      stock_quantity: 5,
      status: 'publish',
      meta_data: [],
      images: [{ id: 501, src: 'https://shop.example.com/img.jpg', name: 'photo' }],
      categories: [{ id: 21, name: 'Другі страви', slug: 'drugi-stravy' }],
    }),
    getProductById: vi.fn(),
    updateProduct: vi.fn().mockResolvedValue({ id: 77 }),
  })),
}));

vi.mock('./WooCommerceCategoryService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./WooCommerceCategoryService.js')>();
  return {
    ...actual,
    wooCommerceCategoryService: {
      resolveCategoryId: vi.fn().mockResolvedValue(20),
      clearCache: vi.fn(),
    },
  };
});

import { prisma } from '../../lib/utils.js';
import { productsDilovodGateway } from '../Products/ProductsDilovodGateway.js';
import { WooCommerceSyncService } from './WooCommerceSyncService.js';

describe('WooCommerceSyncService', () => {
  const service = new WooCommerceSyncService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pullPreview detects conflicts when local fullDescription exists', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Локальна назва',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: '<p>local</p>',
      description: 'local short',
      weight: 0.2,
      doNotPublish: false,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      images: [],
      prices: [{ priceType: '1101300000001001', price: 85 }],
    } as never);

    const preview = await service.pullPreview('good-1');

    expect(preview.wooProductId).toBe(77);
    expect(preview.conflicts.some((c) => c.field === 'name')).toBe(true);
    expect(preview.proposed.name).toBe('Test');
    expect(preview.conflicts.some((c) => c.field === 'fullDescription')).toBe(true);
    expect(preview.proposed.fullDescription).toContain('Склад');
    expect(preview.local.weight).toBe(0.2);
    expect(preview.local.regularPrice).toBe('85');
    expect(preview.conflicts.some((c) => c.field === 'regularPrice')).toBe(true);
  });

  it('pullApply updates name when selected', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Стара назва',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      doNotPublish: false,
      images: [],
      prices: [],
    } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const result = await service.pullApply({
      goodId: 'good-1',
      apply: { name: true, wooProductId: true },
    });

    expect(result.appliedFields).toContain('name');
    expect(prisma.catalogGood.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'good-1' },
        data: expect.objectContaining({
          name: 'Test',
        }),
      }),
    );
  });

  it('pullApply updates only selected fields', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      doNotPublish: false,
      images: [],
      prices: [],
    } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const result = await service.pullApply({
      goodId: 'good-1',
      apply: { fullDescription: true, wooProductId: true },
    });

    expect(result.appliedFields).toContain('fullDescription');
    expect(result.appliedFields).toContain('wooProductId');
    expect(prisma.catalogGood.update).toHaveBeenCalledOnce();
  });

  it('pullPreview treats empty HTML short description as missing and uses marketing fallback', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: '<p></p>',
      weight: null,
      doNotPublish: false,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      images: [],
      prices: [],
    } as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p class="storefront-marketing">Маркетинговий текст.</p><p>Склад: вода.</p>',
        short_description: '<p></p>',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
      }),
      getProductById: vi.fn(),
    } as never);

    const preview = await service.pullPreview('good-1');

    expect(preview.proposed.shortDescription).toBe('<p>Маркетинговий текст.</p>');
    expect(preview.conflicts.some((c) => c.field === 'description')).toBe(false);
  });

  it('pullPreview uses WooCommerce price when regular_price is empty', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      doNotPublish: false,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      images: [],
      prices: [],
    } as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p>Маркетинговий текст.</p>',
        short_description: '',
        regular_price: '',
        price: '129.50',
        weight: '',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
      }),
      getProductById: vi.fn(),
    } as never);

    const preview = await service.pullPreview('good-1');

    expect(preview.proposed.regularPrice).toBe('129.5');
    expect(preview.proposed.shortDescription).toBe('<p>Маркетинговий текст.</p>');
  });

  it('pullPreview ignores numeric formatting differences in price conflict', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      doNotPublish: false,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      images: [],
      prices: [{ priceType: '1101300000001001', price: 85 }],
    } as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '',
        short_description: '',
        regular_price: '85.00',
        weight: '',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
      }),
      getProductById: vi.fn(),
    } as never);

    const preview = await service.pullPreview('good-1');

    expect(preview.conflicts.some((c) => c.field === 'regularPrice')).toBe(false);
  });

  it('pullApply auto-applies short description when storefront doc is imported and local short is empty', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      doNotPublish: false,
      images: [],
      prices: [],
    } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p class="storefront-marketing">Маркетинговий текст.</p><p>Склад: вода.</p>',
        short_description: '',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
      }),
      getProductById: vi.fn(),
    } as never);

    const result = await service.pullApply({
      goodId: 'good-1',
      apply: { storefrontDescriptionDoc: true, wooProductId: true },
    });

    expect(result.appliedFields).toContain('storefrontDescriptionDoc');
    expect(result.appliedFields).toContain('shortDescription');
    expect(prisma.catalogGood.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'good-1' },
        data: expect.objectContaining({
          description: '<p>Маркетинговий текст.</p>',
        }),
      }),
    );
    expect(productsDilovodGateway.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        header: expect.objectContaining({
          id: 'good-1',
          description: { uk: '<p>Маркетинговий текст.</p>', ru: '<p>Маркетинговий текст.</p>' },
        }),
      }),
    );
  });

  it('pullApply syncs short description to Dilovod when explicitly selected', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Товар',
      parentId: 'group-1',
      isGroup: false,
      accPolicyId: 'policy-1',
      mainUnitId: 'unit-1',
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      doNotPublish: false,
      images: [],
      prices: [],
    } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p>Склад: вода.</p>',
        short_description: '<p>Короткий з WC</p>',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
      }),
      getProductById: vi.fn(),
    } as never);

    const result = await service.pullApply({
      goodId: 'good-1',
      apply: { shortDescription: true, wooProductId: true },
    });

    expect(result.appliedFields).toContain('shortDescription');
    expect(productsDilovodGateway.saveObject).toHaveBeenCalledWith({
      header: {
        id: 'good-1',
        name: { uk: 'Товар', ru: 'Товар' },
        parent: 'group-1',
        isGroup: 0,
        productNum: 'SKU-1',
        mainUnit: 'unit-1',
        accPolicy: 'policy-1',
        description: { uk: '<p>Короткий з WC</p>', ru: '<p>Короткий з WC</p>' },
      },
    });
  });

  it('pullBulkApply applies short description from bulk matrix', async () => {
    vi.mocked(prisma.catalogGood.findMany).mockResolvedValue([
      { id: 'good-1', sku: 'SKU-1', name: 'Товар' },
    ] as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Товар',
      parentId: null,
      isGroup: false,
      accPolicyId: null,
      mainUnitId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      doNotPublish: false,
      images: [],
      prices: [],
    } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p>Склад: вода.</p>',
        short_description: '<p>Короткий з WC</p>',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
        categories: [],
      }),
      getProductById: vi.fn(),
      updateProduct: vi.fn(),
    } as never);

    const result = await service.pullBulkApply([
      {
        goodId: 'good-1',
        action: 'pull',
        apply: { shortDescription: true, wooProductId: true },
      },
    ]);

    expect(result.results[0]?.ok).toBe(true);
    expect(result.results[0]?.appliedFields).toContain('shortDescription');
    expect(prisma.catalogGood.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: '<p>Короткий з WC</p>',
        }),
      }),
    );
    expect(productsDilovodGateway.saveObject).toHaveBeenCalled();
  });

  it('pullApply updates retail and regular prices when regularPrice selected', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      doNotPublish: false,
      images: [],
      prices: [{ priceType: '1101300000001001', price: 85 }],
    } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);
    vi.mocked(prisma.catalogGoodPrice.upsert).mockResolvedValue({} as never);

    const result = await service.pullApply({
      goodId: 'good-1',
      apply: { regularPrice: true },
    });

    expect(result.appliedFields).toContain('regularPrice');
    expect(productsDilovodGateway.savePrice).toHaveBeenCalledTimes(2);
    expect(prisma.catalogGoodPrice.upsert).toHaveBeenCalledTimes(2);
  });

  it('pullBulkPreview enables only non-conflicting bulk fields by default', async () => {
    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p>Склад: вода.</p>',
        short_description: 'short',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [{ id: 501, src: 'https://shop.example.com/img.jpg', name: 'photo' }],
        categories: [{ id: 21, name: 'Другі страви', slug: 'drugi-stravy' }],
      }),
      getProductById: vi.fn(),
      updateProduct: vi.fn(),
    } as never);

    vi.mocked(prisma.catalogGood.findMany).mockResolvedValue([
      { id: 'good-1', sku: 'SKU-1', name: 'Товар' },
    ] as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Локальна назва',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      doNotPublish: false,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      images: [],
      prices: [],
    } as never);

    const preview = await service.pullBulkPreview(['good-1']);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].wcStatus).toBe('found');
    expect(preview.items[0].defaultApply.name).toBe(false);
    expect(preview.items[0].defaultApply.weight).toBe(true);
    expect(preview.items[0].defaultApply.images).toBe(true);
    expect(preview.items[0].defaultApply.shortDescription).toBe(true);
  });

  it('pullBulkPreview enables shortDescription when local description is empty and WC has marketing text', async () => {
    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p class="storefront-marketing">Маркетинговий текст.</p><p>Склад: вода.</p>',
        short_description: '<p></p>',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
        categories: [],
      }),
      getProductById: vi.fn(),
      updateProduct: vi.fn(),
    } as never);

    vi.mocked(prisma.catalogGood.findMany).mockResolvedValue([
      { id: 'good-1', sku: 'SKU-1', name: 'Товар' },
    ] as never);
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Товар',
      isGroup: false,
      accPolicyId: null,
      wooProductId: null,
      fullDescription: null,
      description: null,
      weight: null,
      doNotPublish: false,
      storefrontDescriptionDoc: null,
      productIngredientsJson: null,
      productNutritionJson: null,
      storefrontPresetId: null,
      images: [],
      prices: [],
    } as never);

    const preview = await service.pullBulkPreview(['good-1']);

    expect(preview.items[0].proposed.shortDescription).toBe('<p>Маркетинговий текст.</p>');
    expect(preview.items[0].defaultApply.shortDescription).toBe(true);
  });

  it('pullPreview detects category conflict between BO group and WC category', async () => {
    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '<p>Склад: вода.</p>',
        short_description: 'short',
        regular_price: '10',
        weight: '0.3',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
        categories: [{ id: 21, name: 'Другі страви', slug: 'drugi-stravy' }],
      }),
      getProductById: vi.fn(),
      updateProduct: vi.fn(),
    } as never);

    vi.mocked(prisma.catalogGood.findUnique)
      .mockResolvedValueOnce({
        id: 'good-1',
        parentId: 'group-1',
        sku: 'SKU-1',
        name: 'Локальна назва',
        isGroup: false,
        accPolicyId: null,
        wooProductId: null,
        fullDescription: null,
        description: null,
        weight: 0.2,
        doNotPublish: false,
        storefrontDescriptionDoc: null,
        productIngredientsJson: null,
        productNutritionJson: null,
        storefrontPresetId: null,
        images: [],
        prices: [{ priceType: '1101300000001001', price: 85 }],
      } as never)
      .mockResolvedValueOnce({
        id: 'group-1',
        name: 'Салати',
        isGroup: true,
      } as never);

    const preview = await service.pullPreview('good-1');

    expect(preview.local.groupName).toBe('Салати');
    expect(preview.proposed.categoryName).toBe('Другі страви');
    expect(preview.conflicts.some((c) => c.field === 'category')).toBe(true);
  });

  it('pullApply updates WooCommerce category when selected', async () => {
    vi.mocked(prisma.catalogGood.findUnique)
      .mockResolvedValueOnce({
        id: 'good-1',
        parentId: 'group-1',
        sku: 'SKU-1',
        name: 'Товар',
        isGroup: false,
        accPolicyId: null,
        wooProductId: null,
        fullDescription: null,
        description: null,
        weight: null,
        storefrontDescriptionDoc: null,
        productIngredientsJson: null,
        productNutritionJson: null,
        storefrontPresetId: null,
        doNotPublish: false,
        images: [],
        prices: [],
      } as never)
      .mockResolvedValueOnce({
        id: 'group-1',
        name: 'Салати',
        isGroup: true,
      } as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    const updateProduct = vi.fn().mockResolvedValue({ id: 77 });
    vi.mocked(createWooCommerceClient).mockReturnValue({
      getProductBySku: vi.fn().mockResolvedValue({
        id: 77,
        sku: 'SKU-1',
        name: 'Test',
        description: '',
        short_description: '',
        regular_price: '10',
        weight: '',
        stock_quantity: 5,
        status: 'publish',
        meta_data: [],
        images: [],
        categories: [{ id: 21, name: 'Другі страви', slug: 'drugi-stravy' }],
      }),
      getProductById: vi.fn(),
      updateProduct,
    } as never);

    const result = await service.pullApply({
      goodId: 'good-1',
      apply: { category: true, wooProductId: true },
    });

    expect(result.appliedFields).toContain('category');
    expect(updateProduct).toHaveBeenCalledWith(77, { categories: [{ id: 20 }] });
  });

  it('unpublishArchivedGoods sets WC status to draft without stock fields', async () => {
    vi.mocked(prisma.catalogGood.findMany).mockResolvedValue([
      { id: 'good-1', wooProductId: 77 },
    ] as never);
    vi.mocked(prisma.catalogGood.update).mockResolvedValue({} as never);

    const { createWooCommerceClient } = await import('./WooCommerceApiClient.js');
    const updateProduct = vi.fn().mockResolvedValue({ id: 77, status: 'draft' });
    vi.mocked(createWooCommerceClient).mockReturnValue({
      updateProduct,
    } as never);

    await service.unpublishArchivedGoods(['good-1']);

    expect(updateProduct).toHaveBeenCalledWith(77, { status: 'draft' });
    expect(updateProduct).not.toHaveBeenCalledWith(
      77,
      expect.objectContaining({ stock_quantity: expect.anything() }),
    );
    expect(prisma.catalogGood.update).toHaveBeenCalledWith({
      where: { id: 'good-1' },
      data: { wooLastSyncedAt: expect.any(Date) },
    });
  });

  it('unpublishArchivedGoods skips when WC is not configured', async () => {
    const { storefrontService } = await import('./StorefrontService.js');
    vi.mocked(storefrontService.getWooCredentialsInternal).mockRejectedValueOnce(
      new Error('WooCommerce credentials не налаштовані'),
    );

    await service.unpublishArchivedGoods(['good-1']);

    expect(prisma.catalogGood.findMany).not.toHaveBeenCalled();
  });

  it('pullBulkApply skip returns skipped result', async () => {
    vi.mocked(prisma.catalogGood.findUnique).mockResolvedValue({
      id: 'good-1',
      sku: 'SKU-1',
      name: 'Товар',
    } as never);

    const result = await service.pullBulkApply([{ goodId: 'good-1', action: 'skip' }]);
    expect(result.results[0]).toMatchObject({
      ok: true,
      skipped: true,
      action: 'skip',
    });
  });
});
