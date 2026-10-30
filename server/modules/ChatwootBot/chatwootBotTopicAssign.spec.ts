import { describe, expect, it } from 'vitest';
import { assignQuestionsToTopics } from './chatwootBotTopicAssign.js';

describe('assignQuestionsToTopics', () => {
  const questions = [
    { key: 'delivery-1', text: 'Скільки коштує доставка?', count: 5 },
    { key: 'delivery-2', text: 'Яка вартість доставки до Львова?', count: 1 },
    { key: 'cancel-1', text: 'Хочу скасувати замовлення', count: 3 },
    { key: 'cancel-2', text: 'як скасувати замовлення', count: 1 },
    { key: 'meat-1', text: 'Мене цікавить щось без мʼяса', count: 2 },
    { key: 'phone', text: '0978244639', count: 4 },
  ];

  it('puts a new phrasing into the topic of its closest member', () => {
    const result = assignQuestionsToTopics(questions, [{ id: 7, memberKeys: ['delivery-1'] }], ['delivery-2']);
    expect(result.assigned).toEqual([expect.objectContaining({ key: 'delivery-2', topicId: 7 })]);
    expect(result.newTopics).toEqual([]);
  });

  it('respects manual members: a question similar to a moved one follows it', () => {
    // Менеджер переніс «без мʼяса» в окрему тему 9 — схоже питання йде туди, а не в 7.
    const result = assignQuestionsToTopics(
      [...questions, { key: 'meat-2', text: 'Є щось без мʼяса?', count: 1 }],
      [
        { id: 7, memberKeys: ['delivery-1'] },
        { id: 9, memberKeys: ['meat-1'] },
      ],
      ['meat-2'],
    );
    expect(result.assigned).toEqual([expect.objectContaining({ key: 'meat-2', topicId: 9 })]);
  });

  it('clusters leftovers into new topics labelled by the most frequent phrasing', () => {
    const result = assignQuestionsToTopics(questions, [{ id: 7, memberKeys: ['delivery-1', 'delivery-2'] }], [
      'cancel-1',
      'cancel-2',
      'meat-1',
    ]);
    expect(result.assigned).toEqual([]);
    expect(result.newTopics).toEqual([
      { label: 'Хочу скасувати замовлення', keys: ['cancel-1', 'cancel-2'] },
      { label: 'Мене цікавить щось без мʼяса', keys: ['meat-1'] },
    ]);
  });

  it('marks questions without meaningful words as noise', () => {
    const result = assignQuestionsToTopics(questions, [], ['phone']);
    expect(result.noise).toEqual(['phone']);
    expect(result.newTopics).toEqual([]);
  });
});
