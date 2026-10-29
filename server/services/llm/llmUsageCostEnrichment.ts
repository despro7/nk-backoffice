import { resolveGoogleLlmModelId } from '../../../shared/constants/googleLlmModelAliases.js';
import type { LlmProvider, LlmTokenUsage } from '../../../shared/types/llm.js';
import { estimateLlmUsageCostUsd } from '../../../shared/utils/llmUsageCostEstimate.js';
import { logServer } from '../../lib/utils.js';
import {
  llmGoogleOfficialPricingService,
  resolveGooglePricingRow,
} from './LlmGoogleOfficialPricingService.js';
import {
  llmOpenAiOfficialPricingService,
  resolveOpenAiPricingRow,
} from './LlmOpenAiOfficialPricingService.js';

/** OpenRouter: cost з API. OpenAI/Google: оцінка з офіційних прайсів, якщо cost ще немає. */
export async function enrichLlmTokenUsageCost(
  provider: LlmProvider,
  modelId: string,
  usage?: LlmTokenUsage,
): Promise<LlmTokenUsage | undefined> {
  if (!usage) return usage;
  if (usage.estimatedCostUsd != null && Number.isFinite(usage.estimatedCostUsd)) {
    return usage;
  }
  if (provider === 'openrouter') {
    return usage;
  }

  const resolvedModel =
    provider === 'google' ? resolveGoogleLlmModelId(modelId.trim()) : modelId.trim();

  let row: ReturnType<typeof resolveOpenAiPricingRow> = null;
  try {
    if (provider === 'openai') {
      const map = await llmOpenAiOfficialPricingService.loadStandardPricing();
      row = resolveOpenAiPricingRow(map, resolvedModel);
    } else if (provider === 'google') {
      const map = await llmGoogleOfficialPricingService.loadStandardPricing();
      row = resolveGooglePricingRow(map, resolvedModel);
    }
  } catch (error) {
    logServer('[llmUsageCostEnrichment] failed to load official pricing', error);
    return usage;
  }

  if (!row) return usage;

  const estimatedCostUsd = estimateLlmUsageCostUsd(usage, row);
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) {
    return usage;
  }

  return { ...usage, estimatedCostUsd };
}
