/** Колонки розрахунку ФОП, керовані TableBuilder. */
export const PAYROLL_TABLE_COLUMN_IDS = [
  'pdfo',
  'military',
  'esv',
  'bonus',
  'total',
] as const;

export type PayrollTableColumnId = (typeof PAYROLL_TABLE_COLUMN_IDS)[number];

export interface PayrollTableColumnMerge {
  id: string;
  columnIds: PayrollTableColumnId[];
  label: string;
}

export interface PayrollTableBuilderConfig {
  /** Видимість окремих колонок (merged колонки керуються через merges). */
  visibleColumns: Record<PayrollTableColumnId, boolean>;
  /** Податки та премії окремими колонками (не включені в суми періодів). */
  taxesSeparate: boolean;
  /** Об'єднані колонки (напр. ПДФО+ВЗ). */
  merges: PayrollTableColumnMerge[];
}

export const DEFAULT_PAYROLL_TABLE_BUILDER_CONFIG: PayrollTableBuilderConfig = {
  visibleColumns: {
    pdfo: true,
    military: true,
    esv: true,
    bonus: false,
    total: true,
  },
  taxesSeparate: false,
  merges: [
    {
      id: 'pdfo-military',
      columnIds: ['pdfo', 'military'],
      label: 'ПДФО+ВЗ',
    },
  ],
};

export function mergePayrollTableBuilderConfig(
  global: PayrollTableBuilderConfig,
  local: Partial<PayrollTableBuilderConfig> | null | undefined,
): PayrollTableBuilderConfig {
  if (!local) return global;
  return {
    visibleColumns: { ...global.visibleColumns, ...local.visibleColumns },
    taxesSeparate: local.taxesSeparate ?? global.taxesSeparate,
    merges: local.merges ?? global.merges,
  };
}
