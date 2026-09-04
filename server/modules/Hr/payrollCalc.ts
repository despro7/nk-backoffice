import {
  HR_PAYROLL_FORMULA_TABELL_2026_V1,
  HR_TIMESHEET_KIND_CODES,
  type HrPayGroup,
  type HrPayTermsKind,
  type HrPayrollBreakdownStep,
  type HrPayrollFormulaSnapshot,
  type HrPayrollHoursByKind,
  type HrPayrollSkipReason,
  type HrPayrollWeekAmount,
  type HrTimesheetKind,
  type HrTimesheetWeekDto,
} from '../../../shared/types/hr.js';

export const HR_PAYROLL_FORMULA_V1: HrPayrollFormulaSnapshot = {
  formulaId: HR_PAYROLL_FORMULA_TABELL_2026_V1,
  extraRate: '0.23',
  grossDivisor: '0.77',
};

const LEAVE_KINDS: ReadonlySet<string> = new Set(['О', 'ТН']);

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function moneyStr(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function hoursStr(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

export interface PayrollEntryInput {
  date: string;
  kind: HrTimesheetKind;
  hours: number | null;
}

export interface PayrollCalcInput {
  payGroup: HrPayGroup;
  rateKind: HrPayTermsKind;
  rate: number;
  normHours: number;
  entries: PayrollEntryInput[];
  weeks: HrTimesheetWeekDto[];
  formula?: HrPayrollFormulaSnapshot;
}

export interface PayrollCalcResult {
  formulaId: string;
  ratesUsed: HrPayrollFormulaSnapshot;
  hoursByKind: HrPayrollHoursByKind;
  weekAmounts: HrPayrollWeekAmount[];
  breakdown: HrPayrollBreakdownStep[];
  accruedAmount: string;
  extraAmount: string;
  toPayAmount: string;
  skipReason: HrPayrollSkipReason | null;
}

function emptyHours(): HrPayrollHoursByKind {
  return {
    work: '0.00',
    В: '0.00',
    О: '0.00',
    ТН: '0.00',
    Н: '0.00',
    Пр: '0.00',
    Св: '0.00',
  };
}

export function collectHoursByKind(entries: PayrollEntryInput[]): {
  hoursByKind: HrPayrollHoursByKind;
  workHours: number;
  leaveDays: number;
} {
  const hoursByKind = emptyHours();
  let workHours = 0;
  let leaveDays = 0;
  for (const entry of entries) {
    if (entry.kind === 'work') {
      const hours = entry.hours ?? 0;
      workHours += hours;
      hoursByKind.work = hoursStr(Number(hoursByKind.work) + hours);
      continue;
    }
    if ((HR_TIMESHEET_KIND_CODES as readonly string[]).includes(entry.kind)) {
      const key = entry.kind as keyof Omit<HrPayrollHoursByKind, 'work'>;
      hoursByKind[key] = hoursStr(Number(hoursByKind[key]) + 1);
      if (LEAVE_KINDS.has(entry.kind)) leaveDays += 1;
    }
  }
  return { hoursByKind, workHours, leaveDays };
}

function hoursInWeek(entries: PayrollEntryInput[], week: HrTimesheetWeekDto): number {
  let sum = 0;
  for (const entry of entries) {
    if (entry.kind !== 'work') continue;
    if (entry.date < week.startDate || entry.date > week.endDate) continue;
    sum += entry.hours ?? 0;
  }
  return sum;
}

function accruedFromRate(
  rateKind: HrPayTermsKind,
  rate: number,
  workHours: number,
  normHours: number,
): number {
  if (rateKind === 'salary') {
    return roundMoney(normHours > 0 ? (rate * workHours) / normHours : 0);
  }
  return roundMoney(rate * workHours);
}

function applyGroupAmounts(
  payGroup: HrPayGroup,
  rateKind: HrPayTermsKind,
  rate: number,
  workHours: number,
  normHours: number,
  formula: HrPayrollFormulaSnapshot,
): { accrued: number; extra: number; toPay: number } {
  if (workHours <= 0 || rate <= 0) {
    return { accrued: 0, extra: 0, toPay: 0 };
  }

  const accrued = accruedFromRate(rateKind, rate, workHours, normHours);

  if (payGroup === 'official_salary') {
    const extra = roundMoney(accrued * Number(formula.extraRate));
    const divisor = Number(formula.grossDivisor);
    const toPay = roundMoney(divisor > 0 ? accrued / divisor : accrued);
    return { accrued, extra, toPay };
  }

  return { accrued, extra: 0, toPay: accrued };
}

function breakdownFor(
  payGroup: HrPayGroup,
  rateKind: HrPayTermsKind,
  formula: HrPayrollFormulaSnapshot,
  amounts: { accrued: number; extra: number; toPay: number },
  skipReason: HrPayrollSkipReason | null,
): HrPayrollBreakdownStep[] {
  if (skipReason === 'leave_not_accrued') {
    return [
      {
        id: 'leave',
        label: 'Відпустка / лікарняний у v1 не рахуються як ставка × години',
        amount: '0.00',
      },
    ];
  }
  if (skipReason === 'no_rate') {
    return [{ id: 'no_rate', label: 'Немає ставки на період', amount: '0.00' }];
  }

  if (payGroup === 'official_salary') {
    return [
      {
        id: 'accrued',
        label: 'Нараховано: ставка × години періоду / норма',
        amount: moneyStr(amounts.accrued),
      },
      {
        id: 'extra',
        label: `Коефіцієнт формули ×${formula.extraRate.replace('.', ',')}`,
        amount: moneyStr(amounts.extra),
      },
      {
        id: 'gross',
        label: `Дільник формули /${formula.grossDivisor.replace('.', ',')}`,
        amount: moneyStr(amounts.toPay),
      },
    ];
  }

  const accruedLabel =
    rateKind === 'salary'
      ? payGroup === 'unofficial_cash'
        ? 'Нараховано: місячна ставка × години / норма (готівка)'
        : 'Нараховано: місячна ставка × години / норма'
      : payGroup === 'unofficial_cash'
        ? 'Нараховано: погодинна ставка × години (готівка)'
        : 'Нараховано: погодинна ставка × години';
  return [
    { id: 'accrued', label: accruedLabel, amount: moneyStr(amounts.accrued) },
    { id: 'toPay', label: 'До виплати', amount: moneyStr(amounts.toPay) },
  ];
}

export function calculatePayrollLine(input: PayrollCalcInput): PayrollCalcResult {
  const formula = input.formula ?? HR_PAYROLL_FORMULA_V1;
  const { hoursByKind, workHours, leaveDays } = collectHoursByKind(input.entries);

  let skipReason: HrPayrollSkipReason | null = null;
  if (!(input.rate > 0)) {
    skipReason = 'no_rate';
  } else if (workHours <= 0 && leaveDays > 0) {
    skipReason = 'leave_not_accrued';
  }

  const weekAmounts: HrPayrollWeekAmount[] = input.weeks.map((week) => {
    const hours = skipReason ? 0 : hoursInWeek(input.entries, week);
    const amounts = skipReason
      ? { accrued: 0, extra: 0, toPay: 0 }
      : applyGroupAmounts(input.payGroup, input.rateKind, input.rate, hours, input.normHours, formula);
    return {
      weekId: week.id,
      hours: hoursStr(hours),
      accrued: moneyStr(amounts.accrued),
      extra: moneyStr(amounts.extra),
      toPay: moneyStr(amounts.toPay),
    };
  });

  const accruedAmount = roundMoney(weekAmounts.reduce((sum, week) => sum + Number(week.accrued), 0));
  const extraAmount = roundMoney(weekAmounts.reduce((sum, week) => sum + Number(week.extra), 0));
  const toPayAmount = roundMoney(weekAmounts.reduce((sum, week) => sum + Number(week.toPay), 0));

  return {
    formulaId: formula.formulaId,
    ratesUsed: formula,
    hoursByKind,
    weekAmounts,
    breakdown: breakdownFor(
      input.payGroup,
      input.rateKind,
      formula,
      { accrued: accruedAmount, extra: extraAmount, toPay: toPayAmount },
      skipReason,
    ),
    accruedAmount: moneyStr(accruedAmount),
    extraAmount: moneyStr(extraAmount),
    toPayAmount: moneyStr(toPayAmount),
    skipReason,
  };
}
