import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LLM_MODEL_PRICE_HIGHLIGHT,
  parseLlmPricingHint,
  resolveLlmModelPriceTier,
} from './llmModelPriceHighlight.js';

describe('llmModelPriceHighlight', () => {
  it('parses standard pricing hint', () => {
    expect(parseLlmPricingHint('$0.2/1M in · $1.25/1M out')).toEqual({
      inputUsdPerM: 0.2,
      outputUsdPerM: 1.25,
    });
  });

  it('resolves traffic-light tiers', () => {
    const cfg = DEFAULT_LLM_MODEL_PRICE_HIGHLIGHT;
    expect(resolveLlmModelPriceTier(5, cfg)).toBe('green');
    expect(resolveLlmModelPriceTier(5.01, cfg)).toBe('yellow');
    expect(resolveLlmModelPriceTier(10, cfg)).toBe('yellow');
    expect(resolveLlmModelPriceTier(10.01, cfg)).toBe('red');
  });
});
