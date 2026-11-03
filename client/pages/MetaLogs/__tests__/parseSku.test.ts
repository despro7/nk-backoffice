import { describe, it, expect } from 'vitest';
import { parseSkuFromMessage } from '@/lib/metaLogsParser';

describe('parseSkuFromMessage', () => {
  it('parses арт: token', () => {
    expect(parseSkuFromMessage('Фрикадельки | арт: 03018 | потрібно: 2')).toBe('03018');
  });

  it('parses Артикул token', () => {
    expect(parseSkuFromMessage('Товар X. Артикул: 03013; залишок 0')).toBe('03013');
  });

  it('handles product names containing "арт" substring', () => {
    const msg = 'Картопля тушкована зі спеціями | арт: 03014 | потрібно: 10';
    expect(parseSkuFromMessage(msg)).toBe('03014');
  });
});
