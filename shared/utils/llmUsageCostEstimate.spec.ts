import { describe, expect, it } from 'vitest';
import { estimateLlmUsageCostUsd, formatLlmUsdCost } from './llmUsageCostEstimate.js';

describe('estimateLlmUsageCostUsd', () => {
  it('computes in and out from per-million rates', () => {
    const cost = estimateLlmUsageCostUsd(
      { promptTokens: 1_000_000, completionTokens: 500_000 },
      { inputUsdPerM: 2, outputUsdPerM: 10 },
    );
    expect(cost).toBe(7);
  });
});

describe('formatLlmUsdCost', () => {
  it('marks approximate costs', () => {
    expect(formatLlmUsdCost(0.001234, true)).toBe('~$0.0012');
    expect(formatLlmUsdCost(0.05, false)).toBe('$0.050');
  });
});
