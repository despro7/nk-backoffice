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
  type HrPayrollLoadDto,
  type HrPayrollPeriodDto,
  type HrPayrollSkipReason,
  type HrPayrollStatus,
  type HrPayrollSummaryDto,
  type HrPayrollWeekAmount,
  type HrPayoutDto,
  type HrPayoutKind,
  type HrPayoutWritePayload,
  type HrTimesheetKind,
} from '../../../shared/types/hr.js';
import {
  buildTimesheetMonthMeta,
  parseYearMonth,
  toDateOnlyUtc,
  utcDate,
} from '../../../shared/utils/hrTimesheetCalendar.js';
import { isTimesheetKind } from '../../../shared/utils/hrTimesheetCell.js';
import { decryptCardNumber, maskCardLast4 } from './HrCardCrypto.js';
import { HrError } from './HrService.js';
import { HR_PAYROLL_FORMULA_V1, calculatePayrollLine, type PayrollEntryInput } from './payrollCalc.js';

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
  payTerms: true,
} satisfies Prisma.HrEmploymentInclude;

type EmploymentRow = Prisma.HrEmploymentGetPayload<{ include: typeof employmentInclude }>;

function toLineDtoFromCalc(
  employment: EmploymentRow,
  calc: ReturnType<typeof calculatePayrollLine>,
  rate: string,
  rateKind: HrPayTermsKind,
  normHours: string,
  revealCard: boolean,
  lineId: number | null,
): HrPayrollLineDto {
  const payGroup = isPayGroup(employment.payGroup) ? employment.payGroup : 'official_salary';
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
    skipReason: calc.skipReason,
    cardMasked: maskCardLast4(employment.employee.cardLast4),
    cardNumber,
  };
}

export class HrPayrollService {
  async loadMonth(monthParam: string | undefined, revealCard: boolean): Promise<HrPayrollLoadDto> {
    const { year, month } = this.parseMonth(monthParam);
    const meta = buildTimesheetMonthMeta(year, month);
    const monthStart = utcDate(year, month, 1);
    const monthEnd = utcDate(year, month, meta.days.length);

    const [period, timesheet, employments] = await Promise.all([
      prisma.hrPayrollPeriod.findUnique({
        where: { year_month: { year, month } },
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

    const payouts = period ? period.payouts.map(toPayoutDto) : [];
    const useSnapshot = period && (period.status === 'calculated' || period.status === 'locked');

    let lines: HrPayrollLineDto[];
    if (useSnapshot && period) {
      const byEmployment = new Map(employments.map((row) => [row.id, row]));
      lines = period.lines
        .map((line) => {
          const employment = byEmployment.get(line.employmentId);
          if (!employment) return null;
          return this.lineFromSnapshot(employment, line, revealCard);
        })
        .filter((item): item is HrPayrollLineDto => item != null);
    } else {
      const entries = timesheet
        ? await prisma.hrTimesheetEntry.findMany({ where: { monthId: timesheet.id } })
        : [];
      const formula = period ? asFormulaSnapshot(period.formulaSnapshot) : HR_PAYROLL_FORMULA_V1;
      const normHours = timesheet ? Number(timesheet.normHours.toFixed(2)) : Number(meta.normHours);
      lines = this.previewLines(employments, entries, meta.weeks, monthStart, monthEnd, formula, normHours, revealCard);
    }

    this.sortLines(lines);

    return {
      source: useSnapshot ? 'snapshot' : 'preview',
      period: period ? toPeriodDto(period) : null,
      weeks: meta.weeks,
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
  ): Promise<HrPayrollLoadDto> {
    const { year, month } = this.parseMonth(monthParam);
    const meta = buildTimesheetMonthMeta(year, month);
    const monthStart = utcDate(year, month, 1);
    const monthEnd = utcDate(year, month, meta.days.length);
    const formula = HR_PAYROLL_FORMULA_V1;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.hrPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
      if (existing?.status === 'locked') {
        throw new HrError('Розрахунок заблоковано. Перерахунок неможливий.', 409, 'PAYROLL_LOCKED');
      }
      if (existing && version != null && existing.version !== version) {
        throw new HrError('Розрахунок змінено іншим користувачем. Оновіть дані.', 409, 'PAYROLL_VERSION');
      }

      const timesheet = await tx.hrTimesheetMonth.findUnique({
        where: { year_month: { year, month } },
      });
      const employments = await tx.hrEmployment.findMany({
        where: {
          validFrom: { lte: monthEnd },
          OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
          employee: { deletedAt: null },
        },
        include: employmentInclude,
      });
      const entries = timesheet
        ? await tx.hrTimesheetEntry.findMany({ where: { monthId: timesheet.id } })
        : [];
      const normHours = timesheet ? Number(timesheet.normHours.toFixed(2)) : Number(meta.normHours);
      const preview = this.previewLines(
        employments,
        entries,
        meta.weeks,
        monthStart,
        monthEnd,
        formula,
        normHours,
        false,
      );

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
          data: preview.map((line) => ({
            periodId: period.id,
            employmentId: line.employmentId,
            payGroup: line.payGroup,
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
            skipReason: line.skipReason,
          })),
        });
      }

      logServer(`[hr] payroll calculated periodId=${period.id} year=${year} month=${month} lines=${preview.length}`);
    });

    return this.loadMonth(monthParam, revealCard);
  }

