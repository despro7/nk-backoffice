import { describe, expect, it } from 'vitest';
import {
  isMeatFree,
  parseCatalogNutrition,
  parseCatalogQuery,
  plainCatalogDescription,
  searchCatalogDocs,
  type CatalogSearchDoc,
} from './chatwootBotCatalogSearch.js';

const docs: CatalogSearchDoc[] = [
  {
    name: 'Суп грибний з куркою та вершками',
    sku: '01002',
    category: 'Перші страви',
    ingredients: ["бульйон м'ясо-кістковий з курки", 'печериці', 'м’ясо курки'],
    description: 'Ніжний грибний суп',
  },
  {
    name: 'Плов з куркою',
    sku: '03001',
    category: 'Другі страви',
    ingredients: ['рис', 'філе курки', 'морква'],
    description: 'Ситна друга страва',
  },
  {
    name: 'Картопля з печерицями',
    sku: '03010',
    category: 'Другі страви',
    ingredients: ['картопля', 'печериці', 'цибуля'],
    description: 'Пісна страва',
  },
  { name: 'Буряк варений', sku: '02001', category: 'Овочі', ingredients: [], description: '' },
];

describe('searchCatalogDocs', () => {
  it('finds second courses with chicken by category and ingredients', () => {
    const found = searchCatalogDocs(docs, 'друга страва з куркою').map((d) => d.sku);
    // Суп з куркою — не друга страва: покриває менше слів запиту.
    expect(found).toEqual(['03001']);
  });

  it('treats chicken word forms as one ingredient', () => {
    expect(searchCatalogDocs(docs, 'щось з курятиною').map((d) => d.sku)).toEqual(['01002', '03001']);
  });

  it('filters meat-free dishes', () => {
    expect(searchCatalogDocs(docs, "щось без м'яса").map((d) => d.sku)).toEqual(['03010']);
    expect(searchCatalogDocs(docs, 'вегетаріанські другі страви').map((d) => d.sku)).toEqual(['03010']);
  });

  it('matches exact SKU and returns everything for empty query', () => {
    expect(searchCatalogDocs(docs, '02001')[0].sku).toBe('02001');
    expect(searchCatalogDocs(docs, '')).toHaveLength(4);
  });
});

describe('catalog helpers', () => {
  it('detects meat in ingredients, unknown when empty', () => {
    expect(isMeatFree(['рис', 'філе курки'])).toBe(false);
    expect(isMeatFree(['картопля'])).toBe(true);
    expect(isMeatFree([])).toBeNull();
  });

  it('parses meat-free intent', () => {
    expect(parseCatalogQuery('пісне').meatFreeOnly).toBe(true);
    expect(parseCatalogQuery('суп').meatFreeOnly).toBe(false);
  });

  it('strips html and entities', () => {
    expect(plainCatalogDescription('<p>Суп &#8211; готова страва</p>')).toBe('Суп – готова страва');
  });
});

describe('nutrition', () => {
  const withNutrition = [
    { name: 'Плов з куркою', sku: '1', category: 'Другі страви', ingredients: ['рис', 'курка'], description: '', nutrition: { kcal: 150, protein: 9, fat: 5, carbs: 18 } },
    { name: 'Гречка з куркою', sku: '2', category: 'Другі страви', ingredients: ['гречка', 'курка'], description: '', nutrition: { kcal: 120, protein: 12, fat: 3, carbs: 15 } },
    { name: 'Борщ', sku: '3', category: 'Перші страви', ingredients: ['буряк'], description: '', nutrition: { kcal: 45, protein: 2, fat: 1, carbs: 7 } },
    { name: 'Суп', sku: '4', category: 'Перші страви', ingredients: ['картопля'], description: '', nutrition: null },
  ];

  it('sorts high-protein requests by protein and skips dishes without nutrition', () => {
    expect(searchCatalogDocs(withNutrition, 'білкові страви').map((d) => d.sku)).toEqual(['2', '1', '3']);
    expect(searchCatalogDocs(withNutrition, 'білкові другі страви').map((d) => d.sku)).toEqual(['2', '1']);
  });

  it('sorts light requests by calories', () => {
    expect(searchCatalogDocs(withNutrition, 'щось легке').map((d) => d.sku)).toEqual(['3', '2', '1']);
  });

  it('parses nutrition JSON with optional salt', () => {
    expect(parseCatalogNutrition('{"proteins":"3,3","fats":"3.3","carbs":"4.8","energy":"60","salt":"0.9"}')).toEqual({
      kcal: 60,
      protein: 3.3,
      fat: 3.3,
      carbs: 4.8,
      salt: 0.9,
    });
    expect(parseCatalogNutrition('{"proteins":"","fats":"1","carbs":"1","energy":"1"}')).toBeNull();
  });
});
