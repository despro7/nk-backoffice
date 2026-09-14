import { describe, expect, it } from 'vitest';
import { applyTaxRules, calculatePayrollLineWithTaxes } from './payrollCalc';

const DEFAULT_TAX_RULES = [
  { code: 'esv', label: 'ЄСВ', rate: 0.22, payer: 'employer' as const, base: 'gross' as const, sortOrder: 0 },
  { code: 'pdfo', label: 'ПДФО', rate: 0.18, payer: 'employee' as const, base: 'gross' as const, sortOrder: 1 },
  { code: 'military', label: 'Військовий', rate: 0.05, payer: 'employee' as const, base: 'gross' as const, sortOrder: 2 },
];

describe('payrollCalc taxes', () => {
  it('рахує gross, ЄСВ і ФОП для official_salary', () => {
    const tax = applyTaxRules('official_salary', 5238.1, DEFAULT_TAX_RULES, 0);
    expect(Number(tax.grossAccrued)).toBeCloseTo(6802.73, 1);
    expect(Number(tax.esvAmount)).toBeCloseTo(1496.6, 0);
    expect(Number(tax.employerTotalCost)).toBeCloseTo(8299.33, 0);
    expect(tax.taxBreakdown).toHaveLength(3);
  });

  it('додає премію з ЄСВ для official_salary', () => {
    const tax = applyTaxRules('official_salary', 5238.1, DEFAULT_TAX_RULES, 1000);
    expect(Number(tax.bonusAmount)).toBe(1000);
    expect(Number(tax.employerTotalCost)).toBeGreaterThan(9299);
  });

  it('для hourly — accrued + bonus без податків', () => {
    const tax = applyTaxRules('hourly', 1350, [], 200);
    expect(tax.grossAccrued).toBe('1350.00');
    expect(tax.employerTotalCost).toBe('1550.00');
    expect(tax.esvAmount).toBe('0.00');
  });

  it('calculatePayrollLineWithTaxes інтегрує податки в результат', () => {
    const result = calculatePayrollLineWithTaxes({
      payGroup: 'official_salary',
      rateKind: 'salary',
      rate: 22000,
      normHours: 168,
      weeks: [{ id: 'w1', label: 'тест', startDate: '2026-08-03', endDate: '2026-08-07', colSpan: 5 }],
      entries: [
        { date: '2026-08-03', kind: 'work', hours: 8 },
        { date: '2026-08-04', kind: 'work', hours: 8 },
        { date: '2026-08-05', kind: 'work', hours: 8 },
        { date: '2026-08-06', kind: 'work', hours: 8 },
        { date: '2026-08-07', kind: 'work', hours: 8 },
      ],
      taxRules: DEFAULT_TAX_RULES,
      bonusAmount: 500,
    });
    expect(Number(result.employerTotalCost)).toBeGreaterThan(Number(result.grossAccrued));
    expect(result.taxBreakdown.length).toBeGreaterThan(0);
    expect(result.breakdown.some((step) => step.id === 'employer-cost')).toBe(true);
  });
});
