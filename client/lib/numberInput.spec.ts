import { describe, expect, it } from 'vitest';
import {
  formatNumberInput,
  formatNumberInputFromRaw,
  parseNumberInput,
  sanitizeNumberInput,
} from './numberInput';

describe('sanitizeNumberInput', () => {
  it('залишає лише цифри та один роздільник', () => {
    expect(sanitizeNumberInput('12a3,45b6', { decimalPlaces: 3 })).toBe('123,456');
  });

  it('зводить крапку до коми за замовчуванням', () => {
    expect(sanitizeNumberInput('1.25', { decimalPlaces: 3 })).toBe('1,25');
    expect(sanitizeNumberInput('1,25', { decimalPlaces: 3 })).toBe('1,25');
  });

  it('зводить кому до крапки, якщо роздільник — крапка', () => {
    expect(
      sanitizeNumberInput('1,25', { decimalSeparator: '.', decimalPlaces: 2 }),
    ).toBe('1.25');
  });

  it('ігнорує повторні роздільники', () => {
    expect(sanitizeNumberInput('1.2,3.4', { decimalPlaces: 3 })).toBe('1,234');
  });

  it('обрізає дробову частину до decimalPlaces', () => {
    expect(sanitizeNumberInput('1,12345', { decimalPlaces: 3 })).toBe('1,123');
    expect(sanitizeNumberInput('1.12345', { decimalPlaces: 2 })).toBe('1,12');
  });

  it('для integer відкидає роздільник і дробову частину', () => {
    expect(sanitizeNumberInput('12,3', { decimalPlaces: 0 })).toBe('12');
    expect(sanitizeNumberInput('12.3', { decimalPlaces: 0 })).toBe('12');
  });

  it('дозволяє проміжний стан з роздільником без дробу', () => {
    expect(sanitizeNumberInput('0,', { decimalPlaces: 3 })).toBe('0,');
    expect(sanitizeNumberInput(',', { decimalPlaces: 2 })).toBe(',');
  });

  it('мінус лише коли allowNegative', () => {
    expect(sanitizeNumberInput('-12,5', { allowNegative: false })).toBe('12,5');
    expect(sanitizeNumberInput('-12,5', { allowNegative: true })).toBe('-12,5');
  });
});

describe('parseNumberInput', () => {
  it('парсить кому і крапку', () => {
    expect(parseNumberInput('1,5')).toBe(1.5);
    expect(parseNumberInput('1.5')).toBe(1.5);
  });

  it('порожнє і сміття → null', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('  ')).toBeNull();
    expect(parseNumberInput(',')).toBeNull();
  });
});

describe('formatNumberInput', () => {
  it('форматує з комою і фіксованими знаками', () => {
    expect(formatNumberInput(1.2, { decimalPlaces: 3 })).toBe('1,200');
  });

  it('обрізає хвостові нулі за потреби', () => {
    expect(formatNumberInput(1.2, { decimalPlaces: 3, trimTrailingZeros: true })).toBe('1,2');
    expect(formatNumberInput(2, { decimalPlaces: 3, trimTrailingZeros: true })).toBe('2');
  });

  it('клампить min/max', () => {
    expect(formatNumberInput(0, { min: 1, decimalPlaces: 0 })).toBe('1');
    expect(formatNumberInput(99, { max: 10, decimalPlaces: 0 })).toBe('10');
  });

  it('округлює до decimalPlaces, не до 2 заздалегідь', () => {
    expect(formatNumberInput(0.123, { decimalPlaces: 3 })).toBe('0,123');
  });
});

describe('formatNumberInputFromRaw', () => {
  it('лишає порожнє, якщо emptyAs=keep', () => {
    expect(formatNumberInputFromRaw('', { emptyAs: 'keep', min: 1 })).toBe('');
  });

  it('підставляє min, якщо emptyAs=min', () => {
    expect(formatNumberInputFromRaw('', { emptyAs: 'min', min: 1, decimalPlaces: 0 })).toBe(
      '1',
    );
  });

  it('нормалізує введене значення', () => {
    expect(formatNumberInputFromRaw('1.5', { decimalPlaces: 3 })).toBe('1,500');
  });
});
