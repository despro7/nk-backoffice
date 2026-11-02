import { describe, expect, it } from 'vitest';
import { buildQuestionContexts, type ContextSourceRow } from './chatwootBotQuestionContext.js';

const at = (min: number) => new Date(Date.UTC(2026, 10, 2, 10, min));
const row = (kind: string, conversationId: number, text: string, min: number, meta: unknown = null): ContextSourceRow => ({
  kind,
  conversationId,
  contentNorm: kind === 'customer_message' ? text.toLowerCase() : null,
  contentPreview: text,
  createdAt: at(min),
  meta,
});

describe('buildQuestionContexts', () => {
  it('links a follow-up to the bot reply before it', () => {
    const contexts = buildQuestionContexts([
      row('customer_message', 1, 'Скільки йде доставка?', 0),
      row('bot_action', 1, 'Зазвичай 1–3 дні Новою Поштою.', 1, { kind: 'reply' }),
      row('customer_message', 1, 'А орієнтовно?', 2),
    ]);
    expect(contexts.get('а орієнтовно?')).toEqual({ by: 'bot', text: 'Зазвичай 1–3 дні Новою Поштою.' });
    expect(contexts.has('скільки йде доставка?')).toBe(false);
  });

  it('falls back to the previous client message and ignores other conversations and kb lookups', () => {
    const contexts = buildQuestionContexts([
      row('customer_message', 1, 'Хочу замовити борщ', 0),
      row('bot_action', 1, 'борщ', 1, { kind: 'kb_lookup' }),
      row('customer_message', 2, 'Привіт', 1),
      row('customer_message', 1, 'Замовлю пізніше', 2),
    ]);
    expect(contexts.get('замовлю пізніше')).toEqual({ by: 'client', text: 'Хочу замовити борщ' });
  });

  it('drops context older than three hours', () => {
    const contexts = buildQuestionContexts([
      row('agent_message', 1, 'Чим допомогти?', 0),
      { ...row('customer_message', 1, 'А ще?', 0), createdAt: new Date(at(0).getTime() + 4 * 60 * 60 * 1000) },
    ]);
    expect(contexts.has('а ще?')).toBe(false);
  });
});
