import { describe, expect, it } from 'vitest';
import {
  STOREFRONT_DEFAULT_BLOCKS,
  STOREFRONT_DEFAULT_META_KEYS,
  createCustomStorefrontBlock,
  createCustomStorefrontMetaKey,
  isStorefrontProtectedBlockId,
  normalizeStorefrontBlocks,
  normalizeStorefrontMetaKeys,
} from './storefrontDefaults.js';

describe('normalizeStorefrontBlocks', () => {
  it('preserves saved block order', () => {
    const blocks = [
      {
        id: 'storage',
        label: 'Зберігання',
        enabled: true,
        resolver: 'storage' as const,
        template: 'Зберігати в холодильнику',
        metaKeyId: 'meta-storage',
      },
      {
        id: 'natural',
        label: 'Натуральність',
        enabled: true,
        resolver: 'template' as const,
        template: 'Натуральний',
        metaKeyId: null,
      },
    ];

    expect(normalizeStorefrontBlocks(blocks, STOREFRONT_DEFAULT_META_KEYS).slice(0, 2)).toEqual(blocks);
  });

  it('drops invalid metaKeyId references', () => {
    const blocks = [
      {
        id: 'custom',
        label: 'Custom',
        enabled: true,
        resolver: 'template' as const,
        template: 'text',
        metaKeyId: 'missing-id',
      },
    ];

    expect(normalizeStorefrontBlocks(blocks, STOREFRONT_DEFAULT_META_KEYS)[0]?.metaKeyId).toBeNull();
  });

  it('deduplicates by id', () => {
    const blocks = [
      {
        id: 'custom-1',
        label: 'A',
        enabled: true,
        resolver: 'template' as const,
        template: 'one',
        metaKeyId: null,
      },
      {
        id: 'custom-1',
        label: 'B',
        enabled: false,
        resolver: 'template' as const,
        template: 'two',
        metaKeyId: null,
      },
    ];

    expect(normalizeStorefrontBlocks(blocks)).toEqual([blocks[0]]);
  });
});

describe('normalizeStorefrontMetaKeys', () => {
  it('deduplicates keys and trims values', () => {
    const rows = [
      { id: 'a', label: ' A ', key: ' _nk_a ' },
      { id: 'b', label: 'B', key: '_nk_a' },
    ];

    expect(normalizeStorefrontMetaKeys(rows)).toEqual([{ id: 'a', label: 'A', key: '_nk_a' }]);
  });

  it('falls back to defaults when empty', () => {
    expect(normalizeStorefrontMetaKeys([])).toEqual(STOREFRONT_DEFAULT_META_KEYS);
  });
});

describe('createCustomStorefrontBlock', () => {
  it('creates enabled template block with unique id', () => {
    const block = createCustomStorefrontBlock('Тест');
    expect(block.label).toBe('Тест');
    expect(block.enabled).toBe(true);
    expect(block.resolver).toBe('template');
    expect(block.metaKeyId).toBeNull();
    expect(block.id.length).toBeGreaterThan(4);
  });
});

describe('isStorefrontProtectedBlockId', () => {
  it('protects product-data blocks only', () => {
    expect(isStorefrontProtectedBlockId('ingredients')).toBe(true);
    expect(isStorefrontProtectedBlockId('nutrition')).toBe(true);
    expect(isStorefrontProtectedBlockId('kitComponents')).toBe(true);
    expect(isStorefrontProtectedBlockId('natural')).toBe(false);
    expect(isStorefrontProtectedBlockId('custom-uuid')).toBe(false);
  });
});

describe('createCustomStorefrontMetaKey', () => {
  it('creates empty key row', () => {
    const row = createCustomStorefrontMetaKey('Meta');
    expect(row.label).toBe('Meta');
    expect(row.key).toBe('');
  });
});

describe('STOREFRONT_DEFAULT_BLOCKS', () => {
  it('contains built-in resolvers with templates', () => {
    const natural = STOREFRONT_DEFAULT_BLOCKS.find((block) => block.id === 'natural');
    expect(natural?.resolver).toBe('template');
    expect(natural?.template).toContain('натуральних');
    expect(natural?.metaKeyId).toBeNull();

    const ingredients = STOREFRONT_DEFAULT_BLOCKS.find((block) => block.id === 'ingredients');
    expect(ingredients?.template).toContain('{{ingredients}}');
  });
});
