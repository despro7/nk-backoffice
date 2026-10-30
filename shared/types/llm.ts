/** Platform-wide LLM settings and request/response types. */

export type LlmProvider = 'openai' | 'google' | 'openrouter';

export type LlmModelOption = {
  id: string;
  label: string;
  /** USD / 1M tokens — лише з офіційних docs (OpenAI pricing.md, Google pricing HTML). */
  pricingHint?: string | null;
  pricingSource?: 'openai_official_docs' | 'google_official_docs' | 'openrouter_api' | null;
  /** OpenRouter: логотип провайдера (author з id моделі). */
  iconUrl?: string | null;
};

export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Gemini: thoughtSignature з Part — echo у наступному запиті (якщо немає googleModelParts). */
  googleThoughtSignature?: string;
};

/** Діагностика tool loop (лише адмін-тести). */
export type LlmToolTraceEntry = {
  step: number;
  /** Номер раунду LLM API (1 = перший виклик). */
  apiRound: number;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
};

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
  /** For assistant after tool_calls – потрібно для наступного раунду API. */
  toolCalls?: LlmToolCall[];
  /** Gemini tool loop: verbatim model `content.parts` (thought_signature тощо). */
  googleModelParts?: unknown[];
  /** For tool role – id from assistant tool call. */
  toolCallId?: string;
  name?: string;
};

export type LlmToolParameterSchema = {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: LlmToolParameterSchema;
};

export type LlmCompletionRequest = {
  provider?: LlmProvider;
  model?: string;
  system?: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
};

export type LlmTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD, якщо API повертає (напр. OpenRouter usage.cost). */
  estimatedCostUsd?: number | null;
};

export type LlmCompletionResult = {
  provider: LlmProvider;
  model: string;
  text: string;
  toolCalls: LlmToolCall[];
  /** Gemini: сирі parts відповіді моделі з tool call (для наступного раунду). */
  googleModelParts?: unknown[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: LlmTokenUsage;
  /** Скільки разів викликали API (tool loop). */
  apiCallCount?: number;
  /** Id моделі з запиту (до alias, напр. Gemini). */
  requestedModel?: string;
  providerRequestId?: string;
  providerRequestIds?: string[];
  /** Фактично передані в API; null = дефолт провайдера (напр. GPT-5/6). */
  temperature?: number | null;
  maxOutputTokens?: number;
  toolsInvoked?: Record<string, number>;
  toolTrace?: LlmToolTraceEntry[];
};

export type LlmTestModelResponse = {
  provider: LlmProvider;
  model: string;
  reply: string;
  finishReason: string;
  latencyMs: number;
  usage?: LlmTokenUsage;
  apiCallCount?: number;
  requestedModel?: string;
  providerRequestId?: string;
  providerRequestIds?: string[];
  temperature?: number | null;
  maxOutputTokens?: number;
  toolsInvoked?: Record<string, number>;
  toolTrace?: LlmToolTraceEntry[];
  maskId?: string;
  maskName?: string;
  systemPromptChars?: number;
  providerSource?: 'override' | 'platform';
  warnings?: string[];
};

export type LlmCompleteWithToolsRequest = LlmCompletionRequest & {
  tools: LlmToolDefinition[];
};

/** Пороги USD / 1M для кольору цін у списках моделей (світлофор). */
export type LlmModelPriceHighlightSettings = {
  enabled: boolean;
  /** ≤ greenMax — зелений */
  greenMaxUsdPerM: number;
  /** > greenMax і ≤ yellowMax — жовтий; вище — червоний */
  yellowMaxUsdPerM: number;
};

export type LlmPlatformSettings = {
  defaultProvider: LlmProvider;
  openaiApiKey: string;
  googleApiKey: string;
  openrouterApiKey: string;
  openaiDefaultModel: string;
  googleDefaultModel: string;
  openrouterDefaultModel: string;
  maxOutputTokens: number;
  modelPriceHighlight: LlmModelPriceHighlightSettings;
  /** TypeSafe Jev — класифікатор (не chat-модель), напр. теми питань чат-бота. */
  typesafeApiKey: string;
  typesafeModel: string;
};

export type LlmPlatformSettingsUpdate = Partial<LlmPlatformSettings> & {
  clearOpenaiApiKey?: boolean;
  clearGoogleApiKey?: boolean;
  clearOpenrouterApiKey?: boolean;
  clearTypesafeApiKey?: boolean;
};

export type LlmPlatformSettingsResponse = Omit<
  LlmPlatformSettings,
  'openaiApiKey' | 'googleApiKey' | 'openrouterApiKey' | 'typesafeApiKey'
> & {
  openaiApiKey: string;
  openaiApiKeyMasked: string;
  hasOpenaiApiKey: boolean;
  googleApiKey: string;
  googleApiKeyMasked: string;
  hasGoogleApiKey: boolean;
  openrouterApiKey: string;
  openrouterApiKeyMasked: string;
  hasOpenrouterApiKey: boolean;
  typesafeApiKey: string;
  typesafeApiKeyMasked: string;
  hasTypesafeApiKey: boolean;
};

/** Тест Jev у /settings/llm: класифікація прикладу питання. */
export type TypesafeJevTestResponse = {
  model: string;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  question: string;
};

export const LLM_PLATFORM_SETTINGS_KEY = 'llm_platform_settings';
export const LLM_PLATFORM_SETTINGS_CATEGORY = 'llm';

export const DEFAULT_LLM_PLATFORM_SETTINGS: LlmPlatformSettings = {
  defaultProvider: 'openai',
  openaiApiKey: '',
  googleApiKey: '',
  openrouterApiKey: '',
  openaiDefaultModel: 'gpt-4.1-mini',
  googleDefaultModel: 'gemini-3.5-flash',
  openrouterDefaultModel: 'openai/gpt-6-luna-pro',
  maxOutputTokens: 1024,
  modelPriceHighlight: {
    enabled: true,
    greenMaxUsdPerM: 5,
    yellowMaxUsdPerM: 10,
  },
  typesafeApiKey: '',
  typesafeModel: 'jev-latest',
};

export class LlmServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'missing_api_key' | 'provider_error' | 'unsupported',
  ) {
    super(message);
    this.name = 'LlmServiceError';
  }
}
