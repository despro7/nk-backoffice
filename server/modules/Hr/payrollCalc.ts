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
  type HrTaxBreakdownItem,
  type HrTimesheetKind,
  type HrTimesheetWeekDto,
} from '../../../shared/types/hr.js';
import type { TaxRuleCalc } from './HrTaxRuleService.js';

/** Залишено для знімків у БД; коефіцієнти більше не застосовуються в розрахунку. */
export const HR_PAYROLL_FORMULA_V1: HrPayrollFormulaSnapshot = {
  formulaId: HR_PAYROLL_FORMULA_TABELL_2026_V1,
  extraRate: '0',
  grossDivisor: '1',
};

const LEAVE_KINDS: ReadonlySet<string> = new Set(['О', 'ТН']);

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function moneyStr(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function taxAmountsFromBreakdown(breakdown: HrTaxBreakdownItem[]): {
  pdfoAmount: string;
  militaryTaxAmount: string;
} {
  let pdfo = 0;
  let military = 0;
  for (const item of breakdown) {
    if (item.code === 'pdfo') pdfo += Number(item.amount);
    if (item.code === 'military') military += Number(item.amount);
  }
  return { pdfoAmount: moneyStr(pdfo), militaryTaxAmount: moneyStr(military) };
}

export function esvAmountFromBreakdown(breakdown: HrTaxBreakdownItem[]): string {
  let esv = 0;
  for (const item of breakdown) {
    if (item.code === 'esv') esv += Number(item.amount);
  }
  return moneyStr(esv);
}

export function employerTaxAmountFromBreakdown(breakdown: HrTaxBreakdownItem[]): string {
  let total = 0;
  for (const item of breakdown) {
    if (item.payer === 'employer') total += Number(item.amount);
  }
  return moneyStr(total);
}

function withholdingTaxRules(taxRules: TaxRuleCalc[]): TaxRuleCalc[] {
  return taxRules.filter((rule) => rule.code === 'pdfo' || rule.code === 'military');
}

/** Офіційні групи: нараховано з табеля — сума «на руки», gross відновлюється перед податками. */
function payGroupAccruedIsNetToEmployee(payGroup: HrPayGroup): boolean {
  return payGroup === 'official_salary' || payGroup === 'hourly';
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
  /** Якщо задано — місячні підсумки лише за цим діапазоном; тижневі колонки — з усіх entries. */
  monthStart?: string;
  monthEnd?: string;
}

export interface PayrollTaxResult {
  grossAccrued: string;
  netToPay: string;
  employerTotalCost: string;
  bonusAmount: string;
  esvAmount: string;
  taxAmount: string;
  taxBreakdown: HrTaxBreakdownItem[];
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
  grossAccrued: string;
  netToPay: string;
  employerTotalCost: string;
  bonusAmount: string;
  esvAmount: string;
  taxAmount: string;
  taxBreakdown: HrTaxBreakdownItem[];
  skipReason: HrPayrollSkipReason | null;
}

export interface PayrollCalcWithTaxesInput extends PayrollCalcInput {
  taxRules?: TaxRuleCalc[];
  bonusAmount?: number;
  asOfDate?: string;
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

function filterEntriesByDateRange(
  entries: PayrollEntryInput[],
  startDate: string,
  endDate: string,
): PayrollEntryInput[] {
  return entries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
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

  const accruedLabel =
    rateKind === 'salary'
      ? payGroup === 'official_salary'
        ? 'Нараховано: ставка × години / норма'
        : payGroup === 'unofficial_cash'
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

function emptyTaxResult(bonusAmount = 0): PayrollTaxResult {
  const bonus = moneyStr(bonusAmount);
  return {
    grossAccrued: '0.00',
    netToPay: '0.00',
    employerTotalCost: bonus,
    bonusAmount: bonus,
    esvAmount: '0.00',
    taxAmount: '0.00',
    taxBreakdown: [],
  };
}

function reverseGrossFromAccrued(accrued: number, withholdingRules: TaxRuleCalc[]): number {
  const withholdingRate = withholdingRules.reduce((sum, rule) => sum + rule.rate, 0);
  const divisor = 1 - withholdingRate;
  if (divisor <= 0) return accrued;
  return roundMoney(accrued / divisor);
}

export function applyTaxRules(
  payGroup: HrPayGroup,
  accrued: number,
  taxRules: TaxRuleCalc[],
  bonusAmount = 0,
): PayrollTaxResult {
  if (accrued <= 0 && bonusAmount <= 0) {
    return emptyTaxResult(bonusAmount);
  }

  if (taxRules.length === 0) {
    const total = roundMoney(accrued + bonusAmount);
    return {
      grossAccrued: moneyStr(accrued),
      netToPay: moneyStr(accrued),
      employerTotalCost: moneyStr(total),
      bonusAmount: moneyStr(bonusAmount),
      esvAmount: '0.00',
      taxAmount: '0.00',
      taxBreakdown: [],
    };
  }

  const employerRules = taxRules.filter((rule) => rule.payer === 'employer');
  const gross = payGroupAccruedIsNetToEmployee(payGroup)
    ? reverseGrossFromAccrued(accrued, withholdingTaxRules(taxRules))
    : roundMoney(accrued);

  const breakdown: HrTaxBreakdownItem[] = [];
  let esvAmount = 0;
  let employerTaxAmount = 0;
  let taxAmount = 0;

  for (const rule of taxRules) {
    const base = rule.base === 'accrued' ? accrued : gross;
    const amount = roundMoney(base * rule.rate);
    breakdown.push({
      code: rule.code,
      label: rule.label,
      rate: rule.rate.toFixed(6),
      amount: moneyStr(amount),
      payer: rule.payer,
    });
    if (rule.code === 'esv') {
      esvAmount += amount;
    }
    if (rule.payer === 'employer') {
      employerTaxAmount += amount;
    }
    if (rule.payer === 'employee') {
      taxAmount += amount;
    }
  }

  const bonusEsv = employerRules
    .filter((rule) => rule.code === 'esv')
    .reduce((sum, rule) => sum + roundMoney(bonusAmount * rule.rate), 0);

  esvAmount = roundMoney(esvAmount + bonusEsv);
  employerTaxAmount = roundMoney(employerTaxAmount + bonusEsv);

  const net = roundMoney(gross - taxAmount);
  const employerTotalCost = roundMoney(gross + employerTaxAmount + bonusAmount);

  return {
    grossAccrued: moneyStr(gross),
    netToPay: moneyStr(net),
    employerTotalCost: moneyStr(employerTotalCost),
    bonusAmount: moneyStr(bonusAmount),
    esvAmount: moneyStr(esvAmount),
    taxAmount: moneyStr(taxAmount),
    taxBreakdown: breakdown,
  };
}

export function calculatePayrollLineWithTaxes(input: PayrollCalcWithTaxesInput): PayrollCalcResult {
  const base = calculatePayrollLine(input);
  const accrued = Number(base.accruedAmount);
  const bonusAmount = input.bonusAmount ?? 0;
  const tax = applyTaxRules(input.payGroup, accrued, input.taxRules ?? [], bonusAmount);

  const taxBreakdownSteps: HrPayrollBreakdownStep[] = tax.taxBreakdown.map((item) => ({
    id: `tax-${item.code}`,
    label: `${item.label} (${item.payer === 'employer' ? 'роботодавець' : 'працівник'})`,
    amount: item.amount,
  }));

  if (bonusAmount > 0) {
    taxBreakdownSteps.push({
      id: 'bonus',
      label: 'Премія',
      amount: tax.bonusAmount,
    });
  }

  if (Number(tax.employerTotalCost) > 0) {
    taxBreakdownSteps.push({
      id: 'employer-cost',
      label: 'ФОП (вартість роботодавця)',
      amount: tax.employerTotalCost,
    });
  }

  return {
    ...base,
    ...tax,
    breakdown: [...base.breakdown, ...taxBreakdownSteps],
  };
}

export function calculatePayrollLine(input: PayrollCalcInput): PayrollCalcResult {
  const formula = input.formula ?? HR_PAYROLL_FORMULA_V1;
  const monthScoped = input.monthStart && input.monthEnd;
  const monthEntries = monthScoped
    ? filterEntriesByDateRange(input.entries, input.monthStart!, input.monthEnd!)
    : input.entries;
  const { hoursByKind, workHours, leaveDays } = collectHoursByKind(monthEntries);

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

  const monthAmounts = skipReason
    ? { accrued: 0, extra: 0, toPay: 0 }
    : applyGroupAmounts(input.payGroup, input.rateKind, input.rate, workHours, input.normHours, formula);
  const accruedAmount = monthScoped
    ? monthAmounts.accrued
    : roundMoney(weekAmounts.reduce((sum, week) => sum + Number(week.accrued), 0));
  const extraAmount = monthScoped
    ? monthAmounts.extra
    : roundMoney(weekAmounts.reduce((sum, week) => sum + Number(week.extra), 0));
  const toPayAmount = monthScoped
    ? monthAmounts.toPay
    : roundMoney(weekAmounts.reduce((sum, week) => sum + Number(week.toPay), 0));

  const tax = applyTaxRules(input.payGroup, accruedAmount, [], 0);

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
    grossAccrued: tax.grossAccrued,
    netToPay: tax.netToPay,
    employerTotalCost: tax.employerTotalCost,
    bonusAmount: tax.bonusAmount,
    esvAmount: tax.esvAmount,
    taxAmount: tax.taxAmount,
    taxBreakdown: tax.taxBreakdown,
    skipReason,
  };
}
