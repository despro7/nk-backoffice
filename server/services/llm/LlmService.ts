import { logServer } from '../../lib/utils.js';
import {
  LlmServiceError,
  type LlmCompleteWithToolsRequest,
  type LlmCompletionRequest,
  type LlmCompletionResult,
  type LlmProvider,
} from '../../../shared/types/llm.js';
import { llmSettingsService } from './LlmSettingsService.js';
import { googleComplete, googleCompleteWithTools } from './providers/googleLlmProvider.js';
import { openaiComplete, openaiCompleteWithTools } from './providers/openaiLlmProvider.js';
import { formatGoogleGenAiError } from './googleLlmProviderError.js';

const MAX_TOOL_LOOP_ITERATIONS = 8;

export class LlmService {
  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const { provider, model, apiKey } = await this.resolveProvider(request);
    if (!apiKey) {
      throw new LlmServiceError(`Missing API key for ${provider}`, 'missing_api_key');
    }
    try {
      if (provider === 'google') {
        return await googleComplete(apiKey, model, request);
      }
      return await openaiComplete(apiKey, model, request);
    } catch (error) {
      logServer('[LlmService] complete failed', error);
      throw new LlmServiceError(this.formatProviderError(provider, error), 'provider_error');
    }
  }

  async completeWithTools(
    request: LlmCompleteWithToolsRequest,
    onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ): Promise<LlmCompletionResult> {
    const { provider, model, apiKey, maxOutputTokens } = await this.resolveProvider(request);
    if (!apiKey) {
      throw new LlmServiceError(`Missing API key for ${provider}`, 'missing_api_key');
    }

    let messages = [...request.messages];
    let lastResult: LlmCompletionResult | null = null;

    for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
      const iterationRequest: LlmCompleteWithToolsRequest = {
        ...request,
        messages,
        maxOutputTokens: request.maxOutputTokens ?? maxOutputTokens,
      };

      try {
        lastResult =
          provider === 'google'
            ? await googleCompleteWithTools(apiKey, model, iterationRequest)
            : await openaiCompleteWithTools(apiKey, model, iterationRequest);
      } catch (error) {
        logServer('[LlmService] completeWithTools failed', error);
        throw new LlmServiceError(this.formatProviderError(provider, error), 'provider_error');
      }

      if (lastResult.finishReason !== 'tool_calls' || lastResult.toolCalls.length === 0) {
        return lastResult;
      }

      messages.push({ role: 'assistant', content: lastResult.text || '' });

      for (const call of lastResult.toolCalls) {
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
      }
    }

    return (
      lastResult ?? {
        provider,
        model,
        text: '',
        toolCalls: [],
        finishReason: 'error',
      }
    );
  }

  private formatProviderError(provider: LlmProvider, error: unknown): string {
    if (provider === 'google') {
      return formatGoogleGenAiError(error);
    }
    return error instanceof Error ? error.message : 'LLM provider error';
  }

  private async resolveProvider(request: LlmCompletionRequest): Promise<{
    provider: LlmProvider;
    model: string;
    apiKey: string;
    maxOutputTokens: number;
  }> {
    const settings = await llmSettingsService.getSettings();
    const provider = request.provider ?? settings.defaultProvider;
    const model =
      request.model ??
      (provider === 'google' ? settings.googleDefaultModel : settings.openaiDefaultModel);
    const apiKey = provider === 'google' ? settings.googleApiKey : settings.openaiApiKey;
    return {
      provider,
      model,
      apiKey,
      maxOutputTokens: request.maxOutputTokens ?? settings.maxOutputTokens,
    };
  }
}

export const llmService = new LlmService();
