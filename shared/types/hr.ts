export const HR_PAY_GROUPS = ['official_salary', 'hourly', 'unofficial_cash'] as const;
export type HrPayGroup = (typeof HR_PAY_GROUPS)[number];

export const HR_PAY_GROUP_LABELS: Record<HrPayGroup, string> = {
  official_salary: 'Офіційна ставка',
  hourly: 'Погодинні',
  unofficial_cash: 'Нештатні (готівка)',
};

export const HR_PAY_TERMS_KINDS = ['salary', 'hourly'] as const;
export type HrPayTermsKind = (typeof HR_PAY_TERMS_KINDS)[number];

export const HR_PAY_TERMS_KIND_LABELS: Record<HrPayTermsKind, string> = {
  salary: 'Місячна ставка',
  hourly: 'Погодинна',
};

export const HR_EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type HrEmployeeStatus = (typeof HR_EMPLOYEE_STATUSES)[number];

export interface HrLegalEntityDto {
  id: number;
  code: string;
  name: string;
  kind: string;
  isActive: boolean;
}

export interface HrUserOptionDto {
  id: number;
  name: string;
  email: string;
}

export interface HrPayTermsDto {
  id: number;
  employmentId: number;
  kind: HrPayTermsKind;
  /** Decimal як рядок, щоб не втратити копійки */
  amount: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface HrEmploymentDto {
  id: number;
  employeeId: number;
  legalEntityId: number;
  payGroup: HrPayGroup;
  validFrom: string;
  validTo: string | null;
  legalEntity: HrLegalEntityDto;
  payTerms: HrPayTermsDto[];
}

export interface HrEmployeeListItemDto {
  id: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  displayName: string;
  status: HrEmployeeStatus;
  userId: number | null;
  userName: string | null;
  notes: string | null;
  cardMasked: string | null;
  currentLegalEntityName: string | null;
  currentPayGroup: HrPayGroup | null;
}

export interface HrEmployeeDetailDto extends HrEmployeeListItemDto {
  cardLast4: string | null;
  /** Повний номер лише за правом action.hr.payouts.view */
  cardNumber: string | null;
  employments: HrEmploymentDto[];
}

export interface HrEmployeeWritePayload {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  status?: HrEmployeeStatus;
  userId?: number | null;
  notes?: string | null;
  /** Порожній рядок — очистити картку */
  cardNumber?: string | null;
}

export interface HrEmploymentWritePayload {
  legalEntityId: number;
  payGroup: HrPayGroup;
  validFrom: string;
  validTo?: string | null;
}

export interface HrPayTermsWritePayload {
  kind: HrPayTermsKind;
  amount: string;
  currency?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export const HR_TIMESHEET_STATUSES = ['draft', 'closed'] as const;
export type HrTimesheetStatus = (typeof HR_TIMESHEET_STATUSES)[number];

/** Коди дня як у файлі «Табель 2026». `work` — число годин. */
export const HR_TIMESHEET_KIND_CODES = ['В', 'О', 'ТН', 'Н', 'Пр', 'Св'] as const;
export type HrTimesheetKindCode = (typeof HR_TIMESHEET_KIND_CODES)[number];
export const HR_TIMESHEET_WORK_KIND = 'work' as const;
export type HrTimesheetKind = typeof HR_TIMESHEET_WORK_KIND | HrTimesheetKindCode;

export const HR_TIMESHEET_KIND_LABELS: Record<HrTimesheetKind, string> = {
  work: 'Години',
  В: 'Вихідний',
  О: 'Відпустка',
  ТН: 'Тимчасова непрацездатність',
  Н: 'Неявка',
  Пр: 'Прогул',
  Св: 'Свято',
};

export const HR_TIMESHEET_GROUP_FILTERS = ['official', 'hourly', 'cash'] as const;
export type HrTimesheetGroupFilter = (typeof HR_TIMESHEET_GROUP_FILTERS)[number];

export const HR_TIMESHEET_GROUP_TO_PAY: Record<HrTimesheetGroupFilter, HrPayGroup> = {
  official: 'official_salary',
  hourly: 'hourly',
  cash: 'unofficial_cash',
};

export const HR_PAY_GROUP_TO_FILTER: Record<HrPayGroup, HrTimesheetGroupFilter> = {
  official_salary: 'official',
  hourly: 'hourly',
  unofficial_cash: 'cash',
};

export interface HrTimesheetDayDto {
  date: string;
  day: number;
  weekday: number;
  weekdayLabel: string;
  isWeekend: boolean;
  weekId: string;
}

export interface HrTimesheetWeekDto {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  colSpan: number;
}

export interface HrTimesheetMonthDto {
  id: number;
  year: number;
  month: number;
  status: HrTimesheetStatus;
  version: number;
  normWorkDays: number;
  /** Decimal як рядок */
  normHours: string;
  lockedByUserId: number | null;
  lockedByName: string | null;
  lockedUntil: string | null;
}

export interface HrTimesheetEntryDto {
  employmentId: number;
  date: string;
  kind: HrTimesheetKind;
  hours: string | null;
}

export interface HrTimesheetRowDto {
  employmentId: number;
  employeeId: number;
  displayName: string;
  payGroup: HrPayGroup;
  legalEntityName: string;
  entries: HrTimesheetEntryDto[];
}

export interface HrTimesheetLoadDto {
  month: HrTimesheetMonthDto;
  days: HrTimesheetDayDto[];
  weeks: HrTimesheetWeekDto[];
  rows: HrTimesheetRowDto[];
}

export interface HrTimesheetEntryWrite {
  employmentId: number;
  date: string;
  /** null — видалити клітинку */
  kind: HrTimesheetKind | null;
  hours?: string | null;
}

export interface HrTimesheetSavePayload {
  version: number;
  entries: HrTimesheetEntryWrite[];
}

export interface HrTimesheetSaveDto {
  month: HrTimesheetMonthDto;
  entries: HrTimesheetEntryDto[];
}

/** Версія внутрішнього калькулятора (коефіцієнти не хардкодяться в UI як податки). */
export const HR_PAYROLL_FORMULA_TABELL_2026_V1 = 'tabell-2026-v1';

export const HR_PAYROLL_STATUSES = ['draft', 'calculated', 'locked'] as const;
export type HrPayrollStatus = (typeof HR_PAYROLL_STATUSES)[number];

export const HR_PAYOUT_KINDS = ['weekly', 'advance', 'other'] as const;
export type HrPayoutKind = (typeof HR_PAYOUT_KINDS)[number];

export const HR_PAYOUT_KIND_LABELS: Record<HrPayoutKind, string> = {
  weekly: 'Тижнева',
  advance: 'Аванс',
  other: 'Інше',
};

export const HR_PAYROLL_SKIP_REASONS = ['no_rate', 'leave_not_accrued'] as const;
export type HrPayrollSkipReason = (typeof HR_PAYROLL_SKIP_REASONS)[number];

export const HR_PAYROLL_SKIP_REASON_LABELS: Record<HrPayrollSkipReason, string> = {
  no_rate: 'Немає ставки на період',
  leave_not_accrued: 'Відпустка / лікарняний не нараховуються за ставкою × години',
};

export interface HrPayrollFormulaSnapshot {
  formulaId: string;
  extraRate: string;
  grossDivisor: string;
}

export interface HrPayrollHoursByKind {
  work: string;
  В: string;
  О: string;
  ТН: string;
  Н: string;
  Пр: string;
  Св: string;
}

export interface HrPayrollWeekAmount {
  weekId: string;
  hours: string;
  accrued: string;
  extra: string;
  toPay: string;
}

export interface HrPayrollBreakdownStep {
  id: string;
  label: string;
  amount: string;
}

export interface HrPayrollPeriodDto {
  id: number;
  year: number;
  month: number;
  status: HrPayrollStatus;
  version: number;
  formulaId: string;
  formulaSnapshot: HrPayrollFormulaSnapshot;
  timesheetMonthId: number | null;
  lockedAt: string | null;
  lockedByUserId: number | null;
  lockedByName: string | null;
}

export interface HrPayrollLineDto {
  id: number | null;
  employmentId: number;
  employeeId: number;
  displayName: string;
  payGroup: HrPayGroup;
  legalEntityName: string;
  legalEntityCode: string;
  /** Стабільний ключ зайнятості для імпорту (PR4). */
  employmentImportKey: string;
  formulaId: string;
  rate: string;
  rateKind: HrPayTermsKind;
  normHours: string;
  hoursByKind: HrPayrollHoursByKind;
  ratesUsed: HrPayrollFormulaSnapshot;
  weekAmounts: HrPayrollWeekAmount[];
  breakdown: HrPayrollBreakdownStep[];
  accruedAmount: string;
  extraAmount: string;
  toPayAmount: string;
  skipReason: HrPayrollSkipReason | null;
  cardMasked: string | null;
  cardNumber: string | null;
}

export interface HrPayoutDto {
  id: number;
  periodId: number;
  employmentId: number;
  weekId: string | null;
  kind: HrPayoutKind;
  amount: string;
  paidAt: string | null;
  note: string | null;
}

export interface HrPayoutWritePayload {
  employmentId: number;
  weekId?: string | null;
  kind: HrPayoutKind;
  amount: string;
  paidAt?: string | null;
  note?: string | null;
}

export interface HrPayrollSummaryDto {
  toPay: string;
  paid: string;
  cash: string;
}

export interface HrPayrollLoadDto {
  source: 'preview' | 'snapshot';
  period: HrPayrollPeriodDto | null;
  weeks: HrTimesheetWeekDto[];
  days: HrTimesheetDayDto[];
  lines: HrPayrollLineDto[];
  payouts: HrPayoutDto[];
  summary: HrPayrollSummaryDto;
  timesheet: Pick<HrTimesheetMonthDto, 'id' | 'status' | 'version' | 'normHours' | 'normWorkDays'> | null;
  formula: HrPayrollFormulaSnapshot;
}

export interface HrPayrollCalculatePayload {
  month: string;
  version?: number;
}

/** Нормалізований ключ людини для зіставлення з Excel (PR4). */
export function hrEmployeeImportKey(
  lastName: string,
  firstName: string,
  middleName?: string | null,
): string {
  return [lastName, firstName, middleName]
    .map((part) => (part ?? '').trim().toLocaleLowerCase('uk'))
    .filter(Boolean)
    .join('|');
}

export function hrEmploymentImportKey(
  employeeKey: string,
  legalEntityCode: string,
  payGroup: HrPayGroup,
  validFrom: string,
): string {
  return `${employeeKey}::${legalEntityCode}::${payGroup}::${validFrom}`;
}

/** Основний ключ + варіант з переставленими прізвищем/імʼям (2 частини, без по-батькові). */
export function hrEmployeeImportKeyCandidates(
  lastName: string,
  firstName: string,
  middleName?: string | null,
): string[] {
  const primary = hrEmployeeImportKey(lastName, firstName, middleName);
  if (middleName?.trim()) return [primary];
  const swapped = hrEmployeeImportKey(firstName, lastName, null);
  return primary === swapped ? [primary] : [primary, swapped];
}

export interface HrXlsxImportSkipDto {
  sheet: string;
  reason: string;
  detail: string;
}

export interface HrXlsxImportEmployeePreviewDto {
  employeeKey: string;
  displayName: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  cardMasked: string | null;
  notes: string | null;
  months: string[];
  payGroups: HrPayGroup[];
  legalEntityCodes: string[];
  entryCount: number;
  hasRate: boolean;
}

export interface HrXlsxImportEmploymentPreviewDto {
  employmentImportKey: string;
  employeeKey: string;
  displayName: string;
  legalEntityCode: string;
  payGroup: HrPayGroup;
  validFrom: string;
  rateKind: HrPayTermsKind | null;
  rateAmount: string | null;
  entryCount: number;
}

export interface HrXlsxImportCountsDto {
  sheets: number;
  employees: number;
  employments: number;
  entries: number;
  payTerms: number;
  skippedRows: number;
  skippedCells: number;
}

export interface HrXlsxImportPreviewDto {
  year: number | null;
  counts: HrXlsxImportCountsDto;
  employees: HrXlsxImportEmployeePreviewDto[];
  employments: HrXlsxImportEmploymentPreviewDto[];
  skipped: HrXlsxImportSkipDto[];
  warnings: string[];
}

export interface HrXlsxImportCommitDto {
  preview: HrXlsxImportPreviewDto;
  createdEmployees: number;
  updatedEmployees: number;
  createdEmployments: number;
  reusedEmployments: number;
  upsertedEntries: number;
  createdPayTerms: number;
  skippedClosedMonths: string[];
}
