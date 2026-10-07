import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  HR_PAY_GROUPS,
  HR_PAYROLL_SKIP_REASONS,
  HR_PAYROLL_STATUSES,
  HR_PAYOUT_KINDS,
  hrEmployeeImportKey,
  hrEmploymentImportKey,
  type HrPayGroup,
  type HrPayTermsKind,
  type HrPayrollBreakdownStep,
  type HrPayrollFormulaSnapshot,
  type HrPayrollHoursByKind,
  type HrPayrollLineDto,
  HR_PAYROLL_PERIOD_MODES,
  type HrPayrollLoadDto,
  type HrPayrollPeriodDto,
  type HrPayrollPeriodMode,
  type HrPayrollPeriodOptions,
  type HrTimesheetWeekDto,
  type HrPayrollSkipReason,
  type HrPayrollStatus,
  type HrPayrollSummaryDto,
  type HrPayrollWeekAmount,
  type HrPayoutDto,
  type HrPayoutKind,
  type HrPayoutWritePayload,
  type HrTaxBreakdownItem,
  type HrTimesheetKind,
  HR_PAYROLL_FORMULA_TABELL_2026_V1,
} from '../../../shared/types/hr.js';
import {
  dedupeEmploymentsByEmployeePayGroup,
  remapEmploymentId,
} from '../../../shared/utils/hrEmploymentDedupe.js';
import {
  buildTimesheetMonthMeta,
  parseYearMonth,
  shiftYearMonth,
  toDateOnlyUtc,
  utcDate,
} from '../../../shared/utils/hrTimesheetCalendar.js';
import { isTimesheetKind } from '../../../shared/utils/hrTimesheetCell.js';
import { listProductionWeeksOverlappingMonth } from '../../../shared/utils/hrProductionWeek.js';
import {
  calendarWeekSequenceFromYearStart,
  formatHrWorkWeekLabel,
} from '../../../shared/utils/hrWorkWeekPeriods.js';
import { buildPayrollPeriodKey } from '../../../shared/utils/hrPayrollPeriodKey.js';
import { decryptCardNumber, maskCardLast4 } from './HrCardCrypto.js';
import { HrError } from './HrService.js';
import { hrBonusService } from './HrBonusService.js';
import { hrProductionCalendarService } from './HrProductionCalendarService.js';
import { hrTaxRuleService } from './HrTaxRuleService.js';
import {
  HR_PAYROLL_FORMULA_V1,
  calculatePayrollLineWithTaxes,
  taxAmountsFromBreakdown,
  type PayrollEntryInput,
} from './payrollCalc.js';

const RATE_KINDS = ['salary', 'hourly'] as const;

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function isRateKind(value: string): value is HrPayTermsKind {
  return (RATE_KINDS as readonly string[]).includes(value);
}

function isPayrollStatus(value: string): value is HrPayrollStatus {
  return (HR_PAYROLL_STATUSES as readonly string[]).includes(value);
}

function isPayoutKind(value: string): value is HrPayoutKind {
  return (HR_PAYOUT_KINDS as readonly string[]).includes(value);
}

function isSkipReason(value: string | null): value is HrPayrollSkipReason {
  return value != null && (HR_PAYROLL_SKIP_REASONS as readonly string[]).includes(value);
}

function moneyFromDecimal(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function parseMoney(raw: string): Prisma.Decimal {
  const normalized = String(raw).trim().replace(',', '.').replace(/\s/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new HrError('Некоректна сума');
  }
  return new Prisma.Decimal(normalized);
}

function parseFormulaRate(raw: string, field: string): string {
  const normalized = String(raw).trim().replace(',', '.').replace(/\s/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new HrError(`Некоректне значення «${field}»`);
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n >= 1) {
    throw new HrError(`«${field}» має бути числом від 0 до 1 (наприклад 0.23)`);
  }
  return n.toFixed(2);
}

function buildFormulaSnapshot(extraRate: string, grossDivisor: string): HrPayrollFormulaSnapshot {
  return {
    formulaId: HR_PAYROLL_FORMULA_TABELL_2026_V1,
    extraRate: parseFormulaRate(extraRate, 'Додатковий коефіцієнт'),
    grossDivisor: parseFormulaRate(grossDivisor, 'Дільник'),
  };
}

function asFormulaSnapshot(value: unknown): HrPayrollFormulaSnapshot {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (
      typeof row.formulaId === 'string' &&
      typeof row.extraRate === 'string' &&
      typeof row.grossDivisor === 'string'
    ) {
      return {
        formulaId: row.formulaId,
        extraRate: row.extraRate,
        grossDivisor: row.grossDivisor,
      };
    }
  }
  return HR_PAYROLL_FORMULA_V1;
}

function asHoursByKind(value: unknown): HrPayrollHoursByKind {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const pick = (key: string): string => (typeof row[key] === 'string' ? row[key] : '0.00');
  return {
    work: pick('work'),
    В: pick('В'),
    О: pick('О'),
    ТН: pick('ТН'),
    Н: pick('Н'),
    Пр: pick('Пр'),
    Св: pick('Св'),
  };
}

