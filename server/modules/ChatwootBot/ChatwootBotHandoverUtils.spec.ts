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
  shouldPersistEvent,
} from './ChatwootBotHandoverUtils.js';

describe('ChatwootBotHandoverUtils', () => {
  it('extractCallbackPhone parses UA numbers', () => {
    expect(extractCallbackPhone('дзвоніть 050 123 45 67')).toMatch(/^\+38/);
    expect(extractCallbackPhone('+380501234567')).toBe('+380501234567');
    expect(extractCallbackPhone('+38 (097) 824-46-39')).toBe('+380978244639');
    expect(extractCallbackPhone('0978244639 100245')).toBe('+380978244639');
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

describe('shouldPersistEvent', () => {
  it('skips noisy ignored reasons by default', () => {
    expect(shouldPersistEvent('ignored', 'unsupported_event:conversation_updated')).toBe(false);
    expect(shouldPersistEvent('ignored', 'private_message')).toBe(false);
    expect(shouldPersistEvent('ignored', 'not_incoming')).toBe(false);
    expect(shouldPersistEvent('ignored', 'sender_not_contact:agent_bot')).toBe(false);
    expect(shouldPersistEvent('ignored', 'duplicate_message')).toBe(false);
  });

  it('persists noise when debug options enabled', () => {
    expect(
      shouldPersistEvent('ignored', 'private_message', { persistPrivate: true }),
    ).toBe(true);
    expect(
      shouldPersistEvent('ignored', 'not_incoming', { persistOtherNoise: true }),
    ).toBe(true);
    expect(
      shouldPersistEvent('ignored', 'unsupported_event:conversation_updated', {
        persistOtherNoise: true,
      }),
    ).toBe(true);
    expect(
      shouldPersistEvent('ignored', 'duplicate_message', { persistOtherNoise: true }),
    ).toBe(false);
  });

  it('persists bot_disabled, human_agent_active and handover', () => {
    expect(shouldPersistEvent('ignored', 'bot_disabled')).toBe(true);
    expect(shouldPersistEvent('ignored', 'human_agent_active')).toBe(true);
    expect(shouldPersistEvent('handover', 'ooh_offer')).toBe(true);
  });
});
