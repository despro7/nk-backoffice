import { describe, expect, it } from 'vitest';
import {
  EMPTY_FACT,
  consumedQty,
  consumptionDeviationPct,
  deviationPct,
  factBoxes,
  factTotalPortions,
  isDeviationNotable,
  normalizeFact,
  normalizeOutputLineInput,
  outputSignErrors,
  type OutputLineLike,
} from './productionBatchOutput';

const line = (patch: Partial<OutputLineLike> = {}): OutputLineLike => ({
  kind: 'raw',
  unitName: 'г',
  plannedQty: 27500,
  plannedGrossKg: 46,
  stockRawSnap: null,
  stockProdSnap: null,
  issuedQty: 46,
  ...patch,
});

describe('normalizeFact', () => {
  it('rounds ints, drops negatives, keeps base for missing keys', () => {
    const base = { ...EMPTY_FACT, pallets: 1 };
    expect(normalizeFact({ portionsGood: '480.4', portionsReject: -3, comment: '  ок ' }, base)).toEqual({
      ...EMPTY_FACT,
      portionsGood: 480,
      portionsReject: null,
      pallets: 1,
      comment: 'ок',
    });
  });
});

describe('portions and boxes', () => {
  it('computes boxes and totals', () => {
    expect(factBoxes(481, 24)).toBe(21);
    expect(factBoxes(481, null)).toBeNull();
    expect(factTotalPortions({ ...EMPTY_FACT, portionsGood: 480, portionsReject: 12, portionsSample: 3 })).toBe(495);
    expect(factTotalPortions(EMPTY_FACT)).toBeNull();
    expect(deviationPct(495, 500)).toBe(-1);
  });
});

describe('consumption', () => {
  it('consumed = issued - leftover, deviation vs plan', () => {
    expect(consumedQty(line(), 2.5)).toBe(43.5);
    expect(consumedQty(line(), 50)).toBe(0);
    expect(consumedQty(line({ issuedQty: null }), 1)).toBeNull();
    expect(consumptionDeviationPct(line(), 0)).toBe(0);
    expect(consumptionDeviationPct(line(), 4.6)).toBe(-10);
    expect(isDeviationNotable(-10)).toBe(true);
    expect(isDeviationNotable(4)).toBe(false);
  });
});

describe('output input and validation', () => {
  it('normalizes line input', () => {
    expect(normalizeOutputLineInput({ id: 2, leftoverQty: '1.23456', leftoverAction: 'bad' })).toEqual({
      id: 2,
      leftoverQty: 1.235,
      leftoverAction: null,
    });
    expect(normalizeOutputLineInput({ id: -1 })).toBeNull();
  });

  it('requires good portions and leftover action', () => {
    const l = { ...line(), name: 'Картопля', leftoverQty: 2, leftoverAction: null };
    const fact = { ...EMPTY_FACT, portionsGood: 480 };
    expect(outputSignErrors(EMPTY_FACT, [])).toHaveLength(1);
    expect(outputSignErrors(fact, [l])[0]).toContain('залишком');
    expect(outputSignErrors(fact, [{ ...l, leftoverAction: 'keep_vp' }])).toEqual([]);
    expect(outputSignErrors(fact, [{ ...l, leftoverQty: 50, leftoverAction: 'return_sp' }])[0]).toContain('більший');
  });
});
