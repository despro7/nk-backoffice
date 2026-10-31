import { logServer } from '../../lib/utils.js';
import {
  LlmServiceError,
  type LlmCompleteWithToolsRequest,
  type LlmCompletionRequest,
  type LlmCompletionResult,
  type LlmProvider,
  type LlmTokenUsage,
  type LlmToolTraceEntry,
} from '../../../shared/types/llm.js';
import { llmSettingsService } from './LlmSettingsService.js';
import { googleComplete, googleCompleteWithTools } from './providers/googleLlmProvider.js';
import { openaiComplete, openaiCompleteWithTools } from './providers/openaiLlmProvider.js';
import {
  openRouterComplete,
  openRouterCompleteWithTools,
} from './providers/openRouterLlmProvider.js';
import { formatGoogleGenAiError } from './googleLlmProviderError.js';
import { formatOpenRouterError } from './openRouterProviderError.js';
import { resolveLlmApiKey, resolveLlmDefaultModel } from './llmPlatformResolve.js';
import { mergeLlmTokenUsage } from './llmTokenUsage.js';
import { enrichLlmTokenUsageCost } from './llmUsageCostEnrichment.js';
import { llmUsageLogService } from './LlmUsageLogService.js';

const MAX_TOOL_LOOP_ITERATIONS = 8;

function finalizeToolLoopResult(
  requestedModel: string,
  lastResult: LlmCompletionResult,
  accumulatedUsage: LlmTokenUsage | undefined,
  apiCallCount: number,
  toolsInvoked: Record<string, number>,
  providerRequestIds: string[],
  toolTrace?: LlmToolTraceEntry[],
): LlmCompletionResult {
  return {
    ...lastResult,
    requestedModel,
    usage: accumulatedUsage ?? lastResult.usage,
    apiCallCount,
    toolsInvoked: Object.keys(toolsInvoked).length > 0 ? toolsInvoked : undefined,
    toolTrace: toolTrace && toolTrace.length > 0 ? toolTrace : undefined,
    providerRequestIds: providerRequestIds.length > 0 ? providerRequestIds : undefined,
    providerRequestId: providerRequestIds.at(-1) ?? lastResult.providerRequestId,
  };
}

