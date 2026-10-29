import type { LlmTokenUsage } from '../types/llm.js';

export type LlmUsagePriceRow = {
  inputUsdPerM: number;
  outputUsdPerM: number | null;
};

/** USD за usage за цінами USD / 1M tokens (офіційні docs). */
export function estimateLlmUsageCostUsd(
  usage: Pick<LlmTokenUsage, 'promptTokens' | 'completionTokens'>,
  row: LlmUsagePriceRow,
): number {
  const inCost = (usage.promptTokens / 1_000_000) * row.inputUsdPerM;
  const outCost =
    row.outputUsdPerM != null ? (usage.completionTokens / 1_000_000) * row.outputUsdPerM : 0;
  return inCost + outCost;
}

export function formatLlmUsdCost(usd: number, approximate = true): string {
  const abs = Math.abs(usd);
  let digits = 4;
  if (abs >= 0.01) digits = 3;
  else if (abs < 0.0001) digits = 6;
  const formatted = usd.toFixed(digits);
  return approximate ? `~$${formatted}` : `$${formatted}`;
}
