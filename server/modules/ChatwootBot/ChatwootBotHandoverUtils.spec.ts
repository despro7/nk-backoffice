import { describe, expect, it } from 'vitest';
import { DEFAULT_CHATWOOT_BOT_SETTINGS } from '../../../shared/types/chatwootBot.js';
import {
  extractCallbackPhone,
  isWithinHandoverHours,
  matchesEmergency,
} from './ChatwootBotHandoverUtils.js';

describe('ChatwootBotHandoverUtils', () => {
  it('extractCallbackPhone parses UA numbers', () => {
    expect(extractCallbackPhone('дзвоніть 050 123 45 67')).toMatch(/^\+38/);
    expect(extractCallbackPhone('+380501234567')).toBe('+380501234567');
  });

  it('matchesEmergency respects enabled flag', () => {
    const settings = {
      ...DEFAULT_CHATWOOT_BOT_SETTINGS,
      handoverEmergencyEnabled: false,
    };
    expect(matchesEmergency('терміново', settings)).toBe(false);
    expect(
      matchesEmergency('терміново', {
        ...settings,
        handoverEmergencyEnabled: true,
      }),
    ).toBe(true);
  });

  it('isWithinHandoverHours respects work days', () => {
    const settings = {
      ...DEFAULT_CHATWOOT_BOT_SETTINGS,
      handoverTimezone: 'Europe/Kyiv',
      handoverWorkDays: [1],
      handoverWorkStart: '09:00',
      handoverWorkEnd: '18:00',
    };
    const mondayNoon = new Date('2026-10-12T09:00:00.000Z');
    const sundayNoon = new Date('2026-10-11T09:00:00.000Z');
    expect(isWithinHandoverHours(settings, mondayNoon)).toBe(true);
    expect(isWithinHandoverHours(settings, sundayNoon)).toBe(false);
  });
});
