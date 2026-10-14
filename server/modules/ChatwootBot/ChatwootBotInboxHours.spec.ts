import { describe, expect, it } from 'vitest';
import type { ChatwootInboxSchedule } from '../../../shared/types/chatwootBot.js';
import { isWithinChatwootInboxSchedule } from './ChatwootBotInboxHours.js';

function baseSchedule(overrides: Partial<ChatwootInboxSchedule> = {}): ChatwootInboxSchedule {
  return {
    inboxId: 1,
    name: 'Test',
    workingHoursEnabled: true,
    timezone: 'Europe/Kyiv',
    workingHours: [
      {
        day_of_week: 1,
        closed_all_day: false,
        open_all_day: false,
        open_hour: 8,
        open_minutes: 0,
        close_hour: 17,
        close_minutes: 0,
      },
    ],
    ...overrides,
  };
}

describe('isWithinChatwootInboxSchedule', () => {
  it('returns true when working hours disabled', () => {
    const schedule = baseSchedule({ workingHoursEnabled: false });
    expect(isWithinChatwootInboxSchedule(schedule, new Date('2026-10-12T03:00:00.000Z'))).toBe(true);
  });

  it('returns false on closed day', () => {
    const schedule = baseSchedule({
      workingHours: [
        {
          day_of_week: 0,
          closed_all_day: true,
          open_all_day: false,
          open_hour: null,
          open_minutes: null,
          close_hour: null,
          close_minutes: null,
        },
      ],
    });
    expect(isWithinChatwootInboxSchedule(schedule, new Date('2026-10-11T10:00:00.000Z'))).toBe(false);
  });

  it('returns true during configured Monday hours', () => {
    const schedule = baseSchedule();
    expect(isWithinChatwootInboxSchedule(schedule, new Date('2026-10-12T10:00:00.000Z'))).toBe(true);
  });
});
