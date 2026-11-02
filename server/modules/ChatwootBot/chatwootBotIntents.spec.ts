import { describe, expect, it } from 'vitest';
import { buildIntentUserMessage, intentQuestionText, parseIntentResponse } from './chatwootBotIntents.js';

describe('intents', () => {
  it('parses a fenced JSON answer and drops unknown kinds and empty parts', () => {
    const parsed = parseIntentResponse(
      '```json\n{"items":[{"id":1,"parts":[{"kind":"question","text":"Чи можна дізнатися ціни?"},{"kind":"action","text":"Надіслати прайс"}]},{"id":2,"parts":[{"kind":"answer","text":"Замовлю пізніше"},{"kind":"other","text":"x"}]},{"id":3,"parts":[]}]}\n```',
    );
    expect(parsed.get(1)).toEqual([
      { kind: 'question', text: 'Чи можна дізнатися ціни?' },
      { kind: 'action', text: 'Надіслати прайс' },
    ]);
    expect(parsed.get(2)).toEqual([{ kind: 'answer', text: 'Замовлю пізніше' }]);
    expect(parsed.has(3)).toBe(false);
  });

  it('returns nothing for broken output', () => {
    expect(parseIntentResponse('не JSON').size).toBe(0);
  });

  it('passes context only when present and joins question parts', () => {
    expect(JSON.parse(buildIntentUserMessage([{ id: 1, text: 'А орієнтовно?', context: 'Доставка 1–3 дні' }, { id: 2, text: 'Привіт' }]))).toEqual({
      items: [
        { id: 1, text: 'А орієнтовно?', context: 'Доставка 1–3 дні' },
        { id: 2, text: 'Привіт' },
      ],
    });
    expect(intentQuestionText([{ kind: 'question', text: 'А?' }, { kind: 'action', text: 'Б' }, { kind: 'question', text: 'В?' }])).toBe('А? В?');
    expect(intentQuestionText([{ kind: 'answer', text: 'Так' }])).toBeNull();
  });
});
