import { getLocalTimeZone, type CalendarDate, type DateValue } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';

/** Період звітів Chatwoot Bot (статистика, діалоги): пресети, межі ISO, обрізання датою першої події. */

function isCompleteCalendarDate(value: DateValue): boolean {
  const { year, month, day } = value;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year
    && probe.getMonth() === month - 1
    && probe.getDate() === day
  );
}

export function dateRangeToIsoBounds(range: DateRange | null): { from: string; to: string } | null {
  if (!range?.start || !range?.end) return null;
  if (!isCompleteCalendarDate(range.start) || !isCompleteCalendarDate(range.end)) {
    return null;
  }

  const tz = getLocalTimeZone();
  const fromDate = (range.start as CalendarDate).toDate(tz);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = (range.end as CalendarDate).toDate(tz);
  toDate.setHours(23, 59, 59, 999);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

export const DEFAULT_PRESET_KEY = 'last7Days';
export const CUSTOM_PRESET_KEY = 'custom';

/** Пресет обрізаємо знизу датою першої події: раніше статистики немає. */
export function clampRange(range: DateRange, min: DateValue | null): DateRange {
  if (!min) return range;
  return {
    start: range.start.compare(min) < 0 ? min : range.start,
    end: range.end.compare(min) < 0 ? min : range.end,
  };
}
