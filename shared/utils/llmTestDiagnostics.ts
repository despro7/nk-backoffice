import type { LlmCompletionResult, LlmTestModelResponse } from '../types/llm.js';
import { buildLlmTestWarnings } from './llmTestWarnings.js';

export function completionToTestDiagnostics(
  requestedModel: string,
  result: LlmCompletionResult,
  latencyMs: number,
  extra?: Partial<Omit<LlmTestModelResponse, 'reply'>>,
): Omit<LlmTestModelResponse, 'reply'> {
  const warnings = [
    ...buildLlmTestWarnings({
      finishReason: result.finishReason,
      apiCallCount: result.apiCallCount,
    }),
    ...(extra?.warnings ?? []),
  ];

  return {
    provider: result.provider,
    model: result.model,
    requestedModel: result.requestedModel ?? requestedModel,
    finishReason: result.finishReason,
    latencyMs,
    usage: result.usage,
    apiCallCount: result.apiCallCount,
    providerRequestId: result.providerRequestId,
    providerRequestIds: result.providerRequestIds,
    temperature: result.temperature,
    maxOutputTokens: result.maxOutputTokens,
    toolsInvoked: result.toolsInvoked,
    toolTrace: result.toolTrace,
    ...extra,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
