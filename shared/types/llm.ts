/** Platform-wide LLM settings and request/response types. */

export type LlmProvider = 'openai' | 'google' | 'openrouter';

/** Звідки викликати TypeSafe Jev: напряму або через System One API OpenRouter (ключ OpenRouter). */
export type LlmTypesafeSource = 'typesafe' | 'openrouter';

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

/** Провайдер у журналі витрат: chat-LLM або класифікатор TypeSafe. */
export type LlmUsageProvider = LlmProvider | 'typesafe';

/** Звідки платний виклик — для розбивки витрат. */
export type LlmUsageFeature = 'chatwoot_bot_reply' | 'topics_jev' | 'llm_test' | 'jev_test' | 'other';

export type LlmCompletionRequest = {
  /** Для журналу витрат; без нього — `other`. */
  feature?: LlmUsageFeature;
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
  typesafeSource: LlmTypesafeSource;
  /** USD за 1M input tokens Jev при прямому TypeSafe (API ціну не віддає); 0 — невідомо. OpenRouter повертає `usage.cost`. */
  typesafeInputPricePer1M: number;
  /** Необовʼязковий OpenAI Admin key (`sk-admin-…`) — витрати організації через /v1/organization/costs. */
  openaiAdminKey: string;
};

export type LlmPlatformSettingsUpdate = Partial<LlmPlatformSettings> & {
  clearOpenaiApiKey?: boolean;
  clearGoogleApiKey?: boolean;
  clearOpenrouterApiKey?: boolean;
  clearTypesafeApiKey?: boolean;
  clearOpenaiAdminKey?: boolean;
};

export type LlmPlatformSettingsResponse = Omit<
  LlmPlatformSettings,
  'openaiApiKey' | 'googleApiKey' | 'openrouterApiKey' | 'typesafeApiKey' | 'openaiAdminKey'
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
  /** Є ключ для обраного джерела Jev (TypeSafe або OpenRouter). */
  jevApiKeyReady: boolean;
  openaiAdminKey: string;
  openaiAdminKeyMasked: string;
  hasOpenaiAdminKey: boolean;
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
  /** USD з відповіді OpenRouter; null — прямий TypeSafe. */
  costUsd: number | null;
  source: LlmTypesafeSource;
  question: string;
};

/** Агрегат журналу витрат за період (провайдер / функція / модель / день). */
export type LlmUsageTotals = {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Викликів без відомої ціни — сума costUsd неповна. */
  unpricedCalls: number;
};

export type LlmUsageSummaryResponse = {
  days: number;
  from: string;
  to: string;
  total: LlmUsageTotals;
  byProvider: Array<{ provider: LlmUsageProvider } & LlmUsageTotals>;
  byFeature: Array<{ feature: string } & LlmUsageTotals>;
  byModel: Array<{ provider: LlmUsageProvider; model: string } & LlmUsageTotals>;
  /** YYYY-MM-DD (Europe/Kyiv) → витрати; усі дні періоду, порожні теж. */
  byDay: Array<{ day: string; costUsd: number; calls: number }>;
};

export type LlmProviderBalance = {
  provider: LlmUsageProvider;
  /** available — дані є; no_key — ключ не задано; unsupported — API балансу немає; error — запит упав. */
  status: 'available' | 'no_key' | 'unsupported' | 'error';
  /** Залишок кредитів / ліміту, USD. */
  remainingUsd?: number | null;
  /** Ліміт ключа або куплені кредити, USD. */
  limitUsd?: number | null;
  /** Витрачено за даними провайдера, USD. */
  usedUsd?: number | null;
  /** Що саме означає usedUsd (напр. «за весь час», «30 днів»). */
  usedPeriod?: string;
  note?: string;
  error?: string;
};

export type LlmBalancesResponse = {
  fetchedAt: string;
  balances: LlmProviderBalance[];
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
  typesafeSource: 'openrouter',
  typesafeInputPricePer1M: 0,
  openaiAdminKey: '',
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
