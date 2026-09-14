/** Період для HR-модулів (премії, фонд оплати праці). */
export interface HrPeriodOption {
  id: string;
  kind: 'production' | 'calendar';
  label: string;
  startDate: string;
  endDate: string;
  /** Дні для розрахунку (виробничий календар); якщо є — лейбл будується на клієнті. */
  fopWeekdays?: number[];
}

/** Робочий тиждень (пн–пт) для HR-фільтрів премій, фонду оплати праці тощо. */
export interface HrWorkWeekPeriod extends HrPeriodOption {
  kind: 'calendar';
}

const MONTH_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'] as const;

export function addDaysYmd(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayUtc(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function mondayOfWeek(dateStr: string): string {
  const weekday = weekdayUtc(dateStr);
  const offset = weekday === 0 ? 6 : weekday - 1;
  return addDaysYmd(dateStr, -offset);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatHrWorkWeekLabel(startDate: string, endDate: string): string {
  const startDay = Number(startDate.slice(8, 10));
  const endDay = Number(endDate.slice(8, 10));
  const startMonth = MONTH_SHORT[Number(startDate.slice(5, 7)) - 1] ?? '';
  const endMonth = MONTH_SHORT[Number(endDate.slice(5, 7)) - 1] ?? '';
  if (startDate === endDate) return `${startDay} ${endMonth}`;
  if (startMonth === endMonth) return `${startDay}–${endDay} ${endMonth}`;
  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

/** Усі робочі тижні (пн–пт), що перетинають календарний місяць. */
export function listHrWorkWeeksForMonth(monthParam: string): HrWorkWeekPeriod[] {
  const [year, month] = monthParam.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

  const weeks: HrWorkWeekPeriod[] = [];
  let monday = mondayOfWeek(monthStart);

  while (monday <= monthEnd) {
    const friday = addDaysYmd(monday, 4);
    if (friday >= monthStart) {
      weeks.push({
        id: monday,
        kind: 'calendar',
        startDate: monday,
        endDate: friday,
        label: formatHrWorkWeekLabel(monday, friday),
      });
    }
    monday = addDaysYmd(monday, 7);
  }

  return weeks;
}

export function findHrWorkWeekContainingDate(
  weeks: HrWorkWeekPeriod[],
  dateStr: string,
): HrWorkWeekPeriod | null {
  const direct = weeks.find((week) => week.startDate <= dateStr && week.endDate >= dateStr);
  if (direct) return direct;
  const monday = mondayOfWeek(dateStr);
  return weeks.find((week) => week.startDate === monday) ?? null;
}

/** Порівняння діапазону дат (YYYY-MM-DD) з урахуванням maxDate. */
export function clampHrWorkWeekEndDate(endDate: string, maxDateStr: string): string {
  return endDate > maxDateStr ? maxDateStr : endDate;
}

export function hrWorkWeekDateRange(
  week: HrWorkWeekPeriod,
  maxDateStr: string,
): { startDate: string; endDate: string } {
  return {
    startDate: week.startDate,
    endDate: clampHrWorkWeekEndDate(week.endDate, maxDateStr),
  };
}

export function matchHrWorkWeekPresetKey(
  dateFrom: string | null,
  dateTo: string | null,
  weeks: HrWorkWeekPeriod[],
  maxDateStr: string,
): string | null {
  if (!dateFrom || !dateTo) return null;
  for (const week of weeks) {
    const candidate = hrWorkWeekDateRange(week, maxDateStr);
    if (candidate.startDate === dateFrom && candidate.endDate === dateTo) {
      return week.id;
    }
  }
  return 'custom';
}
