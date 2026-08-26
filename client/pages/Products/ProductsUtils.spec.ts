import { describe, expect, it } from 'vitest';
import {
  catalogMissingNameLabels,
  expectedBomWeightKg,
  getMissingRequiredCatalogFields,
  massUnitToKgFactor,
} from './ProductsUtils';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
} from './ProductsTypes';

const units = [
  { id: 'kg', name: 'кг', code: 'kg' },
  { id: 'g', name: 'г', code: 'g' },
  { id: 'l', name: 'л', code: 'l' },
  { id: 'ml', name: 'мл', code: 'ml' },
  { id: 'pcs', name: 'шт.', code: 'pcs' },
  { id: 'grams-plural', name: 'грамів', code: null },
  { id: 'liters-plural', name: 'літри', code: null },
];

describe('massUnitToKgFactor', () => {
  it('розпізнає кг/г/л/мл і множини', () => {
    expect(massUnitToKgFactor({ name: 'кг' })).toBe(1);
    expect(massUnitToKgFactor({ name: 'кілограм' })).toBe(1);
    expect(massUnitToKgFactor({ name: 'г' })).toBe(0.001);
    expect(massUnitToKgFactor({ name: 'грамів' })).toBe(0.001);
    expect(massUnitToKgFactor({ name: 'літри' })).toBe(1);
    expect(massUnitToKgFactor({ name: 'мл' })).toBe(0.001);
    expect(massUnitToKgFactor({ name: 'шт.' })).toBeNull();
    expect(massUnitToKgFactor(undefined)).toBeNull();
  });
});

describe('expectedBomWeightKg', () => {
  it('порожній BOM → null', () => {
    expect(expectedBomWeightKg([], units)).toBeNull();
  });

  it('маса: г/кг/л зводяться до кг', () => {
    const r = expectedBomWeightKg(
      [
        { qty: 500, unitId: 'g', componentWeight: null },
        { qty: 0.2, unitId: 'kg', componentWeight: 99 },
        { qty: 1, unitId: 'l', componentWeight: null },
      ],
      units
    );
    expect(r).toEqual({ kg: 1.7, missingCount: 0 });
  });

  it('шт. × вага картки', () => {
    const r = expectedBomWeightKg(
      [{ qty: 3, unitId: 'pcs', componentWeight: 0.25 }],
      units
    );
    expect(r).toEqual({ kg: 0.75, missingCount: 0 });
  });

  it('продукція: шт. без ваги ігнорується, без попередження', () => {
    const r = expectedBomWeightKg(
      [{ qty: 2, unitId: 'pcs', componentWeight: null }],
      units
    );
    expect(r).toBeNull();
  });

  it('продукція: шт. без ваги не впливає на суму', () => {
    const r = expectedBomWeightKg(
      [
        { qty: 1, unitId: 'kg', componentWeight: null },
        { qty: 2, unitId: 'pcs', componentWeight: null },
        { qty: 4, unitId: 'pcs', componentWeight: 0.1 },
      ],
      units
    );
    expect(r).toEqual({ kg: 1.4, missingCount: 0 });
  });

  it('набір: шт. без ваги порції — missingCount, без суми', () => {
    const r = expectedBomWeightKg(
      [{ qty: 3, unitId: 'pcs', componentWeight: null }],
      units,
      { warnMissingPieceWeight: true }
    );
    expect(r).toEqual({ kg: 0, missingCount: 1 });
  });

  it('набір: часткова сума + попередження', () => {
    const r = expectedBomWeightKg(
      [
        { qty: 3, unitId: 'pcs', componentWeight: 0.4 },
        { qty: 3, unitId: 'pcs', componentWeight: null },
        { qty: 3, unitId: 'pcs', componentWeight: 0.39 },
      ],
      units,
      { warnMissingPieceWeight: true }
    );
    expect(r).toEqual({ kg: 2.37, missingCount: 1 });
  });

  it('divideBy для продукції (вага порції)', () => {
    const r = expectedBomWeightKg(
      [{ qty: 1, unitId: 'kg', componentWeight: null }],
      units,
      { divideBy: 10 }
    );
    expect(r?.kg).toBe(0.1);
    expect(r?.missingCount).toBe(0);
  });

  it('невідомий unitId без ваги картки ігнорується в продукції', () => {
    const r = expectedBomWeightKg(
      [{ qty: 100, unitId: 'unknown', componentWeight: null }],
      units
    );
    expect(r).toBeNull();
  });

  it('qty ≤ 0 пропускається', () => {
    const r = expectedBomWeightKg(
      [
        { qty: 0, unitId: 'kg', componentWeight: null },
        { qty: 1, unitId: 'kg', componentWeight: null },
      ],
      units
    );
    expect(r).toEqual({ kg: 1, missingCount: 0 });
  });
});

const filledPrices = [
  { priceType: CATALOG_PRICE_TYPE_RETAIL_ID, price: 100 },
  { priceType: CATALOG_PRICE_TYPE_REGULAR_ID, price: 100 },
  { priceType: CATALOG_PRICE_TYPE_MILITARY_ID, price: 95 },
];

describe('getMissingRequiredCatalogFields', () => {
  it('папка — без попереджень', () => {
    expect(getMissingRequiredCatalogFields({ isGroup: true, weight: null })).toEqual({
      prices: [],
      weight: false,
      packageRatio: false,
    });
  });

  it('продукція: ціни, вага, порції', () => {
    expect(
      getMissingRequiredCatalogFields({
        isGroup: false,
        accPolicyId: CATALOG_ACC_POLICY_GOOD,
        weight: null,
        packageRatio: 0,
        prices: [],
      })
    ).toEqual({
      prices: ['Роздріб', 'Звичайна', 'Військові'],
      weight: true,
      packageRatio: true,
    });
  });

  it('військова ціна 0 — як у картці (isInvalid ≤ 0)', () => {
    expect(
      getMissingRequiredCatalogFields({
        isGroup: false,
        accPolicyId: CATALOG_ACC_POLICY_GOOD,
        weight: 0.15,
        packageRatio: 10,
        prices: [
          { priceType: CATALOG_PRICE_TYPE_RETAIL_ID, price: 100 },
          { priceType: CATALOG_PRICE_TYPE_REGULAR_ID, price: 100 },
          { priceType: CATALOG_PRICE_TYPE_MILITARY_ID, price: 0 },
        ],
      }).prices
    ).toEqual(['Військові']);
  });

  it('набір: без порцій у коробці', () => {
    expect(
      getMissingRequiredCatalogFields({
        isGroup: false,
        accPolicyId: CATALOG_ACC_POLICY_KIT,
        weight: 0.2,
        packageRatio: null,
        prices: filledPrices,
      })
    ).toEqual({
      prices: [],
      weight: false,
      packageRatio: false,
    });
  });

  it('повністю заповнена продукція', () => {
    expect(
      getMissingRequiredCatalogFields({
        isGroup: false,
        accPolicyId: CATALOG_ACC_POLICY_GOOD,
        weight: 0.15,
        packageRatio: 10,
        prices: filledPrices,
      })
    ).toEqual({
      prices: [],
      weight: false,
      packageRatio: false,
    });
  });
});

describe('catalogMissingNameLabels', () => {
  it('ціни з префіксом групи', () => {
    expect(
      catalogMissingNameLabels({
        prices: ['Військові'],
        weight: true,
        packageRatio: false,
      })
    ).toEqual(['Ціни -> Військові']);
  });
});