function asWeekAmounts(value: unknown): HrPayrollWeekAmount[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HrPayrollWeekAmount => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as HrPayrollWeekAmount).weekId === 'string' &&
        typeof (item as HrPayrollWeekAmount).toPay === 'string',
    );
  });
}

function asBreakdown(value: unknown): HrPayrollBreakdownStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HrPayrollBreakdownStep => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as HrPayrollBreakdownStep).id === 'string' &&
        typeof (item as HrPayrollBreakdownStep).label === 'string' &&
        typeof (item as HrPayrollBreakdownStep).amount === 'string',
    );
  });
}

function asTaxBreakdown(value: unknown): HrTaxBreakdownItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HrTaxBreakdownItem => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof (item as HrTaxBreakdownItem).code === 'string' &&
        typeof (item as HrTaxBreakdownItem).amount === 'string',
    );
  });
}

function pickPayTerms<
  T extends { effectiveFrom: Date; effectiveTo: Date | null; kind: string; amount: Prisma.Decimal },
>(terms: T[], monthStart: Date, monthEnd: Date): T | null {
  const open = terms.filter((item) => {
    if (item.effectiveFrom > monthEnd) return false;
    if (item.effectiveTo && item.effectiveTo < monthStart) return false;
    return true;
  });
  open.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return open[0] ?? null;
}

const periodInclude = {
  lockedByUser: { select: { name: true, email: true } },
} satisfies Prisma.HrPayrollPeriodInclude;

function toPeriodDto(
  row: Prisma.HrPayrollPeriodGetPayload<{ include: typeof periodInclude }>,
): HrPayrollPeriodDto {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    periodKey: row.periodKey,
    status: isPayrollStatus(row.status) ? row.status : 'draft',
    version: row.version,
    formulaId: row.formulaId,
    formulaSnapshot: asFormulaSnapshot(row.formulaSnapshot),
    timesheetMonthId: row.timesheetMonthId,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    lockedByUserId: row.lockedByUserId,
    lockedByName: row.lockedByUser?.name || row.lockedByUser?.email || null,
  };
}

function toPayoutDto(row: {
  id: number;
  periodId: number;
  employmentId: number;
  weekId: string | null;
  kind: string;
  amount: Prisma.Decimal;
  paidAt: Date | null;
  note: string | null;
}): HrPayoutDto {
  return {
    id: row.id,
    periodId: row.periodId,
    employmentId: row.employmentId,
    weekId: row.weekId,
    kind: isPayoutKind(row.kind) ? row.kind : 'other',
    amount: moneyFromDecimal(row.amount),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    note: row.note,
  };
}

function summarize(lines: HrPayrollLineDto[], payouts: HrPayoutDto[]): HrPayrollSummaryDto {
  const toPay = lines.reduce((sum, line) => sum + Number(line.toPayAmount), 0);
  const paid = payouts.reduce((sum, item) => sum + Number(item.amount), 0);
  const cash = lines
    .filter((line) => line.payGroup === 'unofficial_cash')
    .reduce((sum, line) => sum + Number(line.toPayAmount), 0);
  return {
    toPay: toPay.toFixed(2),
    paid: paid.toFixed(2),
    cash: cash.toFixed(2),
  };
}

const employmentInclude = {
  employee: true,
  legalEntity: true,
  payGroup: true,
  payTerms: true,
} satisfies Prisma.HrEmploymentInclude;

type EmploymentRow = Prisma.HrEmploymentGetPayload<{ include: typeof employmentInclude }>;

function parsePeriodMode(value: string | undefined): HrPayrollPeriodMode {
  if (value && (HR_PAYROLL_PERIOD_MODES as readonly string[]).includes(value)) {
    return value as HrPayrollPeriodMode;
  }
  return 'production';
}

function parseDateOnly(raw: string): string {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HrError('Некоректна дата (очікується YYYY-MM-DD)');
  }
  return value;
}

