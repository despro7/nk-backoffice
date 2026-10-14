import type { ChatwootInboxSchedule, ChatwootInboxWorkingHourSlot } from '../../../shared/types/chatwootBot.js';

function getZonedParts(date: Date, timeZone: string): { weekdayChatwoot: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekdayChatwoot: weekdayMap[weekdayStr] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function slotForDay(
  schedule: ChatwootInboxSchedule,
  dayOfWeek: number,
): ChatwootInboxWorkingHourSlot | undefined {
  return schedule.workingHours.find((s) => s.day_of_week === dayOfWeek);
}

export function isWithinChatwootInboxSchedule(schedule: ChatwootInboxSchedule, now = new Date()): boolean {
  if (!schedule.workingHoursEnabled) return true;

  const tz = schedule.timezone.trim() || 'UTC';
  let zoned: { weekdayChatwoot: number; minutes: number };
  try {
    zoned = getZonedParts(now, tz);
  } catch {
    return true;
  }

  const slot = slotForDay(schedule, zoned.weekdayChatwoot);
  if (!slot || slot.closed_all_day) return false;
  if (slot.open_all_day) return true;

  const openH = slot.open_hour ?? 0;
  const openM = slot.open_minutes ?? 0;
  const closeH = slot.close_hour ?? 23;
  const closeM = slot.close_minutes ?? 59;
  const startMin = openH * 60 + openM;
  const endMin = closeH * 60 + closeM;
  const nowMin = zoned.minutes;

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  return nowMin >= startMin || nowMin < endMin;
}
