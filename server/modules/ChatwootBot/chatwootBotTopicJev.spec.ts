import { describe, expect, it } from 'vitest';
import { JEV_MAX_CHOICES } from '../../services/llm/typesafeJevClient.js';
import { JEV_NONE_CHOICE, buildJevTopicCriteria, jevChoiceKey, topicIdFromJevChoice } from './chatwootBotTopicJev.js';

describe('chatwootBotTopicJev', () => {
  it('describes a topic by title, description and distinct examples', () => {
    const criteria = buildJevTopicCriteria([
      {
        id: 3,
        title: 'Страви без мʼяса',
        description: 'Вегетаріанське меню',
        examples: ['Страви без мʼяса', 'Є щось без мʼяса?', 'Є щось без мʼяса?', 'Вегетаріанські страви'],
        weight: 2,
      },
    ]);
    expect(Object.keys(criteria).sort()).toEqual([JEV_NONE_CHOICE, 't3'].sort());
    const t3 = criteria.t3;
    expect(t3).toContain('Страви без мʼяса');
    expect(t3).toContain('Вегетаріанське меню');
    expect(t3).toContain('Вегетаріанські страви');
    expect(t3.split('Є щось без мʼяса?')).toHaveLength(2);
    expect(t3.split('Страви без мʼяса')).toHaveLength(2);
  });

  it('limits examples per topic', () => {
    const topic = { id: 1, title: 'Доставка', description: null, examples: ['Скільки доставка?', 'Ціна доставки'], weight: 1 };
    const one = buildJevTopicCriteria([topic], 1).t1;
    expect(one).toContain('Скільки доставка?');
    expect(one).not.toContain('Ціна доставки');
    expect(buildJevTopicCriteria([topic], 0).t1).toBe('Доставка');
  });

  it('keeps the heaviest topics within the API choice limit', () => {
    const topics = Array.from({ length: JEV_MAX_CHOICES + 10 }, (_, i) => ({
      id: i + 1,
      title: `Тема ${i + 1}`,
      description: null,
      examples: [],
      weight: i,
    }));
    const criteria = buildJevTopicCriteria(topics);
    expect(Object.keys(criteria)).toHaveLength(JEV_MAX_CHOICES);
    expect(criteria[jevChoiceKey(JEV_MAX_CHOICES + 10)]).toBeDefined();
    expect(criteria[jevChoiceKey(1)]).toBeUndefined();
  });

  it('maps choices back to topic ids', () => {
    expect(topicIdFromJevChoice('t42')).toBe(42);
    expect(topicIdFromJevChoice(JEV_NONE_CHOICE)).toBeNull();
    expect(topicIdFromJevChoice('tx')).toBeNull();
  });
});