function daysBetweenInclusive(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function withWeekLabels(weeks: HrTimesheetWeekDto[]): HrTimesheetWeekDto[] {
  return weeks.map((week) => ({
    ...week,
    label: `${calendarWeekSequenceFromYearStart(week.startDate)} · ${formatHrWorkWeekLabel(week.startDate, week.endDate)}`,
  }));
}

type PayrollWeeksResolveResult = {
  periodMode: HrPayrollPeriodMode;
  dateFrom: string | null;
  dateTo: string | null;
  weeks: HrTimesheetWeekDto[];
};

async function resolvePayrollWeeks(
  year: number,
  month: number,
  options?: HrPayrollPeriodOptions,
): Promise<PayrollWeeksResolveResult> {
  const periodMode = parsePeriodMode(options?.periodMode);
  const meta = buildTimesheetMonthMeta(year, month);
  const monthStartStr = toDateOnlyUtc(utcDate(year, month, 1));
  const monthEndStr = toDateOnlyUtc(utcDate(year, month, meta.days.length));

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let weeks: HrTimesheetWeekDto[] = meta.weeks;

  if (periodMode === 'custom') {
    dateFrom = options?.dateFrom ? parseDateOnly(options.dateFrom) : monthStartStr;
    dateTo = options?.dateTo ? parseDateOnly(options.dateTo) : monthEndStr;
    if (dateFrom > dateTo) throw new HrError('Дата початку не може бути пізніше дати кінця');
    if (daysBetweenInclusive(dateFrom, dateTo) > 31) {
      throw new HrError('Довільний період не може перевищувати 31 день');
    }
    weeks = [
      { id: 'salary', label: 'ЗП', startDate: dateFrom, endDate: dateTo, colSpan: 1 },
      { id: 'taxes', label: 'Податки', startDate: dateFrom, endDate: dateTo, colSpan: 1 },
      { id: 'bonus', label: 'Премії', startDate: dateFrom, endDate: dateTo, colSpan: 1 },
      { id: 'total', label: 'Разом', startDate: dateFrom, endDate: dateTo, colSpan: 1 },
    ];
  } else if (periodMode === 'production') {
    const calendar = await hrProductionCalendarService.get();
    const productionWeeks = listProductionWeeksOverlappingMonth(year, month, calendar);
    weeks = productionWeeks.map((week) => ({
      id: week.startDate,
      label: `${calendarWeekSequenceFromYearStart(week.startDate)} · ${formatHrWorkWeekLabel(week.startDate, week.endDate)}`,
      startDate: week.startDate,
      endDate: week.endDate,
      colSpan: daysBetweenInclusive(week.startDate, week.endDate),
    }));
  } else {
    weeks = withWeekLabels(meta.weeks);
  }

  return { periodMode, dateFrom, dateTo, weeks };
}

type TimesheetEntryRow = {
  employmentId: number;
  date: Date;
  kind: string;
  hours: Prisma.Decimal | null;
};

type TimesheetEntryDb = Pick<typeof prisma, 'hrTimesheetMonth' | 'hrTimesheetEntry'>;

/** Записи табеля для payroll: у режимі production додає сусідні місяці для тижнів на межі. */
async function loadTimesheetEntriesForPayroll(
  year: number,
  month: number,
  weeks: HrTimesheetWeekDto[],
  periodMode: HrPayrollPeriodMode,
  timesheetId: number | null,
  db: TimesheetEntryDb = prisma,
): Promise<TimesheetEntryRow[]> {
  if (!timesheetId) return [];

  const meta = buildTimesheetMonthMeta(year, month);
  const monthStartStr = toDateOnlyUtc(utcDate(year, month, 1));
  const monthEndStr = toDateOnlyUtc(utcDate(year, month, meta.days.length));
  const monthIds = new Set<number>([timesheetId]);

  if (periodMode === 'production') {
    const needsPrev = weeks.some((week) => week.startDate < monthStartStr);
    const needsNext = weeks.some((week) => week.endDate > monthEndStr);

    if (needsPrev) {
      const prev = shiftYearMonth(year, month, -1);
      const prevTimesheet = await db.hrTimesheetMonth.findUnique({
        where: { year_month: { year: prev.year, month: prev.month } },
        select: { id: true },
      });
      if (prevTimesheet) monthIds.add(prevTimesheet.id);
    }
    if (needsNext) {
      const next = shiftYearMonth(year, month, 1);
      const nextTimesheet = await db.hrTimesheetMonth.findUnique({
        where: { year_month: { year: next.year, month: next.month } },
        select: { id: true },
      });
      if (nextTimesheet) monthIds.add(nextTimesheet.id);
    }
  }

  return db.hrTimesheetEntry.findMany({
    where: { monthId: { in: [...monthIds] } },
  });
}

/** Чи відповідає збережений знімок поточній структурі колонок (режиму періоду). */
function snapshotFitsWeeks(lines: HrPayrollLineDto[], weeks: HrTimesheetWeekDto[]): boolean {
  const sample = lines.find((line) => line.weekAmounts.length > 0);
  if (!sample) return true;
  const expected = new Set(weeks.map((week) => week.id));
  const actual = new Set(sample.weekAmounts.map((item) => item.weekId));
  if (actual.size !== expected.size) return false;
  for (const id of expected) {
    if (!actual.has(id)) return false;
  }
  return true;
}

function toLineDtoFromCalc(
  employment: EmploymentRow,
  calc: ReturnType<typeof calculatePayrollLineWithTaxes>,
  rate: string,
  rateKind: HrPayTermsKind,
  normHours: string,
  revealCard: boolean,
  lineId: number | null,
): HrPayrollLineDto {
  const { pdfoAmount, militaryTaxAmount } = taxAmountsFromBreakdown(calc.taxBreakdown);
  const payGroup = isPayGroup(employment.payGroup.slug) ? employment.payGroup.slug : 'official_salary';
  const employeeKey = hrEmployeeImportKey(
    employment.employee.lastName,
    employment.employee.firstName,
    employment.employee.middleName,
  );
  let cardNumber: string | null = null;
  if (revealCard && employment.employee.cardNumberEncrypted) {
    cardNumber = decryptCardNumber(employment.employee.cardNumberEncrypted);
  }
  return {
    id: lineId,
    employmentId: employment.id,
    employeeId: employment.employeeId,
    displayName: employment.employee.displayName,
    payGroup,
    legalEntityName: employment.legalEntity.name,
    legalEntityCode: employment.legalEntity.code,
    employmentImportKey: hrEmploymentImportKey(
      employeeKey,
      employment.legalEntity.code,
      payGroup,
      toDateOnlyUtc(employment.validFrom),
    ),
    formulaId: calc.formulaId,
    rate,
    rateKind,
    normHours,
    hoursByKind: calc.hoursByKind,
    ratesUsed: calc.ratesUsed,
    weekAmounts: calc.weekAmounts,
    breakdown: calc.breakdown,
    accruedAmount: calc.accruedAmount,
    extraAmount: calc.extraAmount,
    toPayAmount: calc.toPayAmount,
    grossAccrued: calc.grossAccrued,
    netToPay: calc.netToPay,
    employerTotalCost: calc.employerTotalCost,
    bonusAmount: calc.bonusAmount,
    esvAmount: calc.esvAmount,
    taxAmount: calc.taxAmount,
    pdfoAmount,
    militaryTaxAmount,
    taxBreakdown: calc.taxBreakdown,
    skipReason: calc.skipReason,
    cardMasked: maskCardLast4(employment.employee.cardLast4),
    cardNumber,
  };
}

export class HrPayrollService {
  async loadMonth(
    monthParam: string | undefined,
    revealCard: boolean,
    options?: HrPayrollPeriodOptions,
  ): Promise<HrPayrollLoadDto> {
    const { year, month } = this.parseMonth(monthParam);
    const meta = buildTimesheetMonthMeta(year, month);
    const monthStart = utcDate(year, month, 1);
    const monthEnd = utcDate(year, month, meta.days.length);
    const { periodMode, dateFrom, dateTo, weeks } = await resolvePayrollWeeks(year, month, options);
    const periodKey = buildPayrollPeriodKey(periodMode, dateFrom, dateTo);

    const [period, timesheet, employmentBundle] = await Promise.all([
      prisma.hrPayrollPeriod.findUnique({
        where: { year_month_periodKey: { year, month, periodKey } },
        include: {
          ...periodInclude,
          lines: true,
          payouts: { orderBy: { id: 'asc' } },
        },
      }),
      prisma.hrTimesheetMonth.findUnique({
        where: { year_month: { year, month } },
        select: { id: true, status: true, version: true, normHours: true, normWorkDays: true },
      }),
      this.listEmployments(monthStart, monthEnd),
    ]);
    const { employments, idRemap } = employmentBundle;

    const payouts = period ? period.payouts.map(toPayoutDto) : [];
    const hasSnapshot = period && (period.status === 'calculated' || period.status === 'locked');

    let lines: HrPayrollLineDto[];
    let source: HrPayrollLoadDto['source'] = 'preview';

    if (hasSnapshot && period) {
      const byEmployment = new Map(employments.map((row) => [row.id, row]));
      const seenEmployment = new Set<number>();
      const snapshotLines = period.lines
        .map((line) => {
          const canonicalId = remapEmploymentId(idRemap, line.employmentId);
          if (seenEmployment.has(canonicalId)) return null;
          const employment = byEmployment.get(canonicalId);
          if (!employment) return null;
          seenEmployment.add(canonicalId);
          return this.lineFromSnapshot(employment, line, revealCard);
        })
        .filter((item): item is HrPayrollLineDto => item != null);

      if (snapshotFitsWeeks(snapshotLines, weeks)) {
        lines = snapshotLines;
        source = 'snapshot';
      } else {
        lines = await this.buildPreviewLines(
          employments,
          timesheet,
          idRemap,
          weeks,
          monthStart,
          monthEnd,
          period,
          meta.normHours,
          revealCard,
          periodMode,
          dateFrom,
          dateTo,
          year,
          month,
        );
      }
    } else {
      lines = await this.buildPreviewLines(
        employments,
        timesheet,
        idRemap,
        weeks,
        monthStart,
        monthEnd,
        period,
        meta.normHours,
        revealCard,
        periodMode,
        dateFrom,
        dateTo,
        year,
        month,
      );
    }

    this.sortLines(lines);

    return {
      source,
      periodMode,
      dateFrom,
      dateTo,
      period: period ? toPeriodDto(period) : null,
      weeks,
      days: meta.days,
      lines,
      payouts,
      summary: summarize(lines, payouts),
      timesheet: timesheet
        ? {
            id: timesheet.id,
            status: timesheet.status === 'closed' ? 'closed' : 'draft',
            version: timesheet.version,
            normHours: timesheet.normHours.toFixed(2),
            normWorkDays: timesheet.normWorkDays,
          }
        : null,
      formula: period ? asFormulaSnapshot(period.formulaSnapshot) : HR_PAYROLL_FORMULA_V1,
    };
  }

  async calculate(
    monthParam: string | undefined,
    version: number | undefined,
    revealCard: boolean,
    options?: HrPayrollPeriodOptions,
  ): Promise<HrPayrollLoadDto> {
    const { year, month } = this.parseMonth(monthParam);
    const meta = buildTimesheetMonthMeta(year, month);
    const monthStart = utcDate(year, month, 1);
    const monthEnd = utcDate(year, month, meta.days.length);
    const { periodMode, dateFrom, dateTo, weeks } = await resolvePayrollWeeks(year, month, options);
    const periodKey = buildPayrollPeriodKey(periodMode, dateFrom, dateTo);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.hrPayrollPeriod.findUnique({
        where: { year_month_periodKey: { year, month, periodKey } },
      });
      if (existing?.status === 'locked') {
        throw new HrError('Розрахунок заблоковано. Перерахунок неможливий.', 409, 'PAYROLL_LOCKED');
      }
      if (existing && version != null && existing.version !== version) {
        throw new HrError('Розрахунок змінено іншим користувачем. Оновіть дані.', 409, 'PAYROLL_VERSION');
      }

      const formula = existing
        ? asFormulaSnapshot(existing.formulaSnapshot)
        : HR_PAYROLL_FORMULA_V1;

      const timesheet = await tx.hrTimesheetMonth.findUnique({
        where: { year_month: { year, month } },
      });
      const rawEmployments = await tx.hrEmployment.findMany({
        where: {
          validFrom: { lte: monthEnd },
          OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
          employee: { deletedAt: null },
        },
        include: employmentInclude,
      });
      const { employments, idRemap } = dedupeEmploymentsByEmployeePayGroup(rawEmployments);
      const entries = await loadTimesheetEntriesForPayroll(
        year,
        month,
        weeks,
        periodMode,
        timesheet?.id ?? null,
        tx,
      );
      const normHours = timesheet ? Number(timesheet.normHours.toFixed(2)) : Number(meta.normHours);
      const preview = await this.previewLines(
        employments,
        entries,
        idRemap,
        weeks,
        monthStart,
        monthEnd,
        formula,
        normHours,
        false,
        periodMode,
        dateFrom,
        dateTo,
        year,
        month,
      );
      const employmentById = new Map(employments.map((row) => [row.id, row]));

      const period = existing
        ? await tx.hrPayrollPeriod.update({
            where: { id: existing.id },
            data: {
              status: 'calculated',
              version: { increment: 1 },
              formulaId: formula.formulaId,
              formulaSnapshot: formula as unknown as Prisma.InputJsonValue,
              timesheetMonthId: timesheet?.id ?? null,
            },
          })
        : await tx.hrPayrollPeriod.create({
            data: {
              year,
              month,
              periodKey,
              status: 'calculated',
              version: 1,
              formulaId: formula.formulaId,
              formulaSnapshot: formula as unknown as Prisma.InputJsonValue,
              timesheetMonthId: timesheet?.id ?? null,
            },
          });

      await tx.hrPayrollLine.deleteMany({ where: { periodId: period.id } });
      if (preview.length > 0) {
        await tx.hrPayrollLine.createMany({
          data: preview.flatMap((line) => {
            const employment = employmentById.get(line.employmentId);
            if (!employment) return [];
            return [{
            periodId: period.id,
            employmentId: line.employmentId,
            payGroupId: employment.payGroupId,
            formulaId: line.formulaId,
            rate: new Prisma.Decimal(line.rate),
            rateKind: line.rateKind,
            normHours: new Prisma.Decimal(line.normHours),
            hoursByKind: line.hoursByKind as unknown as Prisma.InputJsonValue,
            ratesUsed: line.ratesUsed as unknown as Prisma.InputJsonValue,
            weekAmounts: line.weekAmounts as unknown as Prisma.InputJsonValue,
            breakdown: line.breakdown as unknown as Prisma.InputJsonValue,
            accruedAmount: new Prisma.Decimal(line.accruedAmount),
            extraAmount: new Prisma.Decimal(line.extraAmount),
            toPayAmount: new Prisma.Decimal(line.toPayAmount),
            grossAccrued: new Prisma.Decimal(line.grossAccrued),
            netToPay: new Prisma.Decimal(line.netToPay),
            employerTotalCost: new Prisma.Decimal(line.employerTotalCost),
            bonusAmount: new Prisma.Decimal(line.bonusAmount),
            esvAmount: new Prisma.Decimal(line.esvAmount),
            taxAmount: new Prisma.Decimal(line.taxAmount),
            taxBreakdown: line.taxBreakdown as unknown as Prisma.InputJsonValue,
            skipReason: line.skipReason,
            }];
          }),
        });
      }

      logServer(`[hr] payroll calculated periodId=${period.id} year=${year} month=${month} lines=${preview.length}`);
    });

    return this.loadMonth(monthParam, revealCard, options);
  }

  async updateFormula(
    monthParam: string | undefined,
    extraRate: string,
    grossDivisor: string,
    version: number | undefined,
    revealCard: boolean,
    options?: HrPayrollPeriodOptions,
  ): Promise<HrPayrollLoadDto> {
    const { year, month } = this.parseMonth(monthParam);
    const { periodMode, dateFrom, dateTo } = await resolvePayrollWeeks(year, month, options);
    const periodKey = buildPayrollPeriodKey(periodMode, dateFrom, dateTo);
    const formula = buildFormulaSnapshot(extraRate, grossDivisor);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.hrPayrollPeriod.findUnique({
        where: { year_month_periodKey: { year, month, periodKey } },
      });
      if (existing?.status === 'locked') {
        throw new HrError('Період заблоковано. Налаштування формули не можна змінити.', 409, 'PAYROLL_LOCKED');
      }
      if (existing && version != null && existing.version !== version) {
        throw new HrError('Розрахунок змінено іншим користувачем. Оновіть дані.', 409, 'PAYROLL_VERSION');
      }

      if (existing) {
        await tx.hrPayrollPeriod.update({
          where: { id: existing.id },
          data: {
            formulaId: formula.formulaId,
            formulaSnapshot: formula as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
      } else {
        await tx.hrPayrollPeriod.create({
          data: {
            year,
            month,
            periodKey,
            status: 'draft',
            version: 1,
            formulaId: formula.formulaId,
            formulaSnapshot: formula as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    logServer(`[hr] payroll formula updated year=${year} month=${month}`);
    return this.loadMonth(monthParam, revealCard, options);
  }

  async lock(
    periodId: number,
    version: number,
    userId: number | undefined,
    revealCard: boolean,
    options?: HrPayrollPeriodOptions,
  ): Promise<HrPayrollLoadDto> {
    const period = await prisma.hrPayrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new HrError('Період розрахунку не знайдено', 404);
    if (period.status === 'locked') {
      throw new HrError('Розрахунок уже заблоковано', 409, 'PAYROLL_LOCKED');
    }
    if (period.status !== 'calculated') {
      throw new HrError('Спочатку збережіть розрахунок');
    }
    if (period.version !== version || !Number.isInteger(version) || version < 1) {
      throw new HrError('Розрахунок змінено іншим користувачем. Оновіть дані.', 409, 'PAYROLL_VERSION');
    }
    const updated = await prisma.hrPayrollPeriod.updateMany({
      where: { id: periodId, version, status: 'calculated' },
      data: {
        status: 'locked',
        version: { increment: 1 },
        lockedAt: new Date(),
        lockedByUserId: userId ?? null,
      },
    });
    if (updated.count !== 1) {
      throw new HrError('Розрахунок змінено іншим користувачем. Оновіть дані.', 409, 'PAYROLL_VERSION');
    }
    logServer(`[hr] payroll locked periodId=${periodId}`);
    return this.loadMonth(`${period.year}-${String(period.month).padStart(2, '0')}`, revealCard, options);
  }

  async addPayout(periodId: number, payload: HrPayoutWritePayload): Promise<HrPayoutDto> {
    const period = await this.requirePeriod(periodId);
    this.assertPeriodNotDraft(period);
    const employmentId = Number(payload.employmentId);
    const employment = await prisma.hrEmployment.findUnique({ where: { id: employmentId }, select: { id: true } });
    if (!employment) throw new HrError('Зайнятість не знайдено', 404);
    if (!isPayoutKind(payload.kind)) throw new HrError('Невідомий тип виплати');
    const created = await prisma.hrPayout.create({
      data: {
        periodId,
        employmentId,
        weekId: payload.weekId?.trim() || null,
        kind: payload.kind,
        amount: parseMoney(payload.amount),
        paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
        note: payload.note?.trim() || null,
      },
    });
    return toPayoutDto(created);
  }

  async updatePayout(payoutId: number, payload: HrPayoutWritePayload): Promise<HrPayoutDto> {
    const existing = await prisma.hrPayout.findUnique({ where: { id: payoutId } });
    if (!existing) throw new HrError('Виплату не знайдено', 404);
    const period = await this.requirePeriod(existing.periodId);
    this.assertPeriodNotDraft(period);
    if (!isPayoutKind(payload.kind)) throw new HrError('Невідомий тип виплати');
    const updated = await prisma.hrPayout.update({
      where: { id: payoutId },
      data: {
        weekId: payload.weekId === undefined ? existing.weekId : payload.weekId?.trim() || null,
        kind: payload.kind,
        amount: payload.amount != null ? parseMoney(payload.amount) : existing.amount,
        paidAt: payload.paidAt === undefined ? existing.paidAt : payload.paidAt ? new Date(payload.paidAt) : null,
        note: payload.note === undefined ? existing.note : payload.note?.trim() || null,
      },
    });
    return toPayoutDto(updated);
  }

  async deletePayout(payoutId: number): Promise<void> {
    const existing = await prisma.hrPayout.findUnique({ where: { id: payoutId } });
    if (!existing) throw new HrError('Виплату не знайдено', 404);
    const period = await this.requirePeriod(existing.periodId);
    this.assertPeriodNotDraft(period);
    await prisma.hrPayout.delete({ where: { id: payoutId } });
  }

  private assertPeriodNotDraft(period: { status: string }): void {
    if (period.status === 'draft') {
      throw new HrError('Спочатку збережіть розрахунок');
    }
  }

  private async requirePeriod(id: number) {
    const period = await prisma.hrPayrollPeriod.findUnique({ where: { id } });
    if (!period) throw new HrError('Період розрахунку не знайдено', 404);
    return period;
  }

  private parseMonth(monthParam: string | undefined): { year: number; month: number } {
    try {
      return parseYearMonth(monthParam);
    } catch (error) {
      throw new HrError(error instanceof Error ? error.message : 'Некоректний місяць');
    }
  }

  private async listEmployments(monthStart: Date, monthEnd: Date) {
    const rows = await prisma.hrEmployment.findMany({
      where: {
        validFrom: { lte: monthEnd },
        OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
        employee: { deletedAt: null },
      },
      include: employmentInclude,
      orderBy: [{ payGroup: { sortOrder: 'asc' } }, { id: 'asc' }],
    });
    return dedupeEmploymentsByEmployeePayGroup(rows);
  }

  private async buildPreviewLines(
    employments: EmploymentRow[],
    timesheet: { id: number; normHours: Prisma.Decimal } | null,
    idRemap: Map<number, number>,
    weeks: HrTimesheetWeekDto[],
    monthStart: Date,
    monthEnd: Date,
    period: { formulaSnapshot: unknown } | null,
    defaultNormHours: string,
    revealCard: boolean,
    periodMode: HrPayrollPeriodMode,
    customFrom: string | null,
    customTo: string | null,
    year: number,
    month: number,
  ): Promise<HrPayrollLineDto[]> {
    const entries = await loadTimesheetEntriesForPayroll(
      year,
      month,
      weeks,
      periodMode,
      timesheet?.id ?? null,
    );
    const formula = period ? asFormulaSnapshot(period.formulaSnapshot) : HR_PAYROLL_FORMULA_V1;
    const normHours = timesheet ? Number(timesheet.normHours.toFixed(2)) : Number(defaultNormHours);
    return this.previewLines(
      employments,
      entries,
      idRemap,
      weeks,
      monthStart,
      monthEnd,
      formula,
      normHours,
      revealCard,
      periodMode,
      customFrom,
      customTo,
      year,
      month,
    );
  }

  private async previewLines(
    employments: EmploymentRow[],
    entries: Array<{ employmentId: number; date: Date; kind: string; hours: Prisma.Decimal | null }>,
    idRemap: Map<number, number>,
    weeks: HrPayrollLoadDto['weeks'],
    monthStart: Date,
    monthEnd: Date,
    formula: HrPayrollFormulaSnapshot,
    normHours: number,
    revealCard: boolean,
    periodMode: HrPayrollPeriodMode = 'month',
    customFrom: string | null = null,
    customTo: string | null = null,
    year?: number,
    month?: number,
  ): Promise<HrPayrollLineDto[]> {
    const entriesByEmployment = new Map<number, PayrollEntryInput[]>();
    for (const entry of entries) {
      const canonicalId = remapEmploymentId(idRemap, entry.employmentId);
      const list = entriesByEmployment.get(canonicalId) ?? [];
      list.push({
        date: toDateOnlyUtc(entry.date),
        kind: (isTimesheetKind(entry.kind) ? entry.kind : 'work') as HrTimesheetKind,
        hours: entry.hours == null ? null : Number(entry.hours.toFixed(2)),
      });
      entriesByEmployment.set(canonicalId, list);
    }

    const bonusYear = year ?? monthStart.getUTCFullYear();
    const bonusMonth = month ?? monthStart.getUTCMonth() + 1;
    const bonusSums =
      periodMode === 'custom' && customFrom && customTo
        ? await hrBonusService.sumProportionalByEmploymentForRange(bonusYear, bonusMonth, customFrom, customTo)
        : await hrBonusService.sumByEmploymentForMonth(bonusYear, bonusMonth);

    const calcWeeks =
      periodMode === 'custom' && customFrom && customTo
        ? [{ id: 'custom', label: 'custom', startDate: customFrom, endDate: customTo, colSpan: 1 }]
        : weeks;

    const results: HrPayrollLineDto[] = [];
    for (const employment of employments) {
      const payGroup = isPayGroup(employment.payGroup.slug) ? employment.payGroup.slug : 'official_salary';
      const terms = pickPayTerms(employment.payTerms, monthStart, monthEnd);
      const rate = terms ? Number(terms.amount.toFixed(2)) : 0;
      const rateKind: HrPayTermsKind = terms && isRateKind(terms.kind) ? terms.kind : payGroup === 'official_salary' ? 'salary' : 'hourly';
      const taxRules = await hrTaxRuleService.getActiveForDate(payGroup, monthEnd);
      const bonusAmount = bonusSums.get(employment.id) ?? 0;
      let employmentEntries = entriesByEmployment.get(employment.id) ?? [];
      if (periodMode === 'custom' && customFrom && customTo) {
        employmentEntries = employmentEntries.filter(
          (entry) => entry.date >= customFrom && entry.date <= customTo,
        );
      }
      const calc = calculatePayrollLineWithTaxes({
        payGroup,
        rateKind,
        rate,
        normHours,
        entries: employmentEntries,
        weeks: calcWeeks,
        formula,
        taxRules,
        bonusAmount,
        monthStart: periodMode === 'production' ? toDateOnlyUtc(monthStart) : undefined,
        monthEnd: periodMode === 'production' ? toDateOnlyUtc(monthEnd) : undefined,
      });

      if (periodMode === 'custom') {
        const salary = Number(calc.toPayAmount);
        const employerTaxes = (calc.taxBreakdown ?? [])
          .filter((item) => item.payer === 'employer')
          .reduce((sum, item) => sum + Number(item.amount), 0);
        const taxes = Number(calc.taxAmount) + employerTaxes;
        const bonus = Number(calc.bonusAmount);
        const total = salary + taxes + bonus;
        calc.weekAmounts = [
          { weekId: 'salary', hours: calc.weekAmounts[0]?.hours ?? '0.00', accrued: calc.accruedAmount, extra: '0.00', toPay: salary.toFixed(2) },
          { weekId: 'taxes', hours: '0.00', accrued: '0.00', extra: '0.00', toPay: taxes.toFixed(2) },
          { weekId: 'bonus', hours: '0.00', accrued: '0.00', extra: '0.00', toPay: bonus.toFixed(2) },
          { weekId: 'total', hours: '0.00', accrued: '0.00', extra: '0.00', toPay: total.toFixed(2) },
        ];
        calc.toPayAmount = total.toFixed(2);
      }

      results.push(
        toLineDtoFromCalc(
          employment,
          calc,
          rate.toFixed(2),
          rateKind,
          normHours.toFixed(2),
          revealCard,
          null,
        ),
      );
    }
    return results;
  }

  private lineFromSnapshot(
    employment: EmploymentRow,
    line: {
      id: number;
      formulaId: string;
      rate: Prisma.Decimal;
      rateKind: string;
      normHours: Prisma.Decimal;
      hoursByKind: Prisma.JsonValue;
      ratesUsed: Prisma.JsonValue;
      weekAmounts: Prisma.JsonValue;
      breakdown: Prisma.JsonValue;
      accruedAmount: Prisma.Decimal;
      extraAmount: Prisma.Decimal;
      toPayAmount: Prisma.Decimal;
      grossAccrued?: Prisma.Decimal;
      netToPay?: Prisma.Decimal;
      employerTotalCost?: Prisma.Decimal;
      bonusAmount?: Prisma.Decimal;
      esvAmount?: Prisma.Decimal | null;
      taxAmount?: Prisma.Decimal | null;
      taxBreakdown?: Prisma.JsonValue;
      skipReason: string | null;
    },
    revealCard: boolean,
  ): HrPayrollLineDto {
    const payGroup = isPayGroup(employment.payGroup.slug) ? employment.payGroup.slug : 'official_salary';
    const employeeKey = hrEmployeeImportKey(
      employment.employee.lastName,
      employment.employee.firstName,
      employment.employee.middleName,
    );
    let cardNumber: string | null = null;
    if (revealCard && employment.employee.cardNumberEncrypted) {
      cardNumber = decryptCardNumber(employment.employee.cardNumberEncrypted);
    }
    return {
      id: line.id,
      employmentId: employment.id,
      employeeId: employment.employeeId,
      displayName: employment.employee.displayName,
      payGroup,
      legalEntityName: employment.legalEntity.name,
      legalEntityCode: employment.legalEntity.code,
      employmentImportKey: hrEmploymentImportKey(
        employeeKey,
        employment.legalEntity.code,
        payGroup,
        toDateOnlyUtc(employment.validFrom),
      ),
      formulaId: line.formulaId,
      rate: moneyFromDecimal(line.rate),
      rateKind: isRateKind(line.rateKind) ? line.rateKind : 'salary',
      normHours: line.normHours.toFixed(2),
      hoursByKind: asHoursByKind(line.hoursByKind),
      ratesUsed: asFormulaSnapshot(line.ratesUsed),
      weekAmounts: asWeekAmounts(line.weekAmounts),
      breakdown: asBreakdown(line.breakdown),
      accruedAmount: moneyFromDecimal(line.accruedAmount),
      extraAmount: moneyFromDecimal(line.extraAmount),
      toPayAmount: moneyFromDecimal(line.toPayAmount),
      grossAccrued: moneyFromDecimal(line.grossAccrued ?? line.toPayAmount),
      netToPay: moneyFromDecimal(line.netToPay ?? line.toPayAmount),
      employerTotalCost: moneyFromDecimal(line.employerTotalCost ?? line.toPayAmount),
      bonusAmount: moneyFromDecimal(line.bonusAmount ?? new Prisma.Decimal(0)),
      esvAmount: moneyFromDecimal(line.esvAmount ?? line.extraAmount),
      taxAmount: moneyFromDecimal(line.taxAmount ?? new Prisma.Decimal(0)),
      ...taxAmountsFromBreakdown(asTaxBreakdown(line.taxBreakdown)),
      taxBreakdown: asTaxBreakdown(line.taxBreakdown),
      skipReason: isSkipReason(line.skipReason) ? line.skipReason : null,
      cardMasked: maskCardLast4(employment.employee.cardLast4),
      cardNumber,
    };
  }

  private sortLines(lines: HrPayrollLineDto[]): void {
    const groupOrder = new Map(HR_PAY_GROUPS.map((group, index) => [group, index]));
    lines.sort((a, b) => {
      const ga = groupOrder.get(a.payGroup) ?? 99;
      const gb = groupOrder.get(b.payGroup) ?? 99;
      if (ga !== gb) return ga - gb;
      return a.displayName.localeCompare(b.displayName, 'uk');
    });
  }
}

export const hrPayrollService = new HrPayrollService();
