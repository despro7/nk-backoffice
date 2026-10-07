import { describe, expect, it } from 'vitest';
import type { HrPayrollLineDto } from '@shared/types/hr';
import { DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG } from '@shared/types/tableBuilder';
import { buildPayrollExtraColumns, shouldShowTaxColumns } from './payrollTableColumns';

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
