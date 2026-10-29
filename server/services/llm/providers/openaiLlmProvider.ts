import OpenAI from 'openai';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmCompleteWithToolsRequest,
} from '../../../../shared/types/llm.js';
import { runOpenAiCompatibleChat } from '../openaiCompatibleChat.js';

export async function openaiComplete(
  apiKey: string,
  model: string,
  request: LlmCompletionRequest,
): Promise<LlmCompletionResult> {
  const client = new OpenAI({ apiKey });
  return runOpenAiCompatibleChat(client, 'openai', model, request);
}

export async function openaiCompleteWithTools(
  apiKey: string,
  model: string,
  request: LlmCompleteWithToolsRequest,
): Promise<LlmCompletionResult> {
  const client = new OpenAI({ apiKey });
  return runOpenAiCompatibleChat(client, 'openai', model, request, request.tools);
}
