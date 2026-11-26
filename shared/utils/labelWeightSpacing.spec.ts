import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LABEL_WEIGHT_SPACING,
  parseLabelWeightSpacingSettings,
  resolveLabelWeightSpacing,
  sanitizeLabelWeightSpacingOverride,
} from './labelWeightSpacing.js';
import {
  formatNetWeightForLabel,
  formatNetWeightToleranceLabel,
  formatNetWeightWithSuffix,
} from './productLabel.js';

describe('labelWeightSpacing settings', () => {
  it('falls back to defaults for empty or broken values', () => {
    expect(parseLabelWeightSpacingSettings(null)).toEqual({
      defaults: DEFAULT_LABEL_WEIGHT_SPACING,
      overrides: {},
    });
    expect(parseLabelWeightSpacingSettings({ defaults: { unit: 'huge' } }).defaults).toEqual(
      DEFAULT_LABEL_WEIGHT_SPACING,
    );
  });

  it('allows «wide» only between weight and ℮ / ±', () => {
    expect(sanitizeLabelWeightSpacingOverride({ unit: 'wide', suffix: 'wide', tolerance: 'wide' })).toEqual({
      suffix: 'wide',
    });
  });

  it('drops empty overrides', () => {
    expect(sanitizeLabelWeightSpacingOverride({})).toBeNull();
    expect(
      parseLabelWeightSpacingSettings({ overrides: { a: { unit: 'thin' }, b: {} } }).overrides,
    ).toEqual({ a: { unit: 'thin' } });
  });

  it('applies a template override on top of defaults', () => {
    expect(resolveLabelWeightSpacing(DEFAULT_LABEL_WEIGHT_SPACING, { suffix: 'wide' })).toEqual({
      unit: 'hair',
      suffix: 'wide',
      tolerance: 'hair',
    });
  });
});

describe('net weight formatting with spacing', () => {
  it('uses the defaults: hair · normal · hair', () => {
    expect(formatNetWeightWithSuffix('380г', '8%')).toBe('380 г ± 8%');
  });

  it('removes spaces when «none» is chosen', () => {
    const none = { unit: 'none', suffix: 'none', tolerance: 'none' } as const;
    expect(formatNetWeightWithSuffix('380 г', '8%', none)).toBe('380г±8%');
  });

  it('uses thin, wide and normal spaces where chosen', () => {
    const spacing = { unit: 'thin', suffix: 'wide', tolerance: 'normal' } as const;
    expect(formatNetWeightWithSuffix('380г', '30г', spacing)).toBe('380 г ± 30 г');
    expect(formatNetWeightWithSuffix('380г', '', spacing)).toBe('380 г ℮');
    expect(formatNetWeightForLabel('1,2 кг', spacing)).toBe('1,2 кг');
    expect(formatNetWeightToleranceLabel('5%', spacing)).toBe('± 5%');
  });
});
