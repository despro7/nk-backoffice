import { Prisma } from '@prisma/client';
import { prisma, logServer } from '../../lib/utils.js';
import {
  DEFAULT_PRODUCTION_CALENDAR,
  buildProductionWeek,
  buildProductionWeekLabel,
  listProductionWeeksOverlappingMonth,
  productionWeekStart,
} from '../../../shared/utils/hrProductionWeek.js';
import { toDateOnlyUtc, utcDate } from '../../../shared/utils/hrTimesheetCalendar.js';
import type {
  HrProductionCalendarDto,
  HrProductionCalendarWritePayload,
  HrProductionWeekDto,
} from '../../../shared/types/hr.js';
import { HrError } from './HrService.js';

function parseWeekdays(raw: Prisma.JsonValue): number[] {
  if (!Array.isArray(raw)) return [1, 2, 3, 4, 5];
  return raw.filter((item): item is number => typeof item === 'number' && item >= 0 && item <= 6);
}

function toCalendarDto(row: {
  id: number;
  isEnabled: boolean;
  weekStartDay: number;
  fopWeekdays: Prisma.JsonValue;
  label: string;
}): HrProductionCalendarDto {
  return {
    id: row.id,
    isEnabled: row.isEnabled,
    weekStartDay: row.weekStartDay,
    fopWeekdays: parseWeekdays(row.fopWeekdays),
    label: row.label,
  };
}

function toWeekDto(row: {
  id: number;
  startDate: Date;
  endDate: Date;
  fopWeekdays: Prisma.JsonValue;
  label: string;
  year: number;
  sequence: number;
}): HrProductionWeekDto {
  const startDate = toDateOnlyUtc(row.startDate);
  const endDate = toDateOnlyUtc(row.endDate);
  const fopWeekdays = parseWeekdays(row.fopWeekdays);
  return {
    id: row.id,
    startDate,
    endDate,
    fopWeekdays,
    // Завжди з дат і робочих днів — не з кешу в БД (старі записи мали «ФОП: …»).
    label: buildProductionWeekLabel(startDate, endDate, fopWeekdays),
    year: row.year,
    sequence: row.sequence,
  };
}

export class HrProductionCalendarService {
  async get(): Promise<HrProductionCalendarDto> {
    const row = await prisma.hrProductionCalendar.findFirst({ orderBy: { id: 'asc' } });
    if (!row) return DEFAULT_PRODUCTION_CALENDAR;
    return toCalendarDto(row);
  }

  async update(payload: HrProductionCalendarWritePayload): Promise<HrProductionCalendarDto> {
    const existing = await prisma.hrProductionCalendar.findFirst({ orderBy: { id: 'asc' } });
    const fopWeekdays = payload.fopWeekdays ?? (existing ? parseWeekdays(existing.fopWeekdays) : [1, 2, 3, 4, 5]);

    if (fopWeekdays.length === 0) {
      throw new HrError('Оберіть хоча б один день для розрахунку ФОП');
    }

    const data = {
      isEnabled: payload.isEnabled ?? existing?.isEnabled ?? false,
      weekStartDay: payload.weekStartDay ?? existing?.weekStartDay ?? 1,
      fopWeekdays: fopWeekdays as unknown as Prisma.InputJsonValue,
      label: payload.label?.trim() || existing?.label || 'Стандарт пн–пт',
    };

    const saved = existing
      ? await prisma.hrProductionCalendar.update({ where: { id: existing.id }, data })
      : await prisma.hrProductionCalendar.create({ data });

    await this.rebuildWeeks(new Date().getUTCFullYear());
    logServer('[hr] production calendar updated', { id: saved.id, isEnabled: saved.isEnabled });
    return toCalendarDto(saved);
  }

