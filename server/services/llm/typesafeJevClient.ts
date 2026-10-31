/**
 * TypeSafe Jev (`POST /v1/systemone`) — швидкий класифікатор: питання типу `choice` повертає
 * вибраний варіант, confidence і ймовірності всіх варіантів. Платні лише input tokens.
 * Та сама API доступна напряму в TypeSafe і через OpenRouter (ключ OpenRouter, `usage.cost` у відповіді).
 * https://docs.typesafe.ai/introduction/quickstart · https://openrouter.ai/docs/guides/community/typesafe-sdk
 */

import type { LlmPlatformSettings, LlmUsageFeature } from '../../../shared/types/llm.js';
import { getOpenRouterBaseUrl, getOpenRouterDefaultHeaders } from '../../../shared/constants/openRouterConfig.js';
import { llmUsageLogService } from './LlmUsageLogService.js';
import { jevCostUsd } from './llmUsageSummary.js';

const TYPESAFE_API_BASE_URL = 'https://api.typesafe.ai/v1';
const REQUEST_TIMEOUT_MS = 20_000;
/** Ліміт API на кількість варіантів у `criteria`. */
export const JEV_MAX_CHOICES = 255;

/** Куди і з яким ключем слати запит Jev. */
export type JevConnection = {
  apiKey: string;
  model: string;
  /** База до `/systemone`, напр. `https://openrouter.ai/api/v1`. */
  baseUrl: string;
  headers?: Record<string, string>;
  /** USD / 1M input для оцінки вартості, якщо відповідь без `usage.cost`. */
  inputPricePer1M: number;
};

/** Підключення Jev з налаштувань LLM; `draftApiKey` — чернетка ключа з UI (лише для прямого TypeSafe). */
export function resolveJevConnection(
  settings: Pick<
    LlmPlatformSettings,
    'typesafeSource' | 'typesafeApiKey' | 'openrouterApiKey' | 'typesafeModel' | 'typesafeInputPricePer1M'
  >,
  overrides?: { apiKey?: string; model?: string },
): JevConnection {
  const model = overrides?.model?.trim() || settings.typesafeModel;
  if (settings.typesafeSource === 'openrouter') {
    return {
      apiKey: settings.openrouterApiKey,
      model,
      baseUrl: getOpenRouterBaseUrl(),
      headers: getOpenRouterDefaultHeaders(),
      inputPricePer1M: 0,
    };
  }
  return {
    apiKey: overrides?.apiKey?.trim() || settings.typesafeApiKey,
    model,
    baseUrl: TYPESAFE_API_BASE_URL,
    inputPricePer1M: settings.typesafeInputPricePer1M,
  };
}

export type JevChoiceRequest = JevConnection & {
  /** Текст, який класифікуємо. */
  state: string;
  instructions: string;
  /** Ключ варіанта → опис. */
  criteria: Record<string, string>;
  /** Записати виклик у журнал витрат з цією функцією. */
  usageFeature?: LlmUsageFeature;
};

export type JevChoiceResult = {
  model: string;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  /** USD з відповіді (OpenRouter `usage.cost`). */
  costUsd: number | null;
};

export class TypesafeJevError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'TypesafeJevError';
  }
}

type SystemOneResponse = {
  model?: string;
  answers?: Record<
    string,
    { type?: string; choice?: string; confidence?: number; probabilities?: Record<string, number> }
  >;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  error?: string | { message?: string };
  detail?: string;
};

function errorMessage(body: SystemOneResponse | null, status: number): string {
  const raw = body?.error ?? body?.detail;
  const text = typeof raw === 'string' ? raw : raw?.message;
  return `TypeSafe HTTP ${status}${text ? `: ${text}` : ''}`;
}

export async function jevClassifyChoice(input: JevChoiceRequest): Promise<JevChoiceResult> {
  try {
    const result = await requestChoice(input);
    if (input.usageFeature) {
      llmUsageLogService.record({
        provider: 'typesafe',
        model: result.model,
        feature: input.usageFeature,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd ?? jevCostUsd(result.inputTokens, input.inputPricePer1M),
      });
    }
    return result;
  } catch (error) {
    // Без ключа запиту не було — нічого не витрачено.
    if (input.usageFeature && input.apiKey) {
      llmUsageLogService.record({ provider: 'typesafe', model: input.model, feature: input.usageFeature, error });
    }
    throw error;
  }
}

async function requestChoice(input: JevChoiceRequest): Promise<JevChoiceResult> {
  if (!input.apiKey) throw new TypesafeJevError('TypeSafe API key не налаштовано');
  const choices = Object.keys(input.criteria);
  if (choices.length < 2) throw new TypesafeJevError('Потрібно щонайменше 2 варіанти');
  if (choices.length > JEV_MAX_CHOICES) throw new TypesafeJevError(`Більше ${JEV_MAX_CHOICES} варіантів`);

  const res = await fetch(`${input.baseUrl.replace(/\/$/, '')}/systemone`, {
    method: 'POST',
    headers: { ...input.headers, Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      state: input.state,
      questions: {
        answer: { type: 'choice', instructions: input.instructions, criteria: input.criteria },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as SystemOneResponse | null;
  if (!res.ok) throw new TypesafeJevError(errorMessage(body, res.status), res.status);

  const answer = body?.answers?.answer;
  if (!answer?.choice || !choices.includes(answer.choice)) {
    throw new TypesafeJevError('TypeSafe: відповідь без валідного choice');
  }
  return {
    model: body?.model ?? input.model,
    choice: answer.choice,
    confidence: Number(answer.confidence ?? 0),
    probabilities: answer.probabilities ?? {},
    inputTokens: Number(body?.usage?.input_tokens ?? 0),
    outputTokens: Number(body?.usage?.output_tokens ?? 0),
    costUsd: typeof body?.usage?.cost === 'number' && Number.isFinite(body.usage.cost) ? body.usage.cost : null,
  };
}
