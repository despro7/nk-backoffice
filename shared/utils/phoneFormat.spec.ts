import { describe, expect, it } from 'vitest';
import {
  applyPhoneInputChange,
  formatPhoneInputMask,
  formatUkrainianPhone,
  parseUkrainianPhone,
} from './phoneFormat.js';

describe('parseUkrainianPhone', () => {
  it('parses common input formats', () => {
    const expected = {
      normalized: '380671234567',
      national: '0671234567',
      isValid: true,
    };

    expect(parseUkrainianPhone('380671234567')).toEqual(expected);
    expect(parseUkrainianPhone('0671234567')).toEqual(expected);
    expect(parseUkrainianPhone('+380 67 123 45 67')).toEqual(expected);
    expect(parseUkrainianPhone('+38 (067) 123-45-67')).toEqual(expected);
    expect(parseUkrainianPhone('(067) 123-45-67')).toEqual(expected);
    expect(parseUkrainianPhone('067 123 45 67')).toEqual(expected);
    expect(parseUkrainianPhone('671234567')).toEqual(expected);
  });

  it('flags invalid numbers', () => {
    expect(parseUkrainianPhone('')).toMatchObject({ isValid: false });
    expect(parseUkrainianPhone('abc')).toMatchObject({ isValid: false });
    expect(parseUkrainianPhone('12345')).toMatchObject({ isValid: false });
    expect(parseUkrainianPhone('38067123456')).toMatchObject({ isValid: false });
    expect(parseUkrainianPhone('3806712345678')).toMatchObject({ isValid: false });
    expect(parseUkrainianPhone('99123456789')).toMatchObject({ isValid: false });
  });
});

describe('formatUkrainianPhone', () => {
  const phone = '380671234567';

  it('formats international style', () => {
    expect(formatUkrainianPhone(phone, 'international')).toBe('+38 (067) 123-45-67');
  });

  it('formats national style', () => {
    expect(formatUkrainianPhone(phone, 'national')).toBe('(067) 123-45-67');
  });

  it('formats spaced style', () => {
    expect(formatUkrainianPhone(phone, 'spaced')).toBe('067 123 45 67');
  });

  it('returns placeholder for empty values', () => {
    expect(formatUkrainianPhone(null)).toBe('—');
    expect(formatUkrainianPhone('', { emptyPlaceholder: '-' })).toBe('-');
  });

  it('returns raw value for invalid numbers', () => {
    expect(formatUkrainianPhone('12345')).toBe('12345');
  });
});

describe('formatPhoneInputMask', () => {
  it('formats progressive input mask', () => {
    expect(formatPhoneInputMask('38067')).toBe('+38 (067');
    expect(formatPhoneInputMask('38067123')).toBe('+38 (067) 123');
    expect(formatPhoneInputMask('38067123456')).toBe('+38 (067) 123-45-6');
    expect(formatPhoneInputMask('380671234567')).toBe('+38 (067) 123-45-67');
  });
});

describe('applyPhoneInputChange', () => {
  it('stores normalized digits and returns masked display', () => {
    expect(applyPhoneInputChange('067 123 45 67')).toEqual({
      stored: '380671234567',
      display: '+38 (067) 123-45-67',
    });
  });
});
