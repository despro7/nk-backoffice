import OpenAI from 'openai';
import {
  getOpenRouterBaseUrl,
  getOpenRouterDefaultHeaders,
} from '../../../../shared/constants/openRouterConfig.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmCompleteWithToolsRequest,
} from '../../../../shared/types/llm.js';
import { runOpenAiCompatibleChat } from '../openaiCompatibleChat.js';

function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: getOpenRouterBaseUrl(),
    defaultHeaders: getOpenRouterDefaultHeaders(),
  });
}

export async function openRouterComplete(
  apiKey: string,
  model: string,
  request: LlmCompletionRequest,
): Promise<LlmCompletionResult> {
  const client = createOpenRouterClient(apiKey);
  return runOpenAiCompatibleChat(client, 'openrouter', model, request);
}

export async function openRouterCompleteWithTools(
  apiKey: string,
  model: string,
  request: LlmCompleteWithToolsRequest,
): Promise<LlmCompletionResult> {
  const client = createOpenRouterClient(apiKey);
  return runOpenAiCompatibleChat(client, 'openrouter', model, request, request.tools);
}
