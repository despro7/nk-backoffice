import { describe, expect, it } from 'vitest';
import { matchAutoReplyRule } from './ChatwootBotPatternMatcher.js';

describe('ChatwootBotPatternMatcher', () => {
  it('matches substring by priority', () => {
    const match = matchAutoReplyRule('доставка сьогодні?', [
      {
        id: 'b',
        enabled: true,
        priority: 20,
        matchType: 'substring',
        pattern: 'оплата',
        reply: 'b',
        caseInsensitive: true,
      },
      {
        id: 'a',
        enabled: true,
        priority: 10,
        matchType: 'substring',
        pattern: 'доставк',
        reply: 'a',
        caseInsensitive: true,
      },
    ]);
    expect(match?.ruleId).toBe('a');
    expect(match?.reply).toBe('a');
  });
});
