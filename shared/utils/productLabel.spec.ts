import { describe, expect, it } from 'vitest';
import { formatNetWeightLabel, formatNetWeightRangeLabel } from './productLabel.js';

describe('formatNetWeightLabel', () => {
  it('formats grams without space before unit below 1 kg', () => {
    expect(formatNetWeightLabel(0.4)).toBe('400г');
  });

  it('formats large weights as kg with decimal comma', () => {
    expect(formatNetWeightLabel(11.7)).toBe('11,7кг');
    expect(formatNetWeightLabel(1)).toBe('1кг');
  });
});

describe('formatNetWeightRangeLabel', () => {
  it('formats gram range without space before unit', () => {
    expect(formatNetWeightRangeLabel(0.4, 0.45)).toBe('400-450г');
  });

  it('formats kg range when max is at least 1 kg', () => {
    expect(formatNetWeightRangeLabel(1, 1.5)).toBe('1-1,5кг');
  });
});
