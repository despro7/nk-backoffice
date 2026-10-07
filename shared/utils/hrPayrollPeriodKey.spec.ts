import { describe, expect, it } from 'vitest';
import { buildPayrollPeriodKey, parsePayrollPeriodKey } from './hrPayrollPeriodKey.js';

describe('hrPayrollPeriodKey', () => {
  it('будує ключі для production і month', () => {
    expect(buildPayrollPeriodKey('production')).toBe('production');
    expect(buildPayrollPeriodKey('month')).toBe('month');
  });

  it('будує ключ для custom з діапазоном дат', () => {
    expect(buildPayrollPeriodKey('custom', '2026-10-01', '2026-10-15')).toBe(
      'custom:2026-10-01:2026-10-15',
    );
  });

  it('парсить ключ назад у режим і дати', () => {
    expect(parsePayrollPeriodKey('production')).toEqual({
      periodMode: 'production',
      dateFrom: null,
      dateTo: null,
    });
    expect(parsePayrollPeriodKey('custom:2026-10-01:2026-10-15')).toEqual({
      periodMode: 'custom',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-15',
    });
  });
});
