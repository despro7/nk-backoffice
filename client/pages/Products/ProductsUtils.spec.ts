import { describe, expect, it } from 'vitest';
import {
  buildTechCardRows,
  extractParenthesizedTextFromName,
  hasParenthesizedTextInName,
  catalogMissingNameLabels,
  expectedBomWeightKg,
  formatBomQtyDisplay,
  getMissingRequiredCatalogFields,
  isSuspiciousBomIngredientQty,
  isSuspiciousSpecQty,
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

  it('qty у специфікації — нетто, % втрат не зменшує вагу порції', () => {
    const r = expectedBomWeightKg(
      [{ qty: 1, unitId: 'kg', componentWeight: null, cookingLossPercent: 10 }],
      units
    );
    expect(r).toEqual({ kg: 1, missingCount: 0 });
  });

  it('нетто + divideBy для продукції', () => {
    const r = expectedBomWeightKg(
      [{ qty: 1, unitId: 'kg', componentWeight: null, cookingLossPercent: 20 }],
      units,
      { divideBy: 10 }
    );
    expect(r?.kg).toBe(0.1);
  });
});

describe('isSuspiciousBomIngredientQty', () => {
  it('підозріла кількість — менше 0.01 г', () => {
    expect(
      isSuspiciousBomIngredientQty({ qty: 0.005, unitId: 'g', componentWeight: null }, units)
    ).toBe(true);
    expect(
      isSuspiciousBomIngredientQty({ qty: 0.009, unitId: 'g', componentWeight: null }, units)
    ).toBe(true);
  });

  it('нормальна кількість — без попередження', () => {
    expect(
      isSuspiciousBomIngredientQty({ qty: 0.07, unitId: 'g', componentWeight: null }, units)
    ).toBe(false);
    expect(
      isSuspiciousBomIngredientQty({ qty: 3, unitId: 'g', componentWeight: null }, units)
    ).toBe(false);
    expect(
      isSuspiciousBomIngredientQty({ qty: 0.5, unitId: 'g', componentWeight: null }, units)
    ).toBe(false);
    expect(
      isSuspiciousBomIngredientQty({ qty: 270, unitId: 'ml', componentWeight: null }, units)
    ).toBe(false);
  });

  it('нуль або відсутня кількість — без попередження', () => {
    expect(
      isSuspiciousBomIngredientQty({ qty: 0, unitId: 'g', componentWeight: null }, units)
    ).toBe(false);
  });
});

describe('isSuspiciousSpecQty', () => {
  const recipe = [
    { qty: 58, unitId: 'g', componentWeight: null },
    { qty: 216, unitId: 'ml', componentWeight: null },
  ];

  it('підозрілий specQty, коли вага порції стає занадто малою', () => {
    expect(isSuspiciousSpecQty(recipe, units, 3120)).toBe(true);
  });

  it('нормальний specQty — без попередження', () => {
    expect(isSuspiciousSpecQty(recipe, units, 1)).toBe(false);
    expect(isSuspiciousSpecQty(recipe, units, 5)).toBe(false);
  });
});

describe('buildTechCardRows', () => {
  it('масштабує масу нетто/брутто на кількість порцій', () => {
    const result = buildTechCardRows(
      [{ componentName: 'Картопля', qty: 58, unitId: 'g', componentWeight: null, cookingLossPercent: 0 }],
      units,
      10,
      100
    );
    expect(result.rows[0]?.recipeDisplay).toBe(formatBomQtyDisplay(58, 'г'));
    expect(result.rows[0]?.netDisplay).toBe('0,58 кг');
    expect(result.rows[0]?.grossDisplay).toBe('0,58 кг');
    expect(result.totalNetMassKg).toBe(0.58);
    expect(result.totalGrossMassKg).toBe(0.58);
    expect(result.totalRecipeMassKg).toBe(0.058);
  });

  it('враховує % втрат для нетто/брутто', () => {
    const result = buildTechCardRows(
      [{ componentName: "М'ясо", qty: 100, unitId: 'g', componentWeight: null, cookingLossPercent: 10 }],
      units,
      1,
      1
    );
    expect(result.rows[0]?.massKgNetTotal).toBeCloseTo(0.1);
    expect(result.rows[0]?.massKgGrossTotal).toBeCloseTo(0.1 / 0.9);
    expect(result.rows[0]?.netDisplay).toBe('0,1 кг');
    expect(result.rows[0]?.grossDisplay).toBe('0,111 кг');
  });

  it('додає примітку до назви інгредієнта', () => {
    const result = buildTechCardRows(
      [{ componentName: 'Цибуля', qty: 10, unitId: 'g', componentWeight: null, note: 'різана' }],
      units,
      1,
      1
    );
    expect(result.rows[0]?.nameDisplay).toBe('Цибуля (різана)');
  });

  it('показує % втрат лише якщо вони > 0', () => {
    const withLoss = buildTechCardRows(
      [{ componentName: "М'ясо", qty: 100, unitId: 'g', componentWeight: null, cookingLossPercent: 10 }],
      units,
      1,
      1
    );
    const withoutLoss = buildTechCardRows(
      [{ componentName: 'Цибуля', qty: 10, unitId: 'g', componentWeight: null, cookingLossPercent: 0 }],
      units,
      1,
      1
    );
    expect(withLoss.rows[0]?.lossDisplay).toBe('10 %');
    expect(withoutLoss.rows[0]?.lossDisplay).toBe('');
  });

  it('форматує масу з фіксованою точністю', () => {
    const result = buildTechCardRows(
      [{ componentName: "М'ясо", qty: 100, unitId: 'g', componentWeight: null, cookingLossPercent: 10 }],
      units,
      1,
      1,
      2
    );
    expect(result.rows[0]?.netDisplay).toBe('0,10 кг');
    expect(result.rows[0]?.grossDisplay).toBe('0,11 кг');
    expect(result.massPrecision).toBe(2);
  });
});

describe('extractParenthesizedTextFromName', () => {
  it('переносить текст з дужок у примітку', () => {
    expect(extractParenthesizedTextFromName('Курячі кістки(суповий)')).toEqual({
      cleanName: 'Курячі кістки',
      extracted: 'суповий',
    });
    expect(extractParenthesizedTextFromName('Сир (твердий) знежирений')).toEqual({
      cleanName: 'Сир знежирений',
      extracted: 'твердий',
    });
  });

  it('без дужок — без змін', () => {
    expect(extractParenthesizedTextFromName('Цибуля')).toEqual({
      cleanName: 'Цибуля',
      extracted: null,
    });
    expect(hasParenthesizedTextInName('Цибуля')).toBe(false);
    expect(hasParenthesizedTextInName('Курячі кістки(суповий)')).toBe(true);
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
