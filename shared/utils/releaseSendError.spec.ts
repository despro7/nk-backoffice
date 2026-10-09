import { describe, expect, it } from 'vitest';
import {
  buildReleaseSendError,
  extractReleaseSendErrorFromItems,
  formatReleaseSendErrorRaw,
  normalizeReleaseSendError,
} from './releaseSendError.js';

describe('releaseSendError', () => {
  it('humanizes legacy goodPart string for users and keeps raw', () => {
    const raw = 'Dilovod: помилка збереження документа — cant set value of tpGoods.goodPart: bad value, or field doesnt exist';
    const normalized = normalizeReleaseSendError(raw);
    expect(normalized?.message).toMatch(/реальною партією/i);
    expect(normalized?.raw).toBe(raw);
    expect(normalized?.source).toBe('dilovod');
  });

  it('validation error without Dilovod raw has message only', () => {
    const info = buildReleaseSendError({
      message: 'SKU 01010: некоректна кількість партії',
      source: 'validation',
    });
    expect(normalizeReleaseSendError(info)).toEqual({
      message: 'SKU 01010: некоректна кількість партії',
      source: 'validation',
    });
    expect(info.raw).toBeUndefined();
  });

  it('dilovod failure keeps human message and API raw separately', () => {
    const raw = JSON.stringify({ error: 'cant set value of tpGoods.goodPart: bad value' }, null, 2);
    const info = buildReleaseSendError({
      message: 'Обрана партія не є реальною партією Dilovod (catalogs.goodParts). Оберіть іншу партію або створіть нову — Dilovod відхиляє такий goodPart.',
      raw,
      source: 'dilovod',
    });
    expect(normalizeReleaseSendError(info)?.raw).toContain('tpGoods.goodPart');
    expect(normalizeReleaseSendError(info)?.message).toMatch(/реальною партією/i);
  });

  it('formats dilovodResponse JSON as raw', () => {
    expect(formatReleaseSendErrorRaw({ error: 'boom' })).toContain('"error": "boom"');
  });

  it('extracts from release items', () => {
    const items = [{ dilovod_send_error: 'plain error' }];
    expect(extractReleaseSendErrorFromItems(items)?.message).toBe('plain error');
  });
});
