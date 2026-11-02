import { describe, expect, it } from 'vitest';
import type { ChatwootInboxSchedule } from '../types/chatwootBot.js';
import { chatwootScheduleState, formatScheduleDuration } from './chatwootInboxScheduleNext.js';

/** Пн–Пт 09:00–18:00, вихідні зачинено, UTC. */
const schedule: ChatwootInboxSchedule = {
  inboxId: 1,
  name: 'Site',
  workingHoursEnabled: true,
  timezone: 'UTC',
  workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day_of_week: day,
    closed_all_day: day === 0 || day === 6,
    open_all_day: false,
    open_hour: 9,
    open_minutes: 0,
    close_hour: 18,
    close_minutes: 0,
  })),
};

describe('chatwootScheduleState', () => {
  it('counts down to the end of the shift', () => {
    // 2026-11-02 — понеділок.
    expect(chatwootScheduleState(schedule, new Date('2026-11-02T16:30:00Z'))).toEqual({
      inHours: true,
      minutesToChange: 90,
    });
  });

  it('counts down to the next opening, skipping the weekend', () => {
    expect(chatwootScheduleState(schedule, new Date('2026-11-02T20:00:00Z')).minutesToChange).toBe(13 * 60);
    // Пʼятниця 18:30 → понеділок 09:00.
    expect(chatwootScheduleState(schedule, new Date('2026-11-06T18:30:00Z')).minutesToChange).toBe(
      2 * 24 * 60 + 14 * 60 + 30,
    );
  });

  it('never changes when working hours are disabled', () => {
    expect(chatwootScheduleState({ ...schedule, workingHoursEnabled: false })).toEqual({
      inHours: true,
      minutesToChange: null,
    });
  });
});

describe('formatScheduleDuration', () => {
  it('formats minutes, hours and days', () => {
    expect(formatScheduleDuration(45)).toBe('45 хв');
    expect(formatScheduleDuration(135)).toBe('2 год 15 хв');
    expect(formatScheduleDuration(24 * 60 + 180)).toBe('1 д 3 год');
  });
});
