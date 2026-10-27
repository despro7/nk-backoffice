/** Platform-wide LLM settings and request/response types. */

export type LlmProvider = 'openai' | 'google';

export type LlmModelOption = {
  id: string;
  label: string;
  /** USD / 1M tokens — лише з офіційних docs (OpenAI pricing.md, Google pricing HTML). */
  pricingHint?: string | null;
  pricingSource?: 'openai_official_docs' | 'google_official_docs' | null;
};

export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
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

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmCompletionRequest = {
  provider?: LlmProvider;
  model?: string;
  system?: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
};

export type LlmCompletionResult = {
  provider: LlmProvider;
  model: string;
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
};

export type LlmCompleteWithToolsRequest = LlmCompletionRequest & {
  tools: LlmToolDefinition[];
};

export type LlmPlatformSettings = {
  defaultProvider: LlmProvider;
  openaiApiKey: string;
  googleApiKey: string;
  openaiDefaultModel: string;
  googleDefaultModel: string;
  maxOutputTokens: number;
};

export type LlmPlatformSettingsUpdate = Partial<LlmPlatformSettings> & {
  clearOpenaiApiKey?: boolean;
  clearGoogleApiKey?: boolean;
};

export type LlmPlatformSettingsResponse = Omit<
  LlmPlatformSettings,
  'openaiApiKey' | 'googleApiKey'
> & {
  openaiApiKey: string;
  openaiApiKeyMasked: string;
  hasOpenaiApiKey: boolean;
  googleApiKey: string;
  googleApiKeyMasked: string;
  hasGoogleApiKey: boolean;
};

export const LLM_PLATFORM_SETTINGS_KEY = 'llm_platform_settings';
export const LLM_PLATFORM_SETTINGS_CATEGORY = 'llm';

export const DEFAULT_LLM_PLATFORM_SETTINGS: LlmPlatformSettings = {
  defaultProvider: 'openai',
  openaiApiKey: '',
  googleApiKey: '',
  openaiDefaultModel: 'gpt-4.1-mini',
  googleDefaultModel: 'gemini-2.5-flash',
  maxOutputTokens: 1024,
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
