import { describe, expect, it } from 'vitest';
import {
  isRepeatedReply,
  lastAssistantMessage,
  shouldEscalateAfterFailedVerify,
} from './chatwootBotLoopGuard.js';

describe('isRepeatedReply', () => {
  // Пара відповідей бота з реального зациклення в чаті.
  const first =
    'Щоб перевірити статус, надішліть номер телефону та номер замовлення або номер телефону й дату останнього замовлення.';
  const second =
    'Щоб перевірити статус, надішліть, будь ласка, номер телефону та номер замовлення або номер телефону й дату останнього замовлення.';

  it('detects the same request rephrased slightly', () => {
    expect(isRepeatedReply(second, first)).toBe(true);
    expect(isRepeatedReply(first, first)).toBe(true);
  });

  it('ignores different answers and short replies', () => {
    expect(isRepeatedReply('Ваше замовлення вже в дорозі, ТТН надіслали в SMS.', first)).toBe(false);
    expect(isRepeatedReply('Дякую!', 'Дякую!!')).toBe(true);
    expect(isRepeatedReply('Так', 'Ні')).toBe(false);
    expect(isRepeatedReply(first, null)).toBe(false);
  });
});

describe('lastAssistantMessage', () => {
  it('returns the latest bot or operator reply', () => {
    expect(
      lastAssistantMessage([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]),
    ).toBe('b');
    expect(lastAssistantMessage([{ role: 'user', content: 'a' }])).toBeNull();
  });
});

describe('shouldEscalateAfterFailedVerify', () => {
  it('escalates only when this message failed and threshold is reached', () => {
    expect(shouldEscalateAfterFailedVerify(3, true)).toBe(true);
    expect(shouldEscalateAfterFailedVerify(2, true)).toBe(false);
    expect(shouldEscalateAfterFailedVerify(5, false)).toBe(false);
  });
});
