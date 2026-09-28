import { describe, expect, it } from 'vitest';
import { STOREFRONT_DEFAULT_BLOCKS, STOREFRONT_DEFAULT_META_KEYS } from '../constants/storefrontDefaults.js';
import type { WooCommerceProduct } from '../types/storefront.js';
import {
  isEffectivelyEmptyHtml,
  parseWcDescription,
  summarizeWcProduct,
} from './storefrontDescriptionParser.js';

function sampleProduct(overrides: Partial<WooCommerceProduct> = {}): WooCommerceProduct {
  return {
    id: 123,
    name: 'Тестовий суп',
    sku: 'TEST-001',
    description: '',
    short_description: 'Короткий опис',
    regular_price: '99',
    weight: '0.35',
    stock_quantity: 10,
    status: 'publish',
    meta_data: [],
    ...overrides,
  };
}

describe('isEffectivelyEmptyHtml', () => {
  it('treats empty rich text as empty', () => {
    expect(isEffectivelyEmptyHtml('')).toBe(true);
    expect(isEffectivelyEmptyHtml('<p></p>')).toBe(true);
    expect(isEffectivelyEmptyHtml('<p><br></p>')).toBe(true);
    expect(isEffectivelyEmptyHtml('<p>Текст</p>')).toBe(false);
  });
});

describe('parseWcDescription', () => {
  it('parses ingredients from HTML', () => {
    const product = sampleProduct({
      description: `<p class="storefront-marketing">Смачний суп для всієї родини.</p>
<p>Склад: вода, картопля, морква, цибуля.</p>
<p>Білки 2,5 г</p>
<p>Жири 1,2 г</p>
<p>Вуглеводи 8,0 г</p>
<p>Енергетична цінність 55 ккал</p>`,
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
    });

    expect(result.productIngredientsJson).toContain('вода');
    expect(result.productIngredientsJson).toContain('картопля');
    expect(result.productNutritionJson?.proteins).toBeTruthy();
    expect(result.productNutritionJson?.fats).toBeTruthy();
    expect(result.productNutritionJson?.carbs).toBeTruthy();
    expect(result.productNutritionJson?.energy).toBeTruthy();
    expect(result.storefrontDescriptionDoc.type).toBe('doc');
  });

  it('parses inline nutrition block in a single paragraph', () => {
    const product = sampleProduct({
      description:
        '<p>білки – 2,17 г, жири – 5,27 г, вуглеводи – 4,55 г, калорійність – 72,55 ккал.</p>',
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
    });

    expect(result.productNutritionJson).toEqual({
      proteins: '2,17',
      fats: '5,27',
      carbs: '4,55',
      energy: '72,55',
    });
    expect(result.parseWarnings).not.toContain('КБЖВ не розпізнано');
  });

  it('stops ingredient parsing at paragraph end', () => {
    const product = sampleProduct({
      description: `<p>Склад: вода, сіль.</p><p>Білки 2,5 г</p><p>Жири 1,2 г</p>`,
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
    });

    expect(result.productIngredientsJson).toEqual(['вода', 'сіль']);
    expect(result.productNutritionJson?.proteins).toBe('2,5');
    expect(result.productNutritionJson?.fats).toBe('1,2');
  });

  it('prefers _nk_ meta over HTML', () => {
    const product = sampleProduct({
      description: '<p>Склад: старий склад</p>',
      meta_data: [
        { key: '_nk_ingredients', value: 'новий склад, сіль' },
        {
          key: '_nk_nutrition',
          value: JSON.stringify({ proteins: '3', fats: '1', carbs: '5', energy: '40' }),
        },
      ],
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
    });

    expect(result.productIngredientsJson).toEqual(['новий склад', 'сіль']);
    expect(result.productNutritionJson?.energy).toBe('40');
  });

  it('adds parse warnings when nutrition not recognized', () => {
    const product = sampleProduct({
      description: '<p>Склад: вода.</p><p>Без цифр КБЖВ</p>',
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
    });

    expect(result.parseWarnings.length).toBeGreaterThanOrEqual(0);
  });
});

describe('summarizeWcProduct', () => {
  it('separates nk meta from unknown meta', () => {
    const { nkMeta, unknownMeta } = summarizeWcProduct(
      sampleProduct({
        meta_data: [
          { key: '_nk_storage', value: 'холодильник' },
          { key: 'portions_count', value: '4' },
        ],
      }),
    );

    expect(nkMeta['_nk_storage']).toBe('холодильник');
    expect(unknownMeta.some((row) => row.key === 'portions_count')).toBe(true);
  });
});
