import { describe, expect, it } from 'vitest';
import {
  effectiveLossPercent,
  grossFromNet,
  isLossSplitValid,
  lossEntriesKey,
  normalizeLossEntries,
  normalizeLossFormula,
  parseLossEntriesKey,
  resolveCookingLossPercent,
  sumLossPercent,
} from './catalogLoss.js';

const POTATO = [
  { typeId: 1, percent: 32 },
  { typeId: 2, percent: 12 },
];

describe('normalizeLossEntries', () => {
  it('drops zeros, invalid ids and duplicate types; empty → null', () => {
    expect(
      normalizeLossEntries([
        { typeId: 1, percent: 32 },
        { typeId: 1, percent: 5 },
        { typeId: 0, percent: 10 },
        { typeId: 2, percent: 0 },
        { typeId: 3, percent: 150 },
        null,
      ]),
    ).toEqual([
      { typeId: 1, percent: 32 },
      { typeId: 3, percent: 100 },
    ]);
    expect(normalizeLossEntries([])).toBeNull();
    expect(normalizeLossEntries(null)).toBeNull();
    expect(normalizeLossEntries('not json')).toBeNull();
  });

  it('parses JSON string from DB', () => {
    expect(normalizeLossEntries(JSON.stringify(POTATO))).toEqual(POTATO);
  });
});

describe('gross formulas (potato 171.6 kg net, 32% + 12%)', () => {
  it('additive matches Excel: net / (1 − Σp)', () => {
    expect(grossFromNet(171.6, { losses: POTATO }, 'additive')).toBeCloseTo(306.4286, 3);
    expect(effectiveLossPercent({ losses: POTATO }, 'additive')).toBe(44);
  });

  it('sequential: net / Π(1 − p)', () => {
    expect(grossFromNet(171.6, { losses: POTATO }, 'sequential')).toBeCloseTo(286.7647, 3);
    expect(effectiveLossPercent({ losses: POTATO }, 'sequential')).toBeCloseTo(40.16, 6);
  });

  it('falls back to cookingLossPercent without split', () => {
    expect(grossFromNet(10, { cookingLossPercent: 50 }, 'sequential')).toBe(20);
    expect(grossFromNet(10, { cookingLossPercent: 100 })).toBe(10);
    expect(grossFromNet(10, { losses: [], cookingLossPercent: 0 })).toBe(10);
  });

  it('additive ≥ 100% keeps gross = net', () => {
    const over = [
      { typeId: 1, percent: 60 },
      { typeId: 2, percent: 50 },
    ];
    expect(grossFromNet(10, { losses: over }, 'additive')).toBe(10);
    expect(isLossSplitValid(over, 'additive')).toBe(false);
    expect(isLossSplitValid(over, 'sequential')).toBe(true);
  });
});

describe('helpers', () => {
  it('sum and resolved cookingLossPercent', () => {
    expect(sumLossPercent(POTATO)).toBe(44);
    expect(resolveCookingLossPercent(POTATO, 10)).toBe(44);
    expect(resolveCookingLossPercent(null, 10)).toBe(10);
    expect(resolveCookingLossPercent(null, -5)).toBe(0);
  });

  it('key is order-independent and round-trips', () => {
    const key = lossEntriesKey([...POTATO].reverse());
    expect(key).toBe('1:32|2:12');
    expect(lossEntriesKey(POTATO)).toBe(key);
    expect(lossEntriesKey(null)).toBeNull();
    expect(parseLossEntriesKey(key)).toEqual(POTATO);
  });

  it('formula fallback', () => {
    expect(normalizeLossFormula('sequential')).toBe('sequential');
    expect(normalizeLossFormula('x')).toBe('additive');
  });
});
