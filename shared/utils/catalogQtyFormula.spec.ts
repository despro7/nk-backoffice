import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BATCH_PORTIONS,
  derivedSpecQty,
  hasDerivedRows,
  normalizeBatchPortions,
  normalizeQtyFormula,
  qtyFormulaKey,
  qtyFormulaSourceError,
  recalcDerivedRows,
} from './catalogQtyFormula';

const units = [
  { id: 'kg', name: 'кг' },
  { id: 'g', name: 'г' },
  { id: 'l', name: 'л' },
  { id: 'ml', name: 'мл' },
  { id: 'pcs', name: 'шт' },
];

const POTATO = 'aaaaaaaa-0000-4000-8000-000000000001';
const WATER = 'aaaaaaaa-0000-4000-8000-000000000002';

const potato = { rowKey: POTATO, qty: 55, unitId: 'g', componentWeight: null, qtyFormula: null };
const water = {
  rowKey: WATER,
  qty: 1,
  unitId: 'l',
  componentWeight: null,
  qtyFormula: { sourceRowKey: POTATO, k: 1.3, b: 3 },
};

describe('normalizeQtyFormula', () => {
  it('приймає обʼєкт і JSON-рядок, b за замовчуванням 0', () => {
    expect(normalizeQtyFormula({ sourceRowKey: POTATO, k: '1.3' })).toEqual({ sourceRowKey: POTATO, k: 1.3, b: 0 });
    expect(normalizeQtyFormula(JSON.stringify({ sourceRowKey: POTATO, k: 2, b: 1 }))).toEqual({
      sourceRowKey: POTATO,
      k: 2,
      b: 1,
    });
  });

  it('відкидає невалідне', () => {
    expect(normalizeQtyFormula(null)).toBeNull();
    expect(normalizeQtyFormula('{bad')).toBeNull();
    expect(normalizeQtyFormula({ sourceRowKey: 'x', k: 1 })).toBeNull();
    expect(normalizeQtyFormula({ sourceRowKey: POTATO, k: 'abc' })).toBeNull();
  });

  it('ключ для порівняння', () => {
    expect(qtyFormulaKey(water.qtyFormula)).toBe(`${POTATO}:1.3:3`);
    expect(qtyFormulaKey(null)).toBeNull();
  });
});

describe('normalizeBatchPortions', () => {
  it('ціле ≥ 1, інакше за замовчуванням', () => {
    expect(normalizeBatchPortions(500.4)).toBe(500);
    expect(normalizeBatchPortions(0)).toBe(DEFAULT_BATCH_PORTIONS);
    expect(normalizeBatchPortions(undefined)).toBe(DEFAULT_BATCH_PORTIONS);
  });
});

describe('derivedSpecQty', () => {
  it('вода = картопля · 1,3 + 3 на 1000 порцій → на порцію', () => {
    // картопля 0,055 кг × 1000 = 55 кг; 55 · 1,3 + 3 = 74,5 л на варку → 0,0745 л на порцію
    expect(derivedSpecQty(water, [potato, water], units, 1, 1000)).toBeCloseTo(0.0745, 6);
  });

  it('враховує specQty: специфікація на 2 порції', () => {
    const potato2 = { ...potato, qty: 110 };
    expect(derivedSpecQty(water, [potato2, water], units, 2, 1000)).toBeCloseTo(0.149, 6);
  });

  it('k – співвідношення в одиницях рядка: картопля в г, вода в мл', () => {
    // 55 г × 1000 = 55 000 мл; × 1,3 + 3000 мл = 74 500 мл на варку → 74,5 мл на порцію
    const waterMl = { ...water, unitId: 'ml', qtyFormula: { sourceRowKey: POTATO, k: 1.3, b: 3000 } };
    expect(derivedSpecQty(waterMl, [potato, waterMl], units, 1, 1000)).toBeCloseTo(74.5, 6);
  });

  it('рядок у штуках рахується через вагу штуки', () => {
    const pcs = { ...water, unitId: 'pcs', componentWeight: 0.5, qtyFormula: { sourceRowKey: POTATO, k: 1, b: 0 } };
    // 55 кг на варку / 0,5 кг = 110 шт → 0,11 шт на порцію
    expect(derivedSpecQty(pcs, [potato, pcs], units, 1, 1000)).toBeCloseTo(0.11, 6);
    const noWeight = { ...pcs, componentWeight: null };
    expect(qtyFormulaSourceError(noWeight, [potato, noWeight], units)).toMatch(/Одиниця/);
  });

  it('b не масштабується з N', () => {
    expect(derivedSpecQty(water, [potato, water], units, 1, 100)).toBeCloseTo((5.5 * 1.3 + 3) / 100, 6);
  });

  it('null без джерела', () => {
    expect(derivedSpecQty(water, [water], units, 1, 1000)).toBeNull();
  });
});

describe('qtyFormulaSourceError', () => {
  it('немає джерела / сам на себе / похідне джерело / без маси', () => {
    expect(qtyFormulaSourceError(water, [potato, water], units)).toBeNull();
    expect(qtyFormulaSourceError(water, [water], units)).toMatch(/видалено/);
    const self = { ...water, qtyFormula: { sourceRowKey: WATER, k: 1, b: 0 } };
    expect(qtyFormulaSourceError(self, [potato, self], units)).toMatch(/себе/);
    const chained = { ...potato, qtyFormula: { sourceRowKey: WATER, k: 1, b: 0 } };
    expect(qtyFormulaSourceError(water, [chained, water], units)).toMatch(/похідний/);
    const piece = { ...potato, unitId: 'pcs' };
    expect(qtyFormulaSourceError(water, [piece, water], units)).toMatch(/Маса/);
  });
});

describe('recalcDerivedRows', () => {
  it('оновлює лише похідні рядки, без змін – той самий масив', () => {
    const rows = [potato, water];
    const next = recalcDerivedRows(rows, units, 1, 1000);
    expect(next).not.toBe(rows);
    expect(next[0]).toBe(potato);
    expect(next[1].qty).toBeCloseTo(0.0745, 6);
    expect(recalcDerivedRows(next, units, 1, 1000)).toBe(next);
    expect(hasDerivedRows(rows)).toBe(true);
    expect(hasDerivedRows([potato])).toBe(false);
  });
});
