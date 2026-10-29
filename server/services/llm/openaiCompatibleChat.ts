import type OpenAI from 'openai';
import {
  buildOpenAiMaxOutputTokens,
  buildOpenAiReasoningEffortForTools,
  buildOpenAiTemperature,
  openAiUsesFixedDefaultTemperature,
} from './openaiCompletionParams.js';
import type {
  LlmCompleteWithToolsRequest,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
} from '../../../shared/types/llm.js';
import { usageFromOpenAiResponse } from './llmTokenUsage.js';

export function toOpenAiMessages(
  system: string | undefined,
  messages: LlmMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (system?.trim()) {
    out.push({ role: 'system', content: system });
  }
  for (const msg of messages) {
    if (msg.role === 'tool') {
      out.push({
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId ?? '',
      });
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: msg.content?.trim() ? msg.content : null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments ?? {}),
            },
          })),
        });
      } else {
        out.push({ role: 'assistant', content: msg.content });
      }
    } else {
      out.push({ role: msg.role === 'system' ? 'system' : 'user', content: msg.content });
    }
  }
  return out;
}

function parseToolCalls(choice: OpenAI.Chat.ChatCompletion.Choice): LlmToolCall[] {
  const toolCalls = choice.message.tool_calls;
  if (!toolCalls?.length) return [];
  const parsed: LlmToolCall[] = [];
  for (const tc of toolCalls) {
    if (tc.type !== 'function') continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      args = {};
    }
    parsed.push({ id: tc.id, name: tc.function.name, arguments: args });
  }
  return parsed;
}

export async function runOpenAiCompatibleChat(
  client: OpenAI,
  resultProvider: LlmProvider,
  model: string,
  request: LlmCompletionRequest,
  tools?: LlmCompleteWithToolsRequest['tools'],
): Promise<LlmCompletionResult> {
  const toolDefs =
    tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })) ?? undefined;

  const temperatureSent = openAiUsesFixedDefaultTemperature(model)
    ? null
    : (request.temperature ?? 0.4);

  const hasTools = Boolean(toolDefs?.length);
  const response = await client.chat.completions.create({
    model,
    messages: toOpenAiMessages(request.system, request.messages),
    ...buildOpenAiMaxOutputTokens(model, request.maxOutputTokens),
    ...buildOpenAiTemperature(model, request.temperature),
    ...buildOpenAiReasoningEffortForTools(model, hasTools),
    ...(hasTools ? { tools: toolDefs, tool_choice: 'auto' as const } : {}),
  });
  const choice = response.choices[0];
  const text = choice?.message?.content?.trim() ?? '';
  const toolCalls = choice ? parseToolCalls(choice) : [];
  const finishReason =
    choice?.finish_reason === 'tool_calls'
      ? 'tool_calls'
      : choice?.finish_reason === 'length'
        ? 'length'
        : 'stop';
  const usage = usageFromOpenAiResponse(
    response.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number },
  );
  return {
    provider: resultProvider,
    model,
    requestedModel: model,
    text,
    toolCalls,
    finishReason,
    usage,
    apiCallCount: 1,
    providerRequestId: response.id,
    temperature: temperatureSent,
    maxOutputTokens: request.maxOutputTokens,
  };
}
