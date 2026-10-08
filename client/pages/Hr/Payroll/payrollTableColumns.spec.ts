import { describe, expect, it } from 'vitest';
import type { HrPayrollLineDto } from '@shared/types/hr';
import { DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG } from '@shared/types/tableBuilder';
import {
  buildCustomDisplayWeeks,
  buildPayrollExtraColumns,
  customWeekCellRaw,
  shouldShowTaxColumns,
} from './payrollTableColumns';

function line(partial: Partial<HrPayrollLineDto>): HrPayrollLineDto {
  return {
    id: null,
    employmentId: 1,
    employeeId: 1,
    displayName: 'Test',
    payGroup: 'official_salary',
    legalEntityName: 'LLC',
    legalEntityCode: 'llc',
    employmentImportKey: 'k',
    formulaId: 'f',
    rate: '0',
    rateKind: 'salary',
    normHours: '168',
    hoursByKind: { work: '0', В: '0', О: '0', ТН: '0', Н: '0', Пр: '0', Св: '0' },
    ratesUsed: { formulaId: 'f', extraRate: '0', grossDivisor: '1' },
    weekAmounts: [],
    breakdown: [],
    accruedAmount: '0',
    extraAmount: '0',
    toPayAmount: '0',
    grossAccrued: '0',
    netToPay: '0',
    employerTotalCost: '0',
    bonusAmount: '0',
    esvAmount: '0',
    taxAmount: '0',
    pdfoAmount: '100',
    militaryTaxAmount: '0',
    taxBreakdown: [
      { code: 'pdfo', label: 'ПДФО', rate: '0.18', amount: '100.00', payer: 'employee' },
    ],
    skipReason: null,
    cardMasked: null,
    cardNumber: null,
    ...partial,
  };
}

describe('payrollTableColumns taxes', () => {
  it('не показує податкові колонки без taxesSeparate', () => {
    expect(shouldShowTaxColumns(line({}), DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG)).toBe(false);
    const columns = buildPayrollExtraColumns(DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG, 'month');
    expect(columns.map((column) => column.id)).toEqual(['total']);
  });

  it('показує податкові колонки з taxesSeparate', () => {
    const config = { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG, taxesSeparate: true };
    expect(shouldShowTaxColumns(line({}), config)).toBe(true);
    const columns = buildPayrollExtraColumns(config, 'production');
    expect(columns.map((column) => column.id)).toEqual(['pdfo-military', 'esv', 'total']);
  });
});

const CUSTOM_WEEKS = [
  { id: 'salary', label: 'ЗП', startDate: '2026-01-01', endDate: '2026-01-15', colSpan: 1 },
  { id: 'taxes', label: 'Податки', startDate: '2026-01-01', endDate: '2026-01-15', colSpan: 1 },
  { id: 'bonus', label: 'Премії', startDate: '2026-01-01', endDate: '2026-01-15', colSpan: 1 },
  { id: 'total', label: 'Разом', startDate: '2026-01-01', endDate: '2026-01-15', colSpan: 1 },
];

describe('payrollTableColumns custom period', () => {
  it('без опцій лишає одну колонку податків', () => {
    const config = {
      ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
      visibleColumns: { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG.visibleColumns, esv: false },
      merges: [],
    };
    const ids = buildCustomDisplayWeeks(CUSTOM_WEEKS, config).map((week) => week.id);
    expect(ids).toEqual(['salary', 'taxes', 'total']);
  });

  it('розбиває податки на ЄСВ і ПДФО+ВЗ', () => {
    const config = { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG, taxesSeparate: false };
    const ids = buildCustomDisplayWeeks(CUSTOM_WEEKS, config).map((week) => week.id);
    expect(ids).toEqual(['salary', 'pdfo-military', 'esv', 'total']);

    const row = line({
      esvAmount: '220.00',
      weekAmounts: [
        { weekId: 'salary', hours: '0', accrued: '0', extra: '0', toPay: '1000.00' },
        { weekId: 'taxes', hours: '0', accrued: '0', extra: '0', toPay: '320.00' },
        { weekId: 'bonus', hours: '0', accrued: '0', extra: '0', toPay: '0.00' },
        { weekId: 'total', hours: '0', accrued: '0', extra: '0', toPay: '1320.00' },
      ],
      taxBreakdown: [
        { code: 'esv', label: 'ЄСВ', rate: '0.22', amount: '220.00', payer: 'employer' },
        { code: 'pdfo', label: 'ПДФО', rate: '0.18', amount: '100.00', payer: 'employee' },
      ],
    });
    expect(customWeekCellRaw(row, 'esv', config)).toBe('220.00');
    expect(customWeekCellRaw(row, 'pdfo-military', config)).toBe('100.00');

    const combined = line({
      weekAmounts: [
        { weekId: 'taxes', hours: '0', accrued: '0', extra: '0', toPay: '320.00' },
      ],
    });
    const combinedConfig = {
      ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
      visibleColumns: { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG.visibleColumns, esv: false },
      merges: [],
    };
    expect(customWeekCellRaw(combined, 'taxes', combinedConfig)).toBe('320.00');
  });
});
