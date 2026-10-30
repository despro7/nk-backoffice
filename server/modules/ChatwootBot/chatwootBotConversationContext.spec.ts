import { describe, expect, it } from 'vitest';
import { CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER } from '../../../shared/types/chatwootBot.js';
import { buildConversationContextNote, buildLlmHistory } from './chatwootBotConversationContext.js';

describe('buildLlmHistory', () => {
  it('maps roles, skips private/activity/probe and the current message', () => {
    const history = buildLlmHistory(
      [
        { id: 3, message_type: 1, content: 'Вкажіть телефон і дату замовлення' },
        { id: 1, message_type: 0, content: 'Де моє замовлення?' },
        { id: 2, message_type: 2, content: 'Conversation assigned' },
        { id: 4, message_type: 1, private: true, content: 'нотатка оператора' },
        { id: 5, message_type: 0, content: CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER },
        { id: 6, message_type: 'incoming', content: '0978244639' },
        { id: 7, message_type: 0, content: '0978244639, 26.10.2026' },
        { id: 8, message_type: 1, content: 'відповідь після поточного' },
      ],
      7,
    );
    expect(history).toEqual([
      { role: 'user', content: 'Де моє замовлення?' },
      { role: 'assistant', content: 'Вкажіть телефон і дату замовлення' },
      { role: 'user', content: '0978244639' },
    ]);
  });

  it('merges consecutive roles, starts with user and respects limit', () => {
    const history = buildLlmHistory(
      [
        { id: 1, message_type: 1, content: 'Вітаю!' },
        { id: 2, message_type: 0, content: 'Привіт' },
        { id: 3, message_type: 0, content: 'є хтось?' },
        { id: 4, message_type: 1, content: 'Так' },
      ],
      null,
    );
    expect(history).toEqual([
      { role: 'user', content: 'Привіт\nє хтось?' },
      { role: 'assistant', content: 'Так' },
    ]);
    expect(buildLlmHistory([{ id: 1, message_type: 0, content: 'a' }, { id: 2, message_type: 0, content: 'b' }], null, 1))
      .toEqual([{ role: 'user', content: 'b' }]);
  });
});

describe('buildConversationContextNote', () => {
  it('includes Kyiv date and verification state', () => {
    const note = buildConversationContextNote({
      now: new Date('2026-10-30T10:05:00Z'),
      verifiedOrderCount: 0,
      verifyExpiresAt: null,
      channelPhoneKnown: true,
    });
    expect(note).toContain('пʼятниця');
    expect(note).toContain('30.10.2026, 12:05');
    expect(note).toContain('Верифікація: не пройдена');
    expect(note).toContain('Телефон уже відомий');
    expect(note).toContain('короткий статус');
  });

  it('describes active verification', () => {
    const note = buildConversationContextNote({
      now: new Date('2026-10-30T10:05:00Z'),
      verifiedOrderCount: 1,
      verifyExpiresAt: '2026-10-30T12:05:00Z',
      channelPhoneKnown: false,
    });
    expect(note).toContain('пройдена (замовлень: 1), діє до 30.10.2026 14:05');
  });

  it('marks platform-provided phone as trusted', () => {
    const note = buildConversationContextNote({
      now: new Date('2026-10-30T10:05:00Z'),
      verifiedOrderCount: 0,
      verifyExpiresAt: null,
      channelPhoneKnown: true,
      channelPhoneTrusted: true,
    });
    expect(note).toContain('підтверджено каналом');
  });
});
