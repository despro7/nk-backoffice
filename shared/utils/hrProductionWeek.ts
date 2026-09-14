import type { HrProductionCalendarDto, HrProductionWeekDto } from '../types/hr.js';
import { formatHrWorkWeekLabel, type HrPeriodOption } from './hrWorkWeekPeriods.js';
import { toDateOnlyUtc, utcDate } from './hrTimesheetCalendar.js';

const WEEKDAY_LABELS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;

export const HR_PRODUCTION_CALENDAR_PRESETS = {
  monFri: { weekStartDay: 1, fopWeekdays: [1, 2, 3, 4, 5], label: 'Стандарт пн–пт' },
  friThu: { weekStartDay: 5, fopWeekdays: [5, 1, 2, 3, 4], label: 'Виробництво пт–чт' },
} as const;

export const DEFAULT_PRODUCTION_CALENDAR: HrProductionCalendarDto = {
  id: 0,
  isEnabled: false,
  weekStartDay: 1,
  fopWeekdays: [1, 2, 3, 4, 5],
  label: 'Стандарт пн–пт',
};

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return utcDate(y, m, d);
}

function weekdayOf(dateStr: string): number {
  return parseDate(dateStr).getUTCDay();
}

function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnlyUtc(date);
}

function formatFopWeekdays(fopWeekdays: number[]): string {
  return fopWeekdays.map((day) => WEEKDAY_LABELS[day]).join('–');
}

const STANDARD_WORK_WEEKDAYS = [1, 2, 3, 4, 5] as const;

function isStandardWorkWeek(fopWeekdays: number[]): boolean {
  return fopWeekdays.length === STANDARD_WORK_WEEKDAYS.length
    && STANDARD_WORK_WEEKDAYS.every((day) => fopWeekdays.includes(day));
}

/** Лейбл періоду для UI-селектів — завжди з дат, не з кешу БД. */
export function formatHrPeriodOptionLabel(period: HrPeriodOption): string {
  if (!period.startDate || !period.endDate) return period.label;
  if (period.fopWeekdays?.length) {
    return buildProductionWeekLabel(period.startDate, period.endDate, period.fopWeekdays);
  }
  return formatHrWorkWeekLabel(period.startDate, period.endDate);
}

/** Компактний лейбл періоду для селектів (без абревіатури «ФОП»). */
export function buildProductionWeekLabel(
  startDate: string,
  endDate: string,
  fopWeekdays: number[],
): string {
  const dateRange = formatHrWorkWeekLabel(startDate, endDate);
  if (isStandardWorkWeek(fopWeekdays)) return dateRange;
  return `${dateRange} · ${formatFopWeekdays(fopWeekdays)}`;
}

/** Початок виробничого тижня для дати за weekStartDay (0=нд … 6=сб). */
export function productionWeekStart(dateStr: string, weekStartDay: number): string {
  const weekday = weekdayOf(dateStr);
  const offset = (weekday - weekStartDay + 7) % 7;
  return addDays(dateStr, -offset);
}

/** Кінець виробничого тижня (6 днів після початку). */
export function productionWeekEnd(startDate: string): string {
  return addDays(startDate, 6);
}

export function buildProductionWeek(
  startDate: string,
  fopWeekdays: number[],
  year: number,
  sequence: number,
): HrProductionWeekDto {
  const endDate = productionWeekEnd(startDate);
  return {
    id: 0,
    startDate,
    endDate,
    fopWeekdays,
    label: buildProductionWeekLabel(startDate, endDate, fopWeekdays),
    year,
    sequence,
  };
}

