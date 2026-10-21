import { describe, expect, it } from 'vitest';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
} from '../types/catalog.js';
import { getCatalogCardAttentionLabels } from './catalogCardAttention.js';

describe('getCatalogCardAttentionLabels', () => {
  it('повідомляє про некоректну військову ціну', () => {
    const labels = getCatalogCardAttentionLabels({
      isGroup: false,
      accPolicyId: CATALOG_ACC_POLICY_GOOD,
      weight: 1,
      packageRatio: 10,
      prices: [
        { priceType: CATALOG_PRICE_TYPE_RETAIL_ID, price: 100 },
        { priceType: CATALOG_PRICE_TYPE_REGULAR_ID, price: 100 },
        { priceType: CATALOG_PRICE_TYPE_MILITARY_ID, price: 50 },
      ],
    });
    expect(labels).toContain('Ціни → Військові (некоректно)');
  });

  it('перелічує порожній контент вітрини', () => {
    const labels = getCatalogCardAttentionLabels({
      isGroup: false,
      accPolicyId: CATALOG_ACC_POLICY_GOOD,
      weight: 1,
      packageRatio: 10,
      prices: [
        { priceType: CATALOG_PRICE_TYPE_RETAIL_ID, price: 10 },
        { priceType: CATALOG_PRICE_TYPE_REGULAR_ID, price: 10 },
        { priceType: CATALOG_PRICE_TYPE_MILITARY_ID, price: 5 },
      ],
      imageCount: 0,
      description: '',
      productIngredientsJson: [],
      productNutritionJson: null,
    });
    expect(labels).toEqual(
      expect.arrayContaining(['Зображення', 'Короткий опис', 'КБЖУ', 'Склад']),
    );
  });

  it('не вимагає КБЖУ і склад для наборів', () => {
    const labels = getCatalogCardAttentionLabels({
      isGroup: false,
      isKit: true,
      accPolicyId: '1201200000001031',
      weight: 1,
      prices: [
        { priceType: CATALOG_PRICE_TYPE_RETAIL_ID, price: 10 },
        { priceType: CATALOG_PRICE_TYPE_REGULAR_ID, price: 10 },
        { priceType: CATALOG_PRICE_TYPE_MILITARY_ID, price: 5 },
      ],
      imageCount: 1,
      description: '<p>ok</p>',
      productIngredientsJson: [],
      productNutritionJson: null,
    });
    expect(labels).not.toContain('Склад');
    expect(labels).not.toContain('КБЖУ');
  });
});
