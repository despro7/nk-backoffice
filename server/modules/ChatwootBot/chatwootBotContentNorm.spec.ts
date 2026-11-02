import { describe, expect, it } from 'vitest';
import { displayQuestionText, stripLeadingGreeting } from './chatwootBotContentNorm.js';

describe('stripLeadingGreeting', () => {
  it('removes greetings at the start and capitalizes the rest', () => {
    expect(stripLeadingGreeting('Доброго вечора,попрошу відмінити замовлення 26020')).toBe('Попрошу відмінити замовлення 26020');
    expect(stripLeadingGreeting('Вітаю! Яка знижка для військових?')).toBe('Яка знижка для військових?');
    expect(stripLeadingGreeting('Добрий день. Хочу дізнатися на якій стадії моє замовлення')).toBe(
      'Хочу дізнатися на якій стадії моє замовлення',
    );
    expect(stripLeadingGreeting('Здравствуйте, есть скидки?')).toBe('Есть скидки?');
    expect(stripLeadingGreeting('Доброго дня. Вітаю, де моє замовлення?')).toBe('Де моє замовлення?');
  });

  it('keeps messages without greetings and does not cut words that start like one', () => {
    expect(stripLeadingGreeting('Де моє замовлення?')).toBe('Де моє замовлення?');
    expect(stripLeadingGreeting('Добрива у вас є?')).toBe('Добрива у вас є?');
    expect(stripLeadingGreeting('Привітний у вас сервіс')).toBe('Привітний у вас сервіс');
  });

  it('returns empty for greeting-only messages; display falls back to the original', () => {
    expect(stripLeadingGreeting('Доброго дня!')).toBe('');
    expect(displayQuestionText('Доброго дня!')).toBe('Доброго дня!');
  });
});
