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
import { usageFromGeminiResponse } from '../llmTokenUsage.js';

type GeminiContentPart =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | {
      functionCall: { name: string; args: Record<string, unknown> };
      thoughtSignature?: string;
    }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

function extractGoogleModelParts(response: unknown): unknown[] | undefined {
  const parts = (response as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates?.[0]
    ?.content?.parts;
  if (!parts?.length) return undefined;
  return structuredClone(parts);
}

function readPartThoughtSignature(part: Record<string, unknown>): string | undefined {
  if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
    return part.thoughtSignature;
  }
  if (typeof part.thought_signature === 'string' && part.thought_signature.trim()) {
    return part.thought_signature;
  }
  return undefined;
}

export function toGeminiContentsForTest(
  messages: LlmMessage[],
): Array<{ role: string; parts: GeminiContentPart[] }> {
  return toGeminiContents(messages);
}

/** Gemini FunctionResponse.response must be a JSON object (Struct), not a top-level array. */
export function normalizeGeminiFunctionResponsePayload(parsed: unknown): Record<string, unknown> {
  if (parsed === null || parsed === undefined) {
    return { result: null };
  }
  if (Array.isArray(parsed)) {
    return { items: parsed };
  }
  if (typeof parsed === 'object') {
    return parsed as Record<string, unknown>;
  }
  return { result: parsed };
}

function toGeminiContents(
  messages: LlmMessage[],
): Array<{ role: string; parts: GeminiContentPart[] }> {
  const contents: Array<{ role: string; parts: GeminiContentPart[] }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.content) as unknown;
      } catch {
        parsed = msg.content;
      }
      const response = normalizeGeminiFunctionResponsePayload(parsed);
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name ?? 'tool',
              response,
            },
          },
        ],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.googleModelParts && msg.googleModelParts.length > 0) {
        contents.push({
          role: 'model',
          parts: msg.googleModelParts as GeminiContentPart[],
        });
        continue;
      }

      const parts: GeminiContentPart[] = [];
      if (msg.content?.trim()) {
        parts.push({ text: msg.content });
      }
      for (const tc of msg.toolCalls ?? []) {
        const part: GeminiContentPart = {
          functionCall: { name: tc.name, args: tc.arguments ?? {} },
        };
        if (tc.googleThoughtSignature) {
          (part as { thoughtSignature?: string }).thoughtSignature = tc.googleThoughtSignature;
        }
        parts.push(part);
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
      continue;
    }

    contents.push({ role: 'user', parts: [{ text: msg.content }] });
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

function parseGeminiToolCalls(response: unknown): LlmToolCall[] {
  const r = response as {
    functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>;
    candidates?: Array<{ content?: { parts?: unknown[] } }>;
  };
  const fromParts: LlmToolCall[] = [];
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx] as Record<string, unknown>;
    const fc = part.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
    if (!fc?.name) continue;
    fromParts.push({
      id: `call_${idx}`,
      name: fc.name,
      arguments: (fc.args ?? {}) as Record<string, unknown>,
      googleThoughtSignature: readPartThoughtSignature(part),
    });
  }
  if (fromParts.length > 0) {
    return fromParts;
  }

  const calls = r.functionCalls ?? [];
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
  const usage = usageFromGeminiResponse(
    (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } })
      .usageMetadata,
  );
  const temperatureSent = request.temperature ?? 0.4;
  return {
    provider: 'google',
    model: resolvedModel,
    requestedModel: model,
    text,
    toolCalls: [],
    finishReason: 'stop',
    usage,
    apiCallCount: 1,
    providerRequestId: (response as { responseId?: string }).responseId,
    temperature: temperatureSent,
    maxOutputTokens: request.maxOutputTokens,
  };
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
  const googleModelParts =
    toolCalls.length > 0 ? extractGoogleModelParts(response) : undefined;
  const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
  const usage = usageFromGeminiResponse(
    (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } })
      .usageMetadata,
  );
  const temperatureSent = request.temperature ?? 0.4;
  return {
    provider: 'google',
    model: resolvedModel,
    requestedModel: model,
    text,
    toolCalls,
    googleModelParts,
    finishReason,
    usage,
    apiCallCount: 1,
    providerRequestId: (response as { responseId?: string }).responseId,
    temperature: temperatureSent,
    maxOutputTokens: request.maxOutputTokens,
  };
}
