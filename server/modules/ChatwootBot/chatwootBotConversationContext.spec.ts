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
  const base = {
    now: new Date('2026-10-30T10:05:00Z'),
    verifiedOrderCount: 0,
    verifyExpiresAt: null,
    channelPhoneKnown: false,
  };

  it('renders current Kyiv date, weekday and time', () => {
    const note = buildConversationContextNote(base);
    expect(note).toContain('пʼятниця');
    expect(note).toContain('30.10.2026');
    expect(note).toContain('12:05');
  });

  it('reflects verification state and its Kyiv expiry time', () => {
    const unverified = buildConversationContextNote(base);
    const verified = buildConversationContextNote({
      ...base,
      verifiedOrderCount: 1,
      verifyExpiresAt: '2026-10-30T12:05:00Z',
    });
    expect(verified).not.toBe(unverified);
    expect(verified).toContain('14:05');
    expect(unverified).not.toContain('14:05');
  });

  it('distinguishes known, trusted and unknown channel phone', () => {
    const unknown = buildConversationContextNote(base);
    const known = buildConversationContextNote({ ...base, channelPhoneKnown: true });
    const trusted = buildConversationContextNote({ ...base, channelPhoneKnown: true, channelPhoneTrusted: true });
    expect(new Set([unknown, known, trusted]).size).toBe(3);
  });

  it('mentions business hours only when the state is known', () => {
    const open = buildConversationContextNote({ ...base, inBusinessHours: true });
    const closed = buildConversationContextNote({ ...base, inBusinessHours: false });
    const unknown = buildConversationContextNote(base);
    expect(new Set([open, closed, unknown]).size).toBe(3);
    expect(open.length).toBeGreaterThan(unknown.length);
    expect(closed.length).toBeGreaterThan(unknown.length);
  });

  it('names the product the client is looking at', () => {
    const note = buildConversationContextNote({
      ...base,
      page: { url: 'https://nk-food.shop/product/plov/', productName: 'Плов з курятиною', productSku: '03001' },
    });
    expect(note).toContain('Плов з курятиною');
    expect(note).toContain('03001');
  });

  it('falls back to the page url without a product', () => {
    const note = buildConversationContextNote({ ...base, page: { url: 'https://nk-food.shop/dostavka/' } });
    expect(note).toContain('https://nk-food.shop/dostavka/');
  });
});

describe('buildScenariosBlock', () => {
  it('lists enabled scenarios with triggers and skips disabled or empty ones', async () => {
    const { buildScenariosBlock } = await import('./chatwootBotConversationContext.js');
    const block = buildScenariosBlock([
      { id: 'a', title: 'Надіслати прайс', enabled: true, triggers: ['Надішліть прайс', ''], instructions: 'Дай посилання на каталог.' },
      { id: 'b', title: 'Вимкнений', enabled: false, triggers: [], instructions: 'x' },
      { id: 'c', title: 'Без кроків', enabled: true, triggers: [], instructions: '  ' },
    ]);
    expect(block).toContain('Надіслати прайс');
    expect(block).toContain('Надішліть прайс');
    expect(block).toContain('Дай посилання на каталог.');
    expect(block).not.toContain('Вимкнений');
    expect(block).not.toContain('Без кроків');
    expect(buildScenariosBlock([])).toBeNull();
  });
});