export class LlmService {
  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const { provider, model, apiKey } = await this.resolveProvider(request);
    if (!apiKey) {
      throw new LlmServiceError(`Missing API key for ${provider}`, 'missing_api_key');
    }
    try {
      const result = await this.dispatchComplete(provider, apiKey, model, request);
      const usage = await enrichLlmTokenUsageCost(provider, model, result.usage);
      this.logUsage(request, provider, model, usage, 1);
      return usage === result.usage ? result : { ...result, usage };
    } catch (error) {
      this.logUsage(request, provider, model, undefined, 1, error);
      logServer('[LlmService] complete failed', error);
      throw new LlmServiceError(this.formatProviderError(provider, error), 'provider_error');
    }
  }

  async completeWithTools(
    request: LlmCompleteWithToolsRequest,
    onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    options?: { captureToolTrace?: boolean },
  ): Promise<LlmCompletionResult> {
    const { provider, model, apiKey, maxOutputTokens } = await this.resolveProvider(request);
    if (!apiKey) {
      throw new LlmServiceError(`Missing API key for ${provider}`, 'missing_api_key');
    }

    let messages = [...request.messages];
    let lastResult: LlmCompletionResult | null = null;
    let accumulatedUsage: LlmTokenUsage | undefined;
    let toolsInvoked: Record<string, number> = {};
    const providerRequestIds: string[] = [];
    const toolTrace: LlmToolTraceEntry[] = [];
    let toolStep = 0;
    const captureToolTrace = Boolean(options?.captureToolTrace);

    for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
      const iterationRequest: LlmCompleteWithToolsRequest = {
        ...request,
        messages,
        maxOutputTokens: request.maxOutputTokens ?? maxOutputTokens,
      };

      try {
        lastResult = await this.dispatchCompleteWithTools(
          provider,
          apiKey,
          model,
          iterationRequest,
        );
        accumulatedUsage = mergeLlmTokenUsage(accumulatedUsage, lastResult.usage);
        if (lastResult.providerRequestId) {
          providerRequestIds.push(lastResult.providerRequestId);
        }
      } catch (error) {
        const usage = await enrichLlmTokenUsageCost(provider, model, accumulatedUsage);
        this.logUsage(request, provider, model, usage, i + 1, error);
        logServer('[LlmService] completeWithTools failed', error);
        throw new LlmServiceError(this.formatProviderError(provider, error), 'provider_error');
      }

      if (lastResult.finishReason !== 'tool_calls' || lastResult.toolCalls.length === 0) {
        const usage = await enrichLlmTokenUsageCost(provider, model, accumulatedUsage);
        this.logUsage(request, provider, model, usage, i + 1);
        return finalizeToolLoopResult(
          model,
          lastResult,
          usage,
          i + 1,
          toolsInvoked,
          providerRequestIds,
          captureToolTrace ? toolTrace : undefined,
        );
      }

      messages.push({
        role: 'assistant',
        content: lastResult.text || '',
        toolCalls: lastResult.toolCalls,
        googleModelParts: lastResult.googleModelParts,
      });

      for (const call of lastResult.toolCalls) {
        toolsInvoked[call.name] = (toolsInvoked[call.name] ?? 0) + 1;
        let resultPayload: unknown;
        try {
          resultPayload = await onToolCall(call.name, call.arguments);
        } catch (toolErr) {
          resultPayload = {
            error: toolErr instanceof Error ? toolErr.message : 'tool_failed',
          };
        }
        messages.push({
          role: 'tool',
          name: call.name,
          toolCallId: call.id,
          content: JSON.stringify(resultPayload),
        });
        if (captureToolTrace) {
          toolStep += 1;
          toolTrace.push({
            step: toolStep,
            apiRound: i + 1,
            name: call.name,
            arguments: call.arguments ?? {},
            result: resultPayload,
          });
        }
      }
    }

    if (!lastResult) {
      return {
        provider,
        model,
        requestedModel: model,
        text: '',
        toolCalls: [],
        finishReason: 'error',
        apiCallCount: 0,
      };
    }
    const usage = await enrichLlmTokenUsageCost(provider, model, accumulatedUsage);
    this.logUsage(request, provider, model, usage, MAX_TOOL_LOOP_ITERATIONS, 'tool loop limit');
    return finalizeToolLoopResult(
      model,
      { ...lastResult, finishReason: 'error' },
      usage,
      MAX_TOOL_LOOP_ITERATIONS,
      toolsInvoked,
      providerRequestIds,
      captureToolTrace ? toolTrace : undefined,
    );
  }

  private logUsage(
    request: LlmCompletionRequest,
    provider: LlmProvider,
    model: string,
    usage: LlmTokenUsage | undefined,
    apiCalls: number,
    error?: unknown,
  ): void {
    llmUsageLogService.record({
      provider,
      model,
      feature: request.feature,
      inputTokens: usage?.promptTokens,
      outputTokens: usage?.completionTokens,
      apiCalls,
      costUsd: usage?.estimatedCostUsd,
      error,
    });
  }

  private formatProviderError(provider: LlmProvider, error: unknown): string {
    if (provider === 'google') {
      return formatGoogleGenAiError(error);
    }
    if (provider === 'openrouter') {
      return formatOpenRouterError(error);
    }
    return error instanceof Error ? error.message : 'LLM provider error';
  }

  private async dispatchComplete(
    provider: LlmProvider,
    apiKey: string,
    model: string,
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResult> {
    switch (provider) {
      case 'google':
        return googleComplete(apiKey, model, request);
      case 'openrouter':
        return openRouterComplete(apiKey, model, request);
      default:
        return openaiComplete(apiKey, model, request);
    }
  }

  private async dispatchCompleteWithTools(
    provider: LlmProvider,
    apiKey: string,
    model: string,
    request: LlmCompleteWithToolsRequest,
  ): Promise<LlmCompletionResult> {
    switch (provider) {
      case 'google':
        return googleCompleteWithTools(apiKey, model, request);
      case 'openrouter':
        return openRouterCompleteWithTools(apiKey, model, request);
      default:
        return openaiCompleteWithTools(apiKey, model, request);
    }
  }

  private async resolveProvider(request: LlmCompletionRequest): Promise<{
    provider: LlmProvider;
    model: string;
    apiKey: string;
    maxOutputTokens: number;
  }> {
    const settings = await llmSettingsService.getSettings();
    const provider = request.provider ?? settings.defaultProvider;
    const model = request.model ?? resolveLlmDefaultModel(settings, provider);
    const apiKey = resolveLlmApiKey(settings, provider);
    return {
      provider,
      model,
      apiKey,
      maxOutputTokens: request.maxOutputTokens ?? settings.maxOutputTokens,
    };
  }
}

export const llmService = new LlmService();
