import { describe, expect, it } from 'vitest';
import { DEFAULT_CHATWOOT_BOT_SETTINGS, operatorHandoverMessage } from './chatwootBot.js';

describe('operatorHandoverMessage', () => {
  const s = DEFAULT_CHATWOOT_BOT_SETTINGS;

  it('picks the text by request kind and working hours', () => {
    expect(operatorHandoverMessage(s, 'action', true)).toBe(s.handoverMessageActionInHours);
    expect(operatorHandoverMessage(s, 'action', false)).toBe(s.handoverMessageActionOutOfHours);
    expect(operatorHandoverMessage(s, 'no_answer', true)).toBe(s.handoverMessageNoAnswerInHours);
    expect(operatorHandoverMessage(s, 'no_answer', false)).toBe(s.handoverMessageNoAnswerOutOfHours);
    expect(operatorHandoverMessage(s, 'human', true)).toBe(s.handoverMessageInHours);
    expect(operatorHandoverMessage(s, 'human', false)).toBe(s.handoverMessageOutOfHours);
  });
});
