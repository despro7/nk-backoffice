import { prisma } from '../../lib/utils.js';
import {
  HR_PAY_GROUPS,
  type HrFopSummaryDto,
  type HrPayGroup,
  type HrPayrollLineDto,
} from '../../../shared/types/hr.js';
import {
  aggregateFopFromTimesheet,
  calendarWeekId,
} from '../../../shared/utils/hrProductionWeek.js';
import {
  dedupeEmploymentsByEmployeePayGroup,
  remapEmploymentId,
} from '../../../shared/utils/hrEmploymentDedupe.js';
import {
  buildTimesheetMonthMeta,
  daysInMonth,
  listYearMonthsInRange,
  parseYearMonth,
  toDateOnlyUtc,
  utcDate,
} from '../../../shared/utils/hrTimesheetCalendar.js';
import { hrBonusService } from './HrBonusService.js';
import { hrPayrollService } from './HrPayrollService.js';
import { hrProductionCalendarService } from './HrProductionCalendarService.js';
import { HrError } from './HrService.js';

function isPayGroup(value: string): value is HrPayGroup {
  return (HR_PAY_GROUPS as readonly string[]).includes(value);
}

function money(value: number): string {
  return value.toFixed(2);
}

function addDaysYmd(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class HrFopService {
  async getSummary(params: {
    periodId?: string;
    periodKind?: 'production' | 'calendar';
    month?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<HrFopSummaryDto> {
    const calendarConfig = await hrProductionCalendarService.get();
    const warnings: string[] = [];

    let periodStart: string;
    let periodEnd: string;
    let periodLabel: string;
    let bonusPeriodId: string;
    let bonusPeriodKind: 'production' | 'calendar';
    let fopWeekdays = calendarConfig.fopWeekdays;
    let responsePeriodId: string;
    let responsePeriodKind: 'production' | 'calendar';

    if (params.dateFrom && params.dateTo) {
      periodStart = params.dateFrom;
      periodEnd = params.dateTo;
      periodLabel = `${params.dateFrom} – ${params.dateTo}`;
      bonusPeriodKind = 'calendar';
      bonusPeriodId = calendarWeekId(params.dateFrom);
      responsePeriodId = bonusPeriodId;
      responsePeriodKind = 'calendar';
      if (!calendarConfig.isEnabled) {
        fopWeekdays = [1, 2, 3, 4, 5, 6, 0];
      }
    } else if (params.periodId) {
      responsePeriodId = params.periodId;
      responsePeriodKind = params.periodKind === 'production' ? 'production' : 'calendar';
      bonusPeriodId = params.periodId;
      bonusPeriodKind = responsePeriodKind;

      if (params.periodKind === 'production') {
        const weekId = Number(params.periodId);
        const week = Number.isInteger(weekId) && weekId > 0
          ? await prisma.hrProductionWeek.findUnique({ where: { id: weekId } })
          : null;

        if (week) {
          periodStart = week.startDate.toISOString().slice(0, 10);
          periodEnd = week.endDate.toISOString().slice(0, 10);
          periodLabel = week.label;
          fopWeekdays = Array.isArray(week.fopWeekdays)
            ? (week.fopWeekdays as number[])
            : calendarConfig.fopWeekdays;
        } else {
          periodStart = params.periodId;
          periodEnd = addDaysYmd(params.periodId, 6);
          periodLabel = `${periodStart} – ${periodEnd}`;
        }
      } else {
        periodStart = params.periodId;
        periodEnd = addDaysYmd(params.periodId, 4);
        periodLabel = `Календарний тиждень ${periodStart}`;
        if (!calendarConfig.isEnabled) {
          fopWeekdays = [1, 2, 3, 4, 5, 6, 0];
        }
      }
    } else {
      throw new HrError('Вкажіть період');
    }

    const monthsToLoad = listYearMonthsInRange(periodStart, periodEnd);
    const useDateRangeBonuses = Boolean(params.dateFrom && params.dateTo);

    if (monthsToLoad.length > 1) {
      warnings.push('Обраний період охоплює кілька календарних місяців — суми зведені пропорційно по кожному місяцю.');
    }

    const lines: HrFopSummaryDto['lines'] = [];
    const byPayGroup: Record<HrPayGroup, number> = {
      official_salary: 0,
      hourly: 0,
      unofficial_cash: 0,
    };
    const byLegalEntity = new Map<string, { legalEntityCode: string; legalEntityName: string; employerTotalCost: number }>();
    let source: 'snapshot' | 'preview' = 'preview';
    const bonusAppliedEmploymentIds = new Set<number>();
    let periodBonusSums: Map<number, number> | undefined;

    if (useDateRangeBonuses) {
      const employmentIds = new Set<number>();
      for (const { year, month } of monthsToLoad) {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const payrollLoad = await hrPayrollService.loadMonth(monthStr, false);
        for (const payrollLine of payrollLoad.lines) {
          employmentIds.add(payrollLine.employmentId);
        }
      }
      periodBonusSums = await hrBonusService.sumApprovedByEmploymentForDateRange(
        [...employmentIds],
        periodStart,
        periodEnd,
      );
    }

    for (const { year, month } of monthsToLoad) {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const payrollLoad = await hrPayrollService.loadMonth(monthStr, false);

      if (payrollLoad.source === 'snapshot') source = 'snapshot';
      else if (payrollLoad.period?.status === 'calculated') {
        warnings.push(`Розрахунок ${monthStr} не заблоковано — показано preview.`);
      }

      const monthStart = utcDate(year, month, 1);
      const monthEnd = utcDate(year, month, daysInMonth(year, month));

      const [timesheet, employmentRows] = await Promise.all([
        prisma.hrTimesheetMonth.findUnique({
          where: { year_month: { year, month } },
          include: { entries: true },
        }),
        prisma.hrEmployment.findMany({
          where: {
            validFrom: { lte: monthEnd },
            OR: [{ validTo: null }, { validTo: { gte: monthStart } }],
            employee: { deletedAt: null },
          },
          include: {
            employee: { select: { id: true } },
            legalEntity: { select: { code: true, name: true } },
            payGroup: { select: { id: true } },
          },
        }),
      ]);

      const { idRemap } = dedupeEmploymentsByEmployeePayGroup(employmentRows);

      const payrollLines = payrollLoad.lines;
      const employmentIds = payrollLines.map((line) => line.employmentId);

      const bonusSums = useDateRangeBonuses
        ? (periodBonusSums ?? new Map<number, number>())
        : await hrBonusService.sumApprovedByEmployment(
          employmentIds,
          bonusPeriodId,
          bonusPeriodKind,
        );

      const entriesByEmployment = new Map<number, Array<{ date: string; kind: string; hours: number | null }>>();
      for (const entry of timesheet?.entries ?? []) {
        const date = toDateOnlyUtc(entry.date);
        const canonicalId = remapEmploymentId(idRemap, entry.employmentId);
        const list = entriesByEmployment.get(canonicalId) ?? [];
        const hours = entry.hours == null ? null : Number(entry.hours);
        const existingIdx = list.findIndex((item) => item.date === date);
        if (existingIdx >= 0) {
          list[existingIdx] = { date, kind: entry.kind, hours };
        } else {
          list.push({ date, kind: entry.kind, hours });
        }
        entriesByEmployment.set(canonicalId, list);
      }

      for (const line of payrollLines) {
        this.accumulateFopLine({
          line,
          bonusSums,
          periodBonusSums: useDateRangeBonuses ? periodBonusSums : undefined,
          bonusAppliedEmploymentIds: useDateRangeBonuses ? bonusAppliedEmploymentIds : undefined,
          entriesByEmployment,
          fopWeekdays,
          periodStart,
          periodEnd,
          lines,
          byPayGroup,
          byLegalEntity,
        });
      }
    }

    const draftBonuses = useDateRangeBonuses
      ? await hrBonusService.countDraftOverlappingRange(periodStart, periodEnd)
      : await prisma.hrBonus.count({
        where: {
          status: 'draft',
          ...(bonusPeriodKind === 'production'
            ? { productionWeekId: Number(bonusPeriodId) || undefined }
            : { calendarWeekId: bonusPeriodId }),
        },
      });
    if (draftBonuses > 0) {
      warnings.push(`Є ${draftBonuses} незатверджених премій (draft) — вони не включені у фонд оплати праці.`);
    }

    const totalEmployerCost = lines.reduce((sum, line) => sum + Number(line.employerTotalCost), 0);

    if (lines.length > 0 && !lines.some((line) => line.includedDays > 0)) {
      warnings.push(
        'Немає робочих годин у табелі за обраний період — суми фонду оплати праці будуть 0. Заповніть табель або розширте діапазон дат.',
      );
    }

    return {
      periodId: responsePeriodId,
      periodKind: responsePeriodKind,
      periodLabel,
      calendarConfig,
      fopWeekdays,
      totalEmployerCost: money(totalEmployerCost),
      byPayGroup: {
        official_salary: money(byPayGroup.official_salary),
        hourly: money(byPayGroup.hourly),
        unofficial_cash: money(byPayGroup.unofficial_cash),
      },
      byLegalEntity: [...byLegalEntity.values()].map((item) => ({
        ...item,
        employerTotalCost: money(item.employerTotalCost),
      })),
      lines,
      source,
      warnings,
    };
  }

  private accumulateFopLine(params: {
    line: HrPayrollLineDto;
    bonusSums: Map<number, number>;
    periodBonusSums?: Map<number, number>;
    bonusAppliedEmploymentIds?: Set<number>;
    entriesByEmployment: Map<number, Array<{ date: string; kind: string; hours: number | null }>>;
    fopWeekdays: number[];
    periodStart: string;
    periodEnd: string;
    lines: HrFopSummaryDto['lines'];
    byPayGroup: Record<HrPayGroup, number>;
    byLegalEntity: Map<string, { legalEntityCode: string; legalEntityName: string; employerTotalCost: number }>;
  }): void {
    const {
      line,
      bonusSums,
      periodBonusSums,
      bonusAppliedEmploymentIds,
      entriesByEmployment,
      fopWeekdays,
      periodStart,
      periodEnd,
      lines,
      byPayGroup,
      byLegalEntity,
    } = params;

    const payGroup = isPayGroup(line.payGroup) ? line.payGroup : 'official_salary';
    let bonusAmount = bonusSums.get(line.employmentId) ?? Number(line.bonusAmount);
    if (periodBonusSums) {
      if (bonusAppliedEmploymentIds?.has(line.employmentId)) {
        bonusAmount = 0;
      } else {
        bonusAmount = periodBonusSums.get(line.employmentId) ?? 0;
        if (bonusAmount > 0) {
          bonusAppliedEmploymentIds?.add(line.employmentId);
        }
      }
    }
    const employerTotalCost = Number(line.employerTotalCost);
    const esvAmount = Number(line.esvAmount ?? 0);

    const entries = entriesByEmployment.get(line.employmentId) ?? [];
    const agg = aggregateFopFromTimesheet(
      entries,
      {
        payGroup,
        rateKind: line.rateKind,
        rate: Number(line.rate),
        normHours: Number(line.normHours),
        grossAccrued: Number(line.grossAccrued),
        employerTotalCost,
        bonusAmount,
        esvAmount,
      },
      fopWeekdays,
      periodStart,
      periodEnd,
    );

    const existing = lines.find((item) => item.employmentId === line.employmentId);
    if (existing) {
      existing.employerTotalCost = money(Number(existing.employerTotalCost) + agg.employerCost);
      existing.includedDays += agg.includedDays;
      byPayGroup[payGroup] += agg.employerCost;
      const entityKey = line.legalEntityCode;
      const entity = byLegalEntity.get(entityKey) ?? {
        legalEntityCode: entityKey,
        legalEntityName: line.legalEntityName,
        employerTotalCost: 0,
      };
      entity.employerTotalCost += agg.employerCost;
      byLegalEntity.set(entityKey, entity);
      return;
    }

    const displayBonusAmount = periodBonusSums
      ? (periodBonusSums.get(line.employmentId) ?? 0)
      : bonusAmount;

    lines.push({
      employmentId: line.employmentId,
      displayName: line.displayName,
      payGroup,
      employerTotalCost: money(agg.employerCost),
      bonusAmount: money(displayBonusAmount),
      esvAmount: money(esvAmount),
      includedDays: agg.includedDays,
    });

    byPayGroup[payGroup] += agg.employerCost;
    const entityKey = line.legalEntityCode;
    const entity = byLegalEntity.get(entityKey) ?? {
      legalEntityCode: entityKey,
      legalEntityName: line.legalEntityName,
      employerTotalCost: 0,
    };
    entity.employerTotalCost += agg.employerCost;
    byLegalEntity.set(entityKey, entity);
  }

  async listPeriodOptions(monthParam?: string): Promise<Array<{
    id: string;
    kind: 'production' | 'calendar';
    label: string;
    startDate: string;
    endDate: string;
    fopWeekdays?: number[];
  }>> {
    const { year, month } = parseYearMonth(monthParam);
    const config = await hrProductionCalendarService.get();
    const weeks = await hrProductionCalendarService.listWeeks(year, month);

    if (config.isEnabled) {
      return weeks.map((week) => ({
        id: week.id > 0 ? String(week.id) : week.startDate,
        kind: 'production' as const,
        label: week.label,
        startDate: week.startDate,
        endDate: week.endDate,
        fopWeekdays: week.fopWeekdays,
      }));
    }

    const meta = buildTimesheetMonthMeta(year, month);
    return meta.weeks.map((week) => ({
      id: week.id,
      kind: 'calendar' as const,
      label: week.label,
      startDate: week.startDate,
      endDate: week.endDate,
    }));
  }
}

export const hrFopService = new HrFopService();
