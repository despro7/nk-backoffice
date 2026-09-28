import { describe, expect, it } from 'vitest';
import { formatNetWeightLabel, formatNetWeightRangeLabel } from './productLabel.js';

describe('formatNetWeightLabel', () => {
  it('formats grams with non-breaking space below 1 kg', () => {
    expect(formatNetWeightLabel(0.4)).toBe('400\u00A0г');
  });

  it('formats large weights as kg with decimal comma', () => {
    expect(formatNetWeightLabel(11.7)).toBe('11,7\u00A0кг');
    expect(formatNetWeightLabel(1)).toBe('1\u00A0кг');
  });
});

describe('formatNetWeightRangeLabel', () => {
  it('formats gram range with non-breaking space', () => {
    expect(formatNetWeightRangeLabel(0.4, 0.45)).toBe('400-450\u00A0г');
  });

  it('formats kg range when max is at least 1 kg', () => {
    expect(formatNetWeightRangeLabel(1, 1.5)).toBe('1-1,5\u00A0кг');
  });
});
