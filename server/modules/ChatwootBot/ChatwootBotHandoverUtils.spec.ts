import { describe, expect, it } from 'vitest';
import {
  CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE,
  DEFAULT_CHATWOOT_BOT_SETTINGS,
} from '../../../shared/types/chatwootBot.js';
import {
  extractCallbackPhone,
  isConversationHandledByHuman,
  isWithinHandoverHours,
  matchesEmergency,
  resolveHandoverAssigneeId,
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

  it('resolveHandoverAssigneeId respects auto_inbox mode', () => {
    expect(
      resolveHandoverAssigneeId({
        ...DEFAULT_CHATWOOT_BOT_SETTINGS,
        handoverAssignMode: 'auto_inbox',
        handoverAssigneeId: 2,
      }),
    ).toBeNull();
    expect(
      resolveHandoverAssigneeId({
        ...DEFAULT_CHATWOOT_BOT_SETTINGS,
        handoverAssignMode: 'specific_agent',
        handoverAssigneeId: 2,
      }),
    ).toBe(2);
  });

  it('isConversationHandledByHuman detects human assignee and attr', () => {
    expect(
      isConversationHandledByHuman(
        {
          conversation: {
            id: 1,
            status: 'open',
            meta: { assignee: { id: 2, type: 'user' } },
          },
        },
        {},
      ),
    ).toBe(true);
    expect(
      isConversationHandledByHuman(
        {
          conversation: {
            id: 1,
            status: 'pending',
            meta: { assignee: { id: 1, type: 'agent_bot' } },
          },
        },
        {},
      ),
    ).toBe(false);
    expect(
      isConversationHandledByHuman(
        { conversation: { id: 1 } },
        { [CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE]: true },
      ),
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
