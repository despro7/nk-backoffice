import { describe, expect, it } from 'vitest';
import { STOREFRONT_DEFAULT_BLOCKS, STOREFRONT_DEFAULT_META_KEYS } from '../constants/storefrontDefaults.js';
import type { WooCommerceProduct } from '../types/storefront.js';
import {
  extractMarketingPlainFromHtml,
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

describe('extractMarketingPlainFromHtml', () => {
  it('skips salt service paragraph and stops before storage marker', () => {
    const html = `<p>Наші страви готуються з помірною кількістю солі. За бажанням ви можете додати сіль на свій смак.</p>
<p>Готовий набір домашніх страв на будь-який смак: перші та другі страви, салати й м'ясні позиції. Різноманітне меню з м'яса, овочів і круп — зручно для щоденного харчування без зайвого клопоту. Достатньо лише розігріти та насолоджуватись. Термін зберігання — до 11 місяців.</p>
<p>Склад набору:</p>
<p>Перші страви</p>`;

    expect(extractMarketingPlainFromHtml(html)).toBe(
      "Готовий набір домашніх страв на будь-який смак: перші та другі страви, салати й м'ясні позиції. Різноманітне меню з м'яса, овочів і круп — зручно для щоденного харчування без зайвого клопоту. Достатньо лише розігріти та насолоджуватись.",
    );
  });

  it('extracts text before ingredients block for simple products', () => {
    const html = `<p>Смачний суп для всієї родини.</p>
<p>Склад: вода, картопля, морква, цибуля.</p>`;

    expect(extractMarketingPlainFromHtml(html)).toBe('Смачний суп для всієї родини.');
  });

  it('returns null when description contains only bound blocks', () => {
    expect(extractMarketingPlainFromHtml('<p>Склад: вода.</p>')).toBeNull();
  });

  it('prefers explicit storefront-marketing paragraph', () => {
    const html = `<p class="storefront-marketing">Явний маркетинг.</p>
<p>Інший текст до складу.</p>
<p>Склад: вода.</p>`;

    expect(extractMarketingPlainFromHtml(html)).toBe('Явний маркетинг.');
  });

  it('strips inline salt intro from single legacy paragraph', () => {
    const html = `<p>Наші страви готуються з помірною кількістю солі. За бажанням ви можете додати сіль на свій смак. Готовий набір домашніх страв. Термін зберігання — до 11 місяців. Склад набору: …</p>`;

    expect(extractMarketingPlainFromHtml(html)).toBe('Готовий набір домашніх страв.');
  });
});

describe('parseWcDescription marketing extraction', () => {
  it('stores unique marketing text in storefront doc', () => {
    const product = sampleProduct({
      description: `<p>Наші страви готуються з помірною кількістю солі. За бажанням ви можете додати сіль на свій смак.</p>
<p>Унікальний опис набору без службових блоків. Термін зберігання — до 11 місяців.</p>
<p>Склад набору:</p>`,
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
      isKit: true,
    });

    const marketingNode = result.storefrontDescriptionDoc.content.find(
      (node) =>
        node.type === 'paragraph' &&
        (node.attrs as { class?: string } | undefined)?.class === 'storefront-marketing',
    );
    const marketingText = marketingNode?.content?.[0]?.type === 'text' ? marketingNode.content[0].text : '';
    const kitBlock = result.storefrontDescriptionDoc.content.find(
      (node) =>
        node.type === 'storefrontBlock' &&
        (node.attrs as { resolver?: string } | undefined)?.resolver === 'kitComponents',
    );

    expect(marketingText).toBe('Унікальний опис набору без службових блоків.');
    expect(result.marketingText).toBe('Унікальний опис набору без службових блоків.');
    expect(result.parseWarnings).not.toContain('Маркетинговий абзац не розпізнано');
    expect(String((kitBlock?.attrs as { template?: string } | undefined)?.template || '')).toContain(
      '{{#kitGroups}}',
    );
  });

  it('does not parse service blocks from legacy HTML', () => {
    const product = sampleProduct({
      description: `<p>Унікальний опис набору. Термін зберігання — до 11 місяців.</p>
<p>Зберігати за температури від 0°С до 25°С.</p>
<p>3 способи розігріти: Спосіб 1…</p>
<p>Способи розігріву:</p><ol><li>Мікрохвильовка</li></ol>`,
    });

    const result = parseWcDescription({
      product,
      presetBlocks: STOREFRONT_DEFAULT_BLOCKS,
      metaKeys: STOREFRONT_DEFAULT_META_KEYS,
      isKit: true,
    });

    const storageBlock = result.storefrontDescriptionDoc.content.find(
      (node) =>
        node.type === 'storefrontBlock' &&
        (node.attrs as { blockId?: string } | undefined)?.blockId === 'storage',
    );
    const heatingBlock = result.storefrontDescriptionDoc.content.find(
      (node) =>
        node.type === 'storefrontBlock' &&
        (node.attrs as { blockId?: string } | undefined)?.blockId === 'heating',
    );

    expect((storageBlock?.attrs as { overrideContent?: string | null } | undefined)?.overrideContent).toBeNull();
    expect((heatingBlock?.attrs as { overrideContent?: string | null } | undefined)?.overrideContent).toBeNull();
    expect(result.marketingText).toBe('Унікальний опис набору.');
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
