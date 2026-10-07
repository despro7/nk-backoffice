import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
  mergePayrollTableBuilderConfig,
} from '@shared/types/tableBuilder';

describe('mergePayrollTableBuilderConfig', () => {
  it('повертає global без local', () => {
    expect(mergePayrollTableBuilderConfig(DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG, null)).toEqual(
      DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG,
    );
  });

  it('мерджить видимість колонок і taxesSeparate', () => {
    const merged = mergePayrollTableBuilderConfig(DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG, {
      visibleColumns: { ...DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG.visibleColumns, bonus: true },
      taxesSeparate: true,
    });
    expect(merged.visibleColumns.bonus).toBe(true);
    expect(merged.visibleColumns.pdfo).toBe(true);
    expect(merged.taxesSeparate).toBe(true);
  });
});
