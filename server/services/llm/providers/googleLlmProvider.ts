import { GoogleGenAI, Type } from '@google/genai';
import { resolveGoogleLlmModelId } from '../../../../shared/constants/googleLlmModelAliases.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmCompleteWithToolsRequest,
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from '../../../../shared/types/llm.js';

function toGeminiContents(messages: LlmMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: msg.content }] });
  }
  return contents;
}

function buildGeminiTools(tools: LlmToolDefinition[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: Type.OBJECT,
          properties: Object.fromEntries(
            Object.entries(t.parameters.properties).map(([key, val]) => [
              key,
              { type: val.type === 'number' ? Type.NUMBER : Type.STRING, description: val.description },
            ]),
          ),
          required: t.parameters.required ?? [],
        },
      })),
    },
  ];
}

function parseGeminiToolCalls(response: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> }): LlmToolCall[] {
  const calls = response.functionCalls ?? [];
  return calls.map((fc, idx) => ({
    id: fc.id ?? `call_${idx}`,
    name: fc.name ?? '',
    arguments: fc.args ?? {},
  }));
}

export async function googleComplete(
  apiKey: string,
  model: string,
  request: LlmCompletionRequest,
): Promise<LlmCompletionResult> {
  const resolvedModel = resolveGoogleLlmModelId(model);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: resolvedModel,
    contents: toGeminiContents(request.messages),
    config: {
      systemInstruction: request.system,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.4,
    },
  });
  const text = response.text?.trim() ?? '';
  return { provider: 'google', model: resolvedModel, text, toolCalls: [], finishReason: 'stop' };
}

export async function googleCompleteWithTools(
  apiKey: string,
  model: string,
  request: LlmCompleteWithToolsRequest,
): Promise<LlmCompletionResult> {
  const resolvedModel = resolveGoogleLlmModelId(model);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: resolvedModel,
    contents: toGeminiContents(request.messages),
    config: {
      systemInstruction: request.system,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.4,
      tools: buildGeminiTools(request.tools),
    },
  });
  const text = response.text?.trim() ?? '';
  const toolCalls = parseGeminiToolCalls(response);
  const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
  return { provider: 'google', model: resolvedModel, text, toolCalls, finishReason };
}
