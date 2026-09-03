import { describe, expect, it } from 'vitest';
import { hrEmployeeImportKey, hrEmploymentImportKey } from '../../../shared/types/hr';
import { buildTimesheetMonthMeta } from '../../../shared/utils/hrTimesheetCalendar';
import {
  HR_PAYROLL_FORMULA_V1,
  calculatePayrollLine,
  collectHoursByKind,
  moneyStr,
  roundMoney,
} from './payrollCalc';

/**
 * Фікстури з Табель 2026.xlsx (аркуш «Серпень 08»), не читати xlsx у runtime.
 * Офіційні: BE = ставка / 168 * години_періоду; BF = BE * 0.23; BG = BE / 0.77
 * Погодинні: BE = ставка * години
 * Нештатні: BE = ставка * години, без коефіцієнтів
 */
const AUGUST_NORM_HOURS = 168;
const FORMULA = HR_PAYROLL_FORMULA_V1;

describe('payrollCalc — Excel Табель 2026', () => {
  it('округлює як копійки', () => {
    expect(moneyStr(22000 * 40 / 168)).toBe('5238.10');
    expect(roundMoney(5238.1 * 0.23)).toBe(1204.76);
    expect(roundMoney(5238.1 / 0.77)).toBe(6802.73);
  });

  it('офіційна ставка: ставка × години / норма, ×0.23 і /0.77 (Прокопенко 22000 / 168 × 40)', () => {
    const weeks = [
      { id: 'w1', label: 'тест', startDate: '2026-08-03', endDate: '2026-08-07', colSpan: 5 },
    ];
    const result = calculatePayrollLine({
      payGroup: 'official_salary',
      rateKind: 'salary',
      rate: 22000,
      normHours: AUGUST_NORM_HOURS,
      weeks,
      formula: FORMULA,
      entries: [
        { date: '2026-08-03', kind: 'work', hours: 8 },
        { date: '2026-08-04', kind: 'work', hours: 8 },
        { date: '2026-08-05', kind: 'work', hours: 8 },
        { date: '2026-08-06', kind: 'work', hours: 8 },
        { date: '2026-08-07', kind: 'work', hours: 8 },
      ],
    });
    expect(result.formulaId).toBe('tabell-2026-v1');
    expect(result.ratesUsed).toEqual(FORMULA);
    expect(result.hoursByKind.work).toBe('40.00');
    expect(result.accruedAmount).toBe('5238.10');
    expect(result.extraAmount).toBe('1204.76');
    expect(result.toPayAmount).toBe('6802.73');
    expect(result.skipReason).toBeNull();
    expect(result.breakdown.some((step) => /ЄСВ|ПДФО/i.test(step.label))).toBe(false);
  });

  it('погодинні: ставка × факт-години без /норма і без дільника (108 × 12.5)', () => {
    const weeks = [
      { id: 'w1', label: 'тест', startDate: '2026-08-10', endDate: '2026-08-14', colSpan: 5 },
    ];
    const result = calculatePayrollLine({
      payGroup: 'hourly',
      rateKind: 'hourly',
      rate: 108,
      normHours: AUGUST_NORM_HOURS,
      weeks,
      formula: FORMULA,
      entries: [
        { date: '2026-08-10', kind: 'work', hours: 8 },
        { date: '2026-08-11', kind: 'work', hours: 4.5 },
      ],
    });
    expect(result.accruedAmount).toBe('1350.00');
    expect(result.extraAmount).toBe('0.00');
    expect(result.toPayAmount).toBe('1350.00');
  });

  it('нештатні готівка: ставка × години (90 × 8)', () => {
    const weeks = [
      { id: 'w1', label: 'тест', startDate: '2026-08-17', endDate: '2026-08-17', colSpan: 1 },
    ];
    const result = calculatePayrollLine({
      payGroup: 'unofficial_cash',
      rateKind: 'hourly',
      rate: 90,
      normHours: AUGUST_NORM_HOURS,
      weeks,
      formula: FORMULA,
      entries: [{ date: '2026-08-17', kind: 'work', hours: 8 }],
    });
    expect(result.toPayAmount).toBe('720.00');
    expect(result.extraAmount).toBe('0.00');
  });

  it('відпустка/лікарняний не йдуть через ставка × години', () => {
    const weeks = [
      { id: 'w1', label: 'тест', startDate: '2026-08-03', endDate: '2026-08-07', colSpan: 5 },
    ];
    const result = calculatePayrollLine({
      payGroup: 'official_salary',
      rateKind: 'salary',
      rate: 20000,
      normHours: AUGUST_NORM_HOURS,
      weeks,
      formula: FORMULA,
      entries: [
        { date: '2026-08-03', kind: 'О', hours: null },
        { date: '2026-08-04', kind: 'ТН', hours: null },
        { date: '2026-08-05', kind: 'В', hours: null },
      ],
    });
    expect(result.toPayAmount).toBe('0.00');
    expect(result.skipReason).toBe('leave_not_accrued');
    expect(result.hoursByKind.О).toBe('1.00');
    expect(result.hoursByKind.ТН).toBe('1.00');
  });

  it('знімок формули не залежить від дефолтних констант', () => {
    const weeks = [
      { id: 'w1', label: 'тест', startDate: '2026-08-03', endDate: '2026-08-03', colSpan: 1 },
    ];
    const lockedFormula = { formulaId: 'tabell-2026-v1', extraRate: '0.10', grossDivisor: '0.50' };
    const result = calculatePayrollLine({
      payGroup: 'official_salary',
      rateKind: 'salary',
      rate: 1680,
      normHours: 168,
      weeks,
      formula: lockedFormula,
      entries: [{ date: '2026-08-03', kind: 'work', hours: 8 }],
    });
    expect(result.accruedAmount).toBe('80.00');
    expect(result.extraAmount).toBe('8.00');
    expect(result.toPayAmount).toBe('160.00');
    expect(result.ratesUsed).toEqual(lockedFormula);
  });

  it('розкладає суми по тижневих вікнах як GET timesheet', () => {
    const meta = buildTimesheetMonthMeta(2026, 9);
    const first = meta.weeks[0];
    const result = calculatePayrollLine({
      payGroup: 'hourly',
      rateKind: 'hourly',
      rate: 100,
      normHours: Number(meta.normHours),
      weeks: meta.weeks,
      entries: [
        { date: '2026-09-01', kind: 'work', hours: 8 },
        { date: '2026-09-02', kind: 'work', hours: 8 },
        { date: '2026-09-07', kind: 'work', hours: 4 },
      ],
    });
    const week0 = result.weekAmounts.find((item) => item.weekId === first?.id);
    const week1 = result.weekAmounts.find((item) => item.weekId === meta.weeks[1]?.id);
    expect(week0?.hours).toBe('16.00');
    expect(week0?.toPay).toBe('1600.00');
    expect(week1?.hours).toBe('4.00');
    expect(week1?.toPay).toBe('400.00');
    expect(result.toPayAmount).toBe('2000.00');
  });

  it('рахує коди дня окремо від робочих годин', () => {
    const { hoursByKind, workHours, leaveDays } = collectHoursByKind([
      { date: '2026-08-03', kind: 'work', hours: 7.5 },
      { date: '2026-08-04', kind: 'В', hours: null },
      { date: '2026-08-05', kind: 'О', hours: null },
    ]);
    expect(workHours).toBe(7.5);
    expect(leaveDays).toBe(1);
    expect(hoursByKind.work).toBe('7.50');
    expect(hoursByKind.В).toBe('1.00');
    expect(hoursByKind.О).toBe('1.00');
  });

  it('стабільні ключі зайнятості для PR4', () => {
    const employeeKey = hrEmployeeImportKey('Прокопенко', 'Олена', null);
    expect(employeeKey).toBe('прокопенко|олена');
    expect(
      hrEmploymentImportKey(employeeKey, 'fop', 'official_salary', '2026-01-01'),
    ).toBe('прокопенко|олена::fop::official_salary::2026-01-01');
  });
});
