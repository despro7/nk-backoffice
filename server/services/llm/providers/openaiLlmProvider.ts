import OpenAI from 'openai';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmCompleteWithToolsRequest,
  LlmMessage,
  LlmToolCall,
} from '../../../../shared/types/llm.js';

function toOpenAiMessages(system: string | undefined, messages: LlmMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
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
      out.push({ role: 'assistant', content: msg.content });
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

export async function openaiComplete(
  apiKey: string,
  model: string,
  request: LlmCompletionRequest,
): Promise<LlmCompletionResult> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model,
    messages: toOpenAiMessages(request.system, request.messages),
    max_tokens: request.maxOutputTokens,
    temperature: request.temperature ?? 0.4,
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
  return { provider: 'openai', model, text, toolCalls, finishReason };
}

export async function openaiCompleteWithTools(
  apiKey: string,
  model: string,
  request: LlmCompleteWithToolsRequest,
): Promise<LlmCompletionResult> {
  const client = new OpenAI({ apiKey });
  const tools = request.tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
  const response = await client.chat.completions.create({
    model,
    messages: toOpenAiMessages(request.system, request.messages),
    max_tokens: request.maxOutputTokens,
    temperature: request.temperature ?? 0.4,
    tools,
    tool_choice: 'auto',
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
  return { provider: 'openai', model, text, toolCalls, finishReason };
}