  async lock(
    periodId: number,
    version: number,
    userId: number | undefined,
    revealCard: boolean,
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
    return this.loadMonth(`${period.year}-${String(period.month).padStart(2, '0')}`, revealCard);
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

  private async listEmployments(monthStart: Date, monthEnd: Date): Promise<EmploymentRow[]> {
    return prisma.hrEmployment.findMany({
      where: {
        validFrom: { lte: monthEnd },
        OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
        employee: { deletedAt: null },
      },
      include: employmentInclude,
      orderBy: [{ payGroup: 'asc' }, { id: 'asc' }],
    });
  }

  private previewLines(
    employments: EmploymentRow[],
    entries: Array<{ employmentId: number; date: Date; kind: string; hours: Prisma.Decimal | null }>,
    weeks: HrPayrollLoadDto['weeks'],
    monthStart: Date,
    monthEnd: Date,
    formula: HrPayrollFormulaSnapshot,
    normHours: number,
    revealCard: boolean,
  ): HrPayrollLineDto[] {
    const entriesByEmployment = new Map<number, PayrollEntryInput[]>();
    for (const entry of entries) {
      const list = entriesByEmployment.get(entry.employmentId) ?? [];
      list.push({
        date: toDateOnlyUtc(entry.date),
        kind: (isTimesheetKind(entry.kind) ? entry.kind : 'work') as HrTimesheetKind,
        hours: entry.hours == null ? null : Number(entry.hours.toFixed(2)),
      });
      entriesByEmployment.set(entry.employmentId, list);
    }

    return employments.map((employment) => {
      const payGroup = isPayGroup(employment.payGroup) ? employment.payGroup : 'official_salary';
      const terms = pickPayTerms(employment.payTerms, monthStart, monthEnd);
      const rate = terms ? Number(terms.amount.toFixed(2)) : 0;
      const rateKind: HrPayTermsKind = terms && isRateKind(terms.kind) ? terms.kind : payGroup === 'official_salary' ? 'salary' : 'hourly';
      const calc = calculatePayrollLine({
        payGroup,
        rateKind,
        rate,
        normHours,
        entries: entriesByEmployment.get(employment.id) ?? [],
        weeks,
        formula,
      });
      return toLineDtoFromCalc(
        employment,
        calc,
        rate.toFixed(2),
        rateKind,
        normHours.toFixed(2),
        revealCard,
        null,
      );
    });
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
      skipReason: string | null;
    },
    revealCard: boolean,
  ): HrPayrollLineDto {
    const payGroup = isPayGroup(employment.payGroup) ? employment.payGroup : 'official_salary';
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
