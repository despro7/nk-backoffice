import type { LlmModelPriceHighlightSettings } from '../types/llm.js';

export const DEFAULT_LLM_MODEL_PRICE_HIGHLIGHT: LlmModelPriceHighlightSettings = {
  enabled: true,
  greenMaxUsdPerM: 5,
  yellowMaxUsdPerM: 10,
};

const PRICING_HINT_RE = /^\$([\d.]+)\/1M in · \$([\d.]+)\/1M out$/;

export function parseLlmPricingHint(hint: string): { inputUsdPerM: number; outputUsdPerM: number } | null {
  const trimmed = hint.trim();
  const match = PRICING_HINT_RE.exec(trimmed);
  if (!match) return null;
  const inputUsdPerM = Number(match[1]);
  const outputUsdPerM = Number(match[2]);
  if (!Number.isFinite(inputUsdPerM) || !Number.isFinite(outputUsdPerM)) return null;
  return { inputUsdPerM, outputUsdPerM };
}

export type LlmModelPriceTier = 'green' | 'yellow' | 'red' | 'neutral';

export function resolveLlmModelPriceTier(
  usdPerM: number,
  config: LlmModelPriceHighlightSettings,
): LlmModelPriceTier {
  if (!Number.isFinite(usdPerM) || usdPerM < 0) return 'neutral';
  const greenMax = config.greenMaxUsdPerM;
  const yellowMax = config.yellowMaxUsdPerM;
  if (usdPerM <= greenMax) return 'green';
  if (usdPerM <= yellowMax) return 'yellow';
  return 'red';
}

export function llmModelPriceTierTextClass(tier: LlmModelPriceTier): string {
  switch (tier) {
    case 'green':
      return 'text-success-600 dark:text-success-400';
    case 'yellow':
      return 'text-warning-600 dark:text-warning-400';
    case 'red':
      return 'text-danger-600 dark:text-danger-400';
    default:
      return 'text-default-400';
  }
}

export function mergeLlmModelPriceHighlightSettings(
  raw: Partial<LlmModelPriceHighlightSettings> | null | undefined,
): LlmModelPriceHighlightSettings {
  const base = DEFAULT_LLM_MODEL_PRICE_HIGHLIGHT;
  const enabled = raw?.enabled ?? base.enabled;
  let greenMax = Number(raw?.greenMaxUsdPerM ?? base.greenMaxUsdPerM);
  let yellowMax = Number(raw?.yellowMaxUsdPerM ?? base.yellowMaxUsdPerM);
  if (!Number.isFinite(greenMax) || greenMax < 0) greenMax = base.greenMaxUsdPerM;
  if (!Number.isFinite(yellowMax) || yellowMax < 0) yellowMax = base.yellowMaxUsdPerM;
  if (yellowMax < greenMax) {
    yellowMax = Math.max(greenMax, base.yellowMaxUsdPerM);
  }
  return {
    enabled: Boolean(enabled),
    greenMaxUsdPerM: greenMax,
    yellowMaxUsdPerM: yellowMax,
  };
}
