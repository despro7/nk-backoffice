import { describe, expect, it } from 'vitest';
import { indexKnowledgeDoc, knowledgeStems, searchKnowledgeIndex } from './chatwootBotKnowledgeSearch.js';

const docs = [
  {
    id: 1,
    title: 'Вартість і терміни доставки',
    questions: ['Скільки коштує доставка?', 'Коли привезуть замовлення?'],
    tags: ['доставка', 'нова пошта'],
    answer: 'Доставка Новою Поштою 1–3 дні, безкоштовно від 1500 грн.',
  },
  {
    id: 2,
    title: 'Оплата',
    questions: ['Як оплатити замовлення?', 'Чи можна накладеним платежем?'],
    tags: ['оплата', 'карта'],
    answer: 'Оплата карткою на сайті або накладений платіж.',
  },
  {
    id: 3,
    title: 'Зберігання',
    questions: ['Як зберігати готові страви?'],
    tags: ['зберігання'],
    answer: 'У морозильній камері до 6 місяців.',
  },
];
const index = docs.map(indexKnowledgeDoc);

describe('knowledgeStems', () => {
  const stems = (text: string) => [...knowledgeStems(text)].sort();

  it('ignores greetings and stop words', () => {
    expect(stems('Добрий день, скільки коштує доставка?')).toEqual(stems('коштує доставка'));
    expect(stems('Добрий день')).toEqual([]);
  });

  it('maps synonyms and word forms to the same stems', () => {
    expect(stems('Скільки коштує доставка?')).toEqual(stems('Яка вартість доставки?'));
  });

  it('keeps numbers such as order ids', () => {
    expect(stems('замовлення 24155')).toContain('24155');
  });

  it('maps Russian and Ukrainian forms to the same stems', () => {
    expect(stems('Для ЗСУ есть скидка?')).toEqual(stems('Яка знижка для військових?'));
    expect(stems('Отменить заказ')).toEqual(stems('Скасувати замовлення'));
  });
});

describe('searchKnowledgeIndex', () => {
  it('matches different word forms', () => {
    expect(searchKnowledgeIndex(index, 'яка ціна доставки до Львова')[0]?.doc.id).toBe(1);
    expect(searchKnowledgeIndex(index, 'можу оплатити при отриманні?')[0]?.doc.id).toBe(2);
  });

  it('ranks the best match first and respects the limit', () => {
    const result = searchKnowledgeIndex(index, 'доставка і оплата', 1);
    expect(result).toHaveLength(1);
  });

  it('returns nothing for unrelated or empty queries', () => {
    expect(searchKnowledgeIndex(index, 'хто виграв футбол')).toEqual([]);
    expect(searchKnowledgeIndex(index, 'привіт')).toEqual([]);
  });

  it('does not match on generic order words alone', () => {
    expect(searchKnowledgeIndex(index, 'Вітаю, де моє замовлення?')).toEqual([]);
    expect(searchKnowledgeIndex(index, 'Добрий день. Хочу замовити на пробу')).toEqual([]);
  });

  it('matches a Russian question to a Ukrainian article', () => {
    expect(searchKnowledgeIndex(index, 'Сколько стоит доставка?')[0]?.doc.id).toBe(1);
  });

  it('does not match on answer words alone', () => {
    expect(searchKnowledgeIndex(index, 'морозильна')).toEqual([]);
  });
});