/** Усі виробничі тижні року, що перетинають місяць. */
export function listProductionWeeksOverlappingMonth(
  year: number,
  month: number,
  config: HrProductionCalendarDto,
): HrProductionWeekDto[] {
  const monthStart = utcDate(year, month, 1);
  const monthEnd = utcDate(year, month + 1, 0);
  const monthStartStr = toDateOnlyUtc(monthStart);
  const monthEndStr = toDateOnlyUtc(monthEnd);

  const weeks: HrProductionWeekDto[] = [];
  const seen = new Set<string>();

  let cursor = productionWeekStart(monthStartStr, config.weekStartDay);
  if (cursor > monthStartStr) {
    cursor = productionWeekStart(addDays(cursor, -7), config.weekStartDay);
  }

  let sequence = 1;
  while (cursor <= monthEndStr) {
    const endDate = productionWeekEnd(cursor);
    if (endDate >= monthStartStr && cursor <= monthEndStr && !seen.has(cursor)) {
      seen.add(cursor);
      weeks.push(buildProductionWeek(cursor, config.fopWeekdays, year, sequence));
      sequence += 1;
    }
    cursor = addDays(cursor, 7);
    if (weeks.length > 60) break;
  }

  return weeks;
}

/** Календарний weekId (понеділок ISO-тижня табеля). */
export function calendarWeekId(dateStr: string): string {
  const weekday = weekdayOf(dateStr);
  const mondayOffset = (weekday + 6) % 7;
  return addDays(dateStr, -mondayOffset);
}

export function resolveProductionWeek(
  dateStr: string,
  config: HrProductionCalendarDto,
): { periodKind: 'production' | 'calendar'; periodId: string; week: HrProductionWeekDto | null } {
  if (!config.isEnabled) {
    const weekId = calendarWeekId(dateStr);
    return { periodKind: 'calendar', periodId: weekId, week: null };
  }
  const startDate = productionWeekStart(dateStr, config.weekStartDay);
  const week = buildProductionWeek(startDate, config.fopWeekdays, parseDate(startDate).getUTCFullYear(), 0);
  return { periodKind: 'production', periodId: startDate, week };
}

export function isFopWeekday(dateStr: string, fopWeekdays: number[]): boolean {
  return fopWeekdays.includes(weekdayOf(dateStr));
}

export function datesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export interface FopAggregateEntry {
  date: string;
  kind: string;
  hours: number | null;
}

export interface FopAggregateLine {
  payGroup: string;
  rateKind: string;
  rate: number;
  normHours: number;
  grossAccrued: number;
  employerTotalCost: number;
  bonusAmount: number;
  esvAmount: number;
}

/**
 * Пропорційна частка employerTotalCost за дні з fopWeekdays у періоді.
 * База (зарплата + ЄСВ) — пропорція fopHours у періоді до всіх робочих годин місяця.
 * Премія додається повністю (без годинної пропорції).
 */
export function aggregateFopFromTimesheet(
  entries: FopAggregateEntry[],
  line: FopAggregateLine,
  fopWeekdays: number[],
  periodStart: string,
  periodEnd: string,
): { employerCost: number; includedDays: number; workHours: number; fopHours: number } {
  const periodDates = datesInRange(periodStart, periodEnd);
  const fopDates = new Set(periodDates.filter((date) => isFopWeekday(date, fopWeekdays)));

  let monthWorkHours = 0;
  let fopHours = 0;
  let includedDays = 0;

  for (const entry of entries) {
    if (entry.kind !== 'work') continue;
    const hours = entry.hours ?? 0;
    monthWorkHours += hours;

    if (entry.date < periodStart || entry.date > periodEnd) continue;
    if (fopDates.has(entry.date) && hours > 0) {
      fopHours += hours;
      includedDays += 1;
    }
  }

  if (monthWorkHours <= 0 || fopHours <= 0) {
    return { employerCost: 0, includedDays, workHours: monthWorkHours, fopHours };
  }

  const ratio = fopHours / monthWorkHours;
  const baseCost = line.employerTotalCost - line.bonusAmount;
  const bonusPart = line.bonusAmount;
  const employerCost = roundMoney(baseCost * ratio + bonusPart);

  return { employerCost, includedDays, workHours: monthWorkHours, fopHours };
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
