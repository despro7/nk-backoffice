import { describe, expect, it } from 'vitest';
import { clusterQuestions } from './chatwootBotQuestionClusters.js';

describe('clusterQuestions', () => {
  const samples = [
    { text: 'Скільки коштує доставка?', count: 5 },
    { text: 'скільки коштує доставка до Львова', count: 2 },
    { text: 'Яка вартість доставки?', count: 1 },
    { text: 'Де моє замовлення?', count: 4 },
    { text: 'де замовлення 24155', count: 2 },
    { text: 'Хочу скасувати замовлення', count: 3 },
    { text: 'як скасувати замовлення', count: 1 },
    { text: '0978244639', count: 6 },
    { text: 'Дякую!', count: 4 },
    { text: 'Вітаю, хочу зробити замовлення', count: 1 },
    { text: 'Мене цікавить щось без мʼяса', count: 1 },
    { text: 'Мене цікавлять білкові страви', count: 1 },
  ];
  const clusters = clusterQuestions(samples);
  const byLabel = (label: string) => clusters.find((c) => c.label === label);

  it('groups different phrasings of the same topic', () => {
    expect(byLabel('Скільки коштує доставка?')).toMatchObject({ count: 8 });
    expect(byLabel('Скільки коштує доставка?')?.examples).toContain('Яка вартість доставки?');
  });

  it('keeps distinct intents apart even when they share a common word', () => {
    expect(byLabel('Де моє замовлення?')).toMatchObject({ count: 6 });
    expect(byLabel('Хочу скасувати замовлення')).toMatchObject({ count: 4 });
    expect(byLabel('Вітаю, хочу зробити замовлення')).toMatchObject({ count: 1 });
  });

  it('does not merge topics on filler words like «мене цікавить»', () => {
    expect(byLabel('Мене цікавить щось без мʼяса')).toMatchObject({ count: 1 });
    expect(byLabel('Мене цікавлять білкові страви')).toMatchObject({ count: 1 });
  });

  it('drops phone-only and courtesy messages', () => {
    expect(clusters.some((c) => c.label === '0978244639' || c.label === 'Дякую!')).toBe(false);
  });

  it('orders clusters by total count and respects the limit', () => {
    expect(clusters[0].label).toBe('Скільки коштує доставка?');
    expect(clusterQuestions(samples, { maxClusters: 1 })).toHaveLength(1);
  });
});