  async listWeeks(year: number, month?: number): Promise<HrProductionWeekDto[]> {
    const config = await this.get();
    if (!config.isEnabled) {
      if (month == null) return [];
      const { buildTimesheetMonthMeta } = await import('../../../shared/utils/hrTimesheetCalendar.js');
      const meta = buildTimesheetMonthMeta(year, month);
      return meta.weeks.map((week, index) => ({
        id: 0,
        startDate: week.startDate,
        endDate: week.endDate,
        fopWeekdays: config.fopWeekdays,
        label: week.label,
        year,
        sequence: index + 1,
      }));
    }

    if (month != null) {
      const generated = listProductionWeeksOverlappingMonth(year, month, config);
      const rows = await prisma.hrProductionWeek.findMany({
        where: {
          startDate: { lte: utcDate(year, month + 1, 0) },
          endDate: { gte: utcDate(year, month, 1) },
        },
        orderBy: [{ startDate: 'asc' }],
      });
      if (rows.length > 0) return rows.map(toWeekDto);
      return generated;
    }

    const rows = await prisma.hrProductionWeek.findMany({
      where: { year },
      orderBy: [{ sequence: 'asc' }],
    });
    return rows.map(toWeekDto);
  }

  async resolveWeekId(dateStr: string): Promise<{ periodKind: 'production' | 'calendar'; periodId: string; week: HrProductionWeekDto | null }> {
    const config = await this.get();
    if (!config.isEnabled) {
      const { calendarWeekId } = await import('../../../shared/utils/hrProductionWeek.js');
      const weekId = calendarWeekId(dateStr);
      return { periodKind: 'calendar', periodId: weekId, week: null };
    }

    const startDate = productionWeekStart(dateStr, config.weekStartDay);
    const row = await prisma.hrProductionWeek.findFirst({
      where: { startDate: utcDate(
        Number(startDate.slice(0, 4)),
        Number(startDate.slice(5, 7)),
        Number(startDate.slice(8, 10)),
      ) },
    });
    if (row) {
      return { periodKind: 'production', periodId: String(row.id), week: toWeekDto(row) };
    }

    const week = buildProductionWeek(startDate, config.fopWeekdays, Number(startDate.slice(0, 4)), 0);
    return { periodKind: 'production', periodId: startDate, week };
  }

  private async rebuildWeeks(year: number): Promise<void> {
    const config = await this.get();
    if (!config.isEnabled) return;

    const allWeeks: HrProductionWeekDto[] = [];
    for (let month = 1; month <= 12; month += 1) {
      allWeeks.push(...listProductionWeeksOverlappingMonth(year, month, config));
    }

    const unique = new Map<string, HrProductionWeekDto>();
    for (const week of allWeeks) {
      unique.set(week.startDate, week);
    }

    let sequence = 1;
    for (const week of [...unique.values()].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      await prisma.hrProductionWeek.upsert({
        where: {
          startDate_endDate: {
            startDate: utcDate(
              Number(week.startDate.slice(0, 4)),
              Number(week.startDate.slice(5, 7)),
              Number(week.startDate.slice(8, 10)),
            ),
            endDate: utcDate(
              Number(week.endDate.slice(0, 4)),
              Number(week.endDate.slice(5, 7)),
              Number(week.endDate.slice(8, 10)),
            ),
          },
        },
        create: {
          startDate: utcDate(
            Number(week.startDate.slice(0, 4)),
            Number(week.startDate.slice(5, 7)),
            Number(week.startDate.slice(8, 10)),
          ),
          endDate: utcDate(
            Number(week.endDate.slice(0, 4)),
            Number(week.endDate.slice(5, 7)),
            Number(week.endDate.slice(8, 10)),
          ),
          fopWeekdays: week.fopWeekdays as unknown as Prisma.InputJsonValue,
          label: week.label,
          year,
          sequence,
        },
        update: {
          fopWeekdays: week.fopWeekdays as unknown as Prisma.InputJsonValue,
          label: week.label,
          sequence,
        },
      });
      sequence += 1;
    }
  }
}

export const hrProductionCalendarService = new HrProductionCalendarService();
