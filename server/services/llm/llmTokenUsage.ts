import type { LlmTokenUsage } from '../../../shared/types/llm.js';

export function mergeLlmTokenUsage(
  acc: LlmTokenUsage | undefined,
  next: LlmTokenUsage | undefined,
): LlmTokenUsage | undefined {
  if (!next) return acc;
  if (!acc) return { ...next };
  const estimatedCostUsd =
    acc.estimatedCostUsd != null || next.estimatedCostUsd != null
      ? (acc.estimatedCostUsd ?? 0) + (next.estimatedCostUsd ?? 0)
      : undefined;
  return {
    promptTokens: acc.promptTokens + next.promptTokens,
    completionTokens: acc.completionTokens + next.completionTokens,
    totalTokens: acc.totalTokens + next.totalTokens,
    estimatedCostUsd,
  };
}

type OpenAiLikeUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

export function usageFromOpenAiResponse(usage: OpenAiLikeUsage | undefined | null): LlmTokenUsage | undefined {
  if (!usage) return undefined;
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return undefined;
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: typeof usage.cost === 'number' ? usage.cost : undefined,
  };
}

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

export function usageFromGeminiResponse(
  usageMetadata: GeminiUsageMetadata | undefined | null,
): LlmTokenUsage | undefined {
  if (!usageMetadata) return undefined;
  const promptTokens = usageMetadata.promptTokenCount ?? 0;
  const completionTokens = usageMetadata.candidatesTokenCount ?? 0;
  const totalTokens = usageMetadata.totalTokenCount ?? promptTokens + completionTokens;
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}
