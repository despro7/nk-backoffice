import { describe, expect, it } from 'vitest';
import {
  formatNetWeightLabel,
  formatNetWeightRangeLabel,
  formatNetWeightToleranceLabel,
  formatNetWeightToleranceSpec,
  tightenWeightUnitSpacing,
  parseNetWeightTolerance,
} from './productLabel.js';

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

describe('parseNetWeightTolerance', () => {
  it('parses percent and gram specs', () => {
    expect(parseNetWeightTolerance('5%')).toEqual({ value: 5, unit: 'pct' });
    expect(parseNetWeightTolerance('±20 г')).toEqual({ value: 20, unit: 'g' });
    expect(parseNetWeightTolerance('5,5 %')).toEqual({ value: 5.5, unit: 'pct' });
  });

  it('returns null for empty, zero and garbage', () => {
    expect(parseNetWeightTolerance('')).toBeNull();
    expect(parseNetWeightTolerance('0%')).toBeNull();
    expect(parseNetWeightTolerance('abc')).toBeNull();
  });

  it('round-trips the stored spec', () => {
    expect(formatNetWeightToleranceSpec({ value: 5.5, unit: 'pct' })).toBe('5,5%');
    expect(parseNetWeightTolerance(formatNetWeightToleranceSpec({ value: 20, unit: 'g' }))).toEqual({
      value: 20,
      unit: 'g',
    });
  });
});

describe('formatNetWeightToleranceLabel', () => {
  it('keeps percent as percent, with a hair space after ±', () => {
    expect(formatNetWeightToleranceLabel('8%')).toBe('±\u200A8%');
    expect(formatNetWeightToleranceLabel('5,5 %')).toBe('±\u200A5,5%');
  });

  it('keeps grams as grams, hair space before the unit', () => {
    expect(formatNetWeightToleranceLabel('30г')).toBe('±\u200A30\u200Aг');
  });

  it('is empty without spec', () => {
    expect(formatNetWeightToleranceLabel('')).toBe('');
  });
});

describe('tightenWeightUnitSpacing', () => {
  it('puts a hair space between number and unit', () => {
    expect(tightenWeightUnitSpacing('380г')).toBe('380\u200Aг');
    expect(tightenWeightUnitSpacing('300 г')).toBe('300\u200Aг');
    expect(tightenWeightUnitSpacing('300\u00A0г')).toBe('300\u200Aг');
    expect(tightenWeightUnitSpacing('1,2 кг')).toBe('1,2\u200Aкг');
  });

  it('leaves words starting with г untouched', () => {
    expect(tightenWeightUnitSpacing('3 гриби')).toBe('3 гриби');
  });
});
