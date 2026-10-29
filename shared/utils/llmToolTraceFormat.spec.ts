import { describe, expect, it } from 'vitest';
import { formatLlmToolTraceSection } from './llmToolTraceFormat.js';

describe('formatLlmToolTraceSection', () => {
  it('renders args and result', () => {
    const text = formatLlmToolTraceSection([
      {
        step: 1,
        apiRound: 1,
        name: 'get_storefront_catalog',
        arguments: { query: 'горох', limit: 5 },
        result: { items: [{ name: 'Суп', stockTier: 'low' }] },
      },
    ]);
    expect(text).toContain('--- tools trace ---');
    expect(text).toContain('get_storefront_catalog');
    expect(text).toContain('"query": "горох"');
    expect(text).toContain('Суп');
  });
});
