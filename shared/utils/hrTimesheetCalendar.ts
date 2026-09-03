import type { HrTimesheetDayDto, HrTimesheetWeekDto } from '../types/hr.js';

const WEEKDAY_LABELS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;
const MONTH_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

export const HR_STANDARD_DAY_HOURS = 8;

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateOnlyUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return utcDate(year, month + 1, 0).getUTCDate();
}

export function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function parseYearMonth(raw: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (!raw || !raw.trim()) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) {
    throw new Error('Некоректний місяць (очікується YYYY-MM)');
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw new Error('Некоректний місяць');
  }
  return { year, month };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildTimesheetMonthMeta(year: number, month: number): {
  days: HrTimesheetDayDto[];
  weeks: HrTimesheetWeekDto[];
  normWorkDays: number;
  normHours: string;
} {
  const total = daysInMonth(year, month);
  const days: HrTimesheetDayDto[] = [];
  let normWorkDays = 0;

  for (let day = 1; day <= total; day += 1) {
    const date = utcDate(year, month, day);
    const weekday = date.getUTCDay();
    const weekend = isWeekendUtc(date);
    if (!weekend) normWorkDays += 1;
    const mondayOffset = (weekday + 6) % 7;
    const monday = utcDate(year, month, day - mondayOffset);
    days.push({
      date: toDateOnlyUtc(date),
      day,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      isWeekend: weekend,
      weekId: toDateOnlyUtc(monday),
    });
  }

  const weeks: HrTimesheetWeekDto[] = [];
  for (const item of days) {
    const last = weeks[weeks.length - 1];
    if (last && last.id === item.weekId) {
      last.colSpan += 1;
      last.endDate = item.date;
      continue;
    }
    weeks.push({
      id: item.weekId,
      label: '',
      startDate: item.date,
      endDate: item.date,
      colSpan: 1,
    });
  }

  for (const week of weeks) {
    week.label = formatWeekWindowLabel(week.startDate, week.endDate, month);
  }

  const normHours = (normWorkDays * HR_STANDARD_DAY_HOURS).toFixed(2);
  return { days, weeks, normWorkDays, normHours };
}

function formatWeekWindowLabel(startDate: string, endDate: string, month: number): string {
  const startDay = Number(startDate.slice(8, 10));
  const endDay = Number(endDate.slice(8, 10));
  const startMonth = Number(startDate.slice(5, 7));
  const suffix = MONTH_SHORT[month - 1] ?? '';
  if (startDate === endDate) {
    return `${startDay} ${suffix}`;
  }
  if (startMonth === month) {
    return `${startDay}–${endDay} ${suffix}`;
  }
  return `${startDay}–${endDay} ${suffix}`;
}
