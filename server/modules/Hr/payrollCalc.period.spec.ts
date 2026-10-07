import { describe, expect, it } from 'vitest';
import { calendarWeekSequenceFromYearStart } from '../../../shared/utils/hrWorkWeekPeriods.js';
import { calculatePayrollLineWithTaxes } from './payrollCalc.js';

describe('payroll period helpers', () => {
  it('номерує календарні тижні з початку року', () => {
    expect(calendarWeekSequenceFromYearStart('2026-01-12')).toBe(3);
  });

  it('рахує повний виробничий тиждень на межі місяців, але місячний підсумок — лише за поточний місяць', () => {
    const result = calculatePayrollLineWithTaxes({
      payGroup: 'hourly',
      rateKind: 'hourly',
      rate: 100,
      normHours: 168,
      monthStart: '2026-10-01',
      monthEnd: '2026-10-31',
      weeks: [
        {
          id: '2026-09-28',
          label: '40 · 28 вер – 4 жов',
          startDate: '2026-09-28',
          endDate: '2026-10-04',
          colSpan: 7,
        },
      ],
      entries: [
        { date: '2026-09-28', kind: 'work', hours: 8 },
        { date: '2026-09-29', kind: 'work', hours: 8 },
        { date: '2026-09-30', kind: 'work', hours: 8 },
        { date: '2026-10-01', kind: 'work', hours: 7.5 },
        { date: '2026-10-02', kind: 'work', hours: 7.5 },
      ],
      taxRules: [],
    });

    expect(result.weekAmounts[0]?.hours).toBe('39.00');
    expect(Number(result.weekAmounts[0]?.toPay)).toBe(3900);
    expect(result.toPayAmount).toBe('1500.00');
    expect(result.hoursByKind.work).toBe('15.00');
  });

  it('рахує тижневі суми для кількох періодів', () => {
    const result = calculatePayrollLineWithTaxes({
      payGroup: 'hourly',
      rateKind: 'hourly',
      rate: 100,
      normHours: 168,
      weeks: [
        { id: 'w1', label: '1', startDate: '2026-03-02', endDate: '2026-03-08', colSpan: 7 },
        { id: 'w2', label: '2', startDate: '2026-03-09', endDate: '2026-03-15', colSpan: 7 },
      ],
      entries: [
        { date: '2026-03-03', kind: 'work', hours: 8 },
        { date: '2026-03-10', kind: 'work', hours: 4 },
      ],
      taxRules: [],
    });
    expect(result.weekAmounts).toHaveLength(2);
    expect(Number(result.weekAmounts[0]?.toPay)).toBe(800);
    expect(Number(result.weekAmounts[1]?.toPay)).toBe(400);
  });
});
