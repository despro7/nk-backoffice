import { describe, expect, it } from 'vitest';
import { EMPTY_TECH_CARD_PAYLOAD, type ProductionBatchSnapshot } from '../types/production';
import { batchBoxes, batchNumberPrefix, formatBatchNumber, normalizeBatchDate, planBatchLines } from './productionBatchPlan';

const units = [
  { id: 'g', name: 'г' },
  { id: 'kg', name: 'кг' },
  { id: 'pcs', name: 'шт' },
];

const POTATO = 'aaaaaaaa-0000-4000-8000-000000000001';
const WATER = 'aaaaaaaa-0000-4000-8000-000000000002';

const snapshot: ProductionBatchSnapshot = {
  payload: {
    ...EMPTY_TECH_CARD_PAYLOAD,
    portionsPerBox: 24,
    packaging: [
      { goodId: 'bag', qty: 1, basis: 'portion', note: null },
      { goodId: 'box', qty: 1, basis: 'box', note: null },
    ],
  },
  specQty: 1,
  lossFormula: 'additive',
  components: [
    {
      rowKey: POTATO,
      componentGoodId: 'potato',
      name: 'Картопля',
      note: null,
      qty: 55,
      unitId: 'g',
      componentWeight: null,
      cookingLossPercent: 20,
      losses: null,
      qtyFormula: null,
    },
    {
      rowKey: WATER,
      componentGoodId: 'water',
      name: 'Вода',
      note: 'для картоплі',
      qty: 74.5,
      unitId: 'g',
      componentWeight: null,
      cookingLossPercent: 0,
      losses: null,
      qtyFormula: { sourceRowKey: POTATO, k: 1.3, b: 3000 },
    },
  ],
  packagingGoods: {
    bag: { name: 'Дой-пак', unitId: 'pcs', weight: 0.01 },
    box: { name: 'Гофроящик', unitId: 'pcs', weight: null },
  },
};

describe('planBatchLines', () => {
  it('сировина масштабується, брутто за втратами', () => {
    const [potato] = planBatchLines(snapshot, 100, units);
    expect(potato.plannedQty).toBe(5500);
    expect(potato.unitName).toBe('г');
    expect(potato.plannedNetKg).toBeCloseTo(5.5);
    expect(potato.plannedGrossKg).toBeCloseTo(5.5 / 0.8);
  });

  it('похідний рядок: k × джерело + b на варку, b не масштабується', () => {
    const water = planBatchLines(snapshot, 100, units)[1];
    // 5500 г × 1,3 + 3000 г = 10 150 г
    expect(water.plannedQty).toBeCloseTo(10150);
    expect(water.name).toBe('Вода (для картоплі)');
  });

  it('пакування: на порцію × порції, на коробку × коробки (вгору)', () => {
    const lines = planBatchLines(snapshot, 100, units);
    const bag = lines.find((l) => l.goodId === 'bag');
    const box = lines.find((l) => l.goodId === 'box');
    expect(bag?.plannedQty).toBe(100);
    expect(box?.plannedQty).toBe(5);
    expect(box?.kind).toBe('packaging');
  });
});

describe('номер і дата варки', () => {
  it('ВР-YMMDD-N', () => {
    expect(formatBatchNumber('2026-11-08', 1)).toBe('ВР-61108-1');
    expect(batchNumberPrefix('2026-11-08')).toBe('ВР-61108-');
  });

  it('коробки', () => {
    expect(batchBoxes(100, 24)).toBe(5);
    expect(batchBoxes(100, null)).toBeNull();
  });

  it('дата', () => {
    expect(normalizeBatchDate('2026-11-08')).toBe('2026-11-08');
    expect(normalizeBatchDate('2026-02-30')).toBeNull();
    expect(normalizeBatchDate('08.11.2026')).toBeNull();
  });
});
