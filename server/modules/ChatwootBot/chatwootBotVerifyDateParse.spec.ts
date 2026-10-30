import { describe, expect, it } from 'vitest';
import {
  extractOrderNumberToken,
  hasVerifyCredentialToken,
  parseUserOrderDate,
} from './chatwootBotVerifyDateParse.js';

describe('parseUserOrderDate', () => {
  it('parses dotted and iso dates', () => {
    expect(parseUserOrderDate('замовлення 19.10.2026')).toBe('2026-10-19');
    expect(parseUserOrderDate('2026-10-19')).toBe('2026-10-19');
  });

  it('parses Ukrainian month text', () => {
    expect(parseUserOrderDate('19 жовтня 2026')).toBe('2026-10-19');
  });

  it('parses date next to phone (real chat input)', () => {
    expect(parseUserOrderDate('0978244639, 26.10.2026')).toBe('2026-10-26');
  });
});

describe('extractOrderNumberToken', () => {
  it('does not treat phone as order number (real chat input)', () => {
    expect(extractOrderNumberToken('0978244639, 26.10.2026')).toBeNull();
    expect(extractOrderNumberToken('0978244639')).toBeNull();
    expect(extractOrderNumberToken('+380 97 824 46 39')).toBeNull();
    expect(extractOrderNumberToken('+380978244639 від 26.10.2026')).toBeNull();
  });

  it('extracts order number next to phone (real chat input)', () => {
    expect(extractOrderNumberToken('0978244639 замовлення 24155')).toBe('24155');
    expect(extractOrderNumberToken('мій номер 0978244639 замовлення №123456')).toBe('123456');
  });

  it('extracts order number after Cyrillic keyword and symbols', () => {
    expect(extractOrderNumberToken('Замовлення 24155')).toBe('24155');
    expect(extractOrderNumberToken('замовлення: 24155')).toBe('24155');
    expect(extractOrderNumberToken('по замовленню номер 24155')).toBe('24155');
    expect(extractOrderNumberToken('№24155')).toBe('24155');
    expect(extractOrderNumberToken('#24155')).toBe('24155');
    expect(extractOrderNumberToken('order 24155')).toBe('24155');
  });

  it('extracts SD-prefixed order number and normalizes it', () => {
    expect(extractOrderNumberToken('SD9547')).toBe('SD9547');
    expect(extractOrderNumberToken('замовлення SD24155')).toBe('SD24155');
    expect(extractOrderNumberToken('0978244639 sd 24155')).toBe('SD24155');
    expect(extractOrderNumberToken('№ SD-24155')).toBe('SD24155');
    expect(extractOrderNumberToken('сд24155, 0978244639')).toBe('SD24155');
  });

  it('extracts bare order number', () => {
    expect(extractOrderNumberToken('24155')).toBe('24155');
    expect(extractOrderNumberToken('замовлення 100245')).toBe('100245');
    expect(extractOrderNumberToken('0978244639 100245')).toBe('100245');
    expect(extractOrderNumberToken('24155, 0978244639')).toBe('24155');
  });

  it('ignores keyword without digits and short numbers', () => {
    expect(extractOrderNumberToken('де моє замовлення?')).toBeNull();
    expect(extractOrderNumberToken('order status')).toBeNull();
    expect(extractOrderNumberToken('замовив 2 пачки на 350 грн')).toBeNull();
  });
});

describe('hasVerifyCredentialToken', () => {
  it('detects order number or date, but not phone alone', () => {
    expect(hasVerifyCredentialToken('0978244639, 26.10.2026')).toBe(true);
    expect(hasVerifyCredentialToken('0978244639 замовлення 24155')).toBe(true);
    expect(hasVerifyCredentialToken('мій телефон +380501112233')).toBe(false);
  });
});
