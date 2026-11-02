import type { ChatwootInboxSchedule, ChatwootInboxWorkingHourSlot } from '../types/chatwootBot.js';

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Хвилина тижня (0 = неділя 00:00, як `day_of_week` у Chatwoot) у часовому поясі inbox. */
function weekMinute(date: Date, timeZone: string): number {
  const tz = timeZone.trim() === 'Europe/Kiev' ? 'Europe/Kyiv' : timeZone.trim() || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const day = WEEKDAY_INDEX[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return day * DAY_MINUTES + hour * 60 + minute;
}

/** Робочі інтервали тижня у хвилинах [start, end). */
function weekIntervals(slots: ChatwootInboxWorkingHourSlot[]): Array<[number, number]> {
  const intervals: Array<[number, number]> = [];
  for (const slot of slots) {
    const base = slot.day_of_week * DAY_MINUTES;
    if (slot.closed_all_day) continue;
    if (slot.open_all_day) {
      intervals.push([base, base + DAY_MINUTES]);
      continue;
    }
    const open = (slot.open_hour ?? 0) * 60 + (slot.open_minutes ?? 0);
    const close = (slot.close_hour ?? 0) * 60 + (slot.close_minutes ?? 0);
    if (close > open) intervals.push([base + open, base + close]);
  }
  return intervals;
}

function isOpenAt(intervals: Array<[number, number]>, minute: number): boolean {
  const m = ((minute % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  return intervals.some(([start, end]) => m >= start && m < end);
}

export type ChatwootScheduleState = {
  inHours: boolean;
  /** Хвилин до наступної зміни стану; null — стан не змінюється (цілодобово або завжди зачинено). */
  minutesToChange: number | null;
};

/** Чи зараз робочі години і скільки до початку / кінця зміни за розкладом inbox Chatwoot. */
export function chatwootScheduleState(schedule: ChatwootInboxSchedule, now = new Date()): ChatwootScheduleState {
  if (!schedule.workingHoursEnabled) return { inHours: true, minutesToChange: null };
  const intervals = weekIntervals(schedule.workingHours);
  let current: number;
  try {
    current = weekMinute(now, schedule.timezone);
  } catch {
    return { inHours: true, minutesToChange: null };
  }
  const inHours = isOpenAt(intervals, current);
  const boundaries = [...new Set(intervals.flatMap(([start, end]) => [start, end]))];
  let best: number | null = null;
  for (const boundary of boundaries) {
    const delta = (((boundary - current) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES || WEEK_MINUTES;
    if (isOpenAt(intervals, current + delta) !== inHours && (best == null || delta < best)) best = delta;
  }
  return { inHours, minutesToChange: best };
}

/** «2 год 15 хв», «45 хв», «1 д 3 год». */
export function formatScheduleDuration(minutes: number): string {
  const days = Math.floor(minutes / DAY_MINUTES);
  const hours = Math.floor((minutes % DAY_MINUTES) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} д ${hours} год` : `${days} д`;
  if (hours > 0) return mins > 0 ? `${hours} год ${mins} хв` : `${hours} год`;
  return `${mins} хв`;
}
