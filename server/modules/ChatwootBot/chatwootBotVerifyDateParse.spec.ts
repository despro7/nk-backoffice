import { describe, expect, it } from 'vitest';
import { parseUserOrderDate } from './chatwootBotVerifyDateParse.js';

describe('parseUserOrderDate', () => {
  it('parses dotted and iso dates', () => {
    expect(parseUserOrderDate('замовлення 19.10.2026')).toBe('2026-10-19');
    expect(parseUserOrderDate('2026-10-19')).toBe('2026-10-19');
  });

  it('parses Ukrainian month text', () => {
    expect(parseUserOrderDate('19 жовтня 2026')).toBe('2026-10-19');
  });
});
