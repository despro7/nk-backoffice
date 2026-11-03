import { describe, expect, it } from 'vitest';
import { estimateLlmUsageCostUsd } from './llmUsageCostEstimate.js';

describe('estimateLlmUsageCostUsd', () => {
  it('computes in and out from per-million rates', () => {
    const cost = estimateLlmUsageCostUsd(
      { promptTokens: 1_000_000, completionTokens: 500_000 },
      { inputUsdPerM: 2, outputUsdPerM: 10 },
    );
    expect(cost).toBe(7);
  });
});
