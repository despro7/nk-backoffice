import type {
  LlmModelOption,
  LlmPlatformSettingsResponse,
  LlmPlatformSettingsUpdate,
  LlmProvider,
} from '@shared/types/llm';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data.data as T;
}

export const llmSettingsApi = {
  async getSettings(revealSecrets = false): Promise<LlmPlatformSettingsResponse> {
    const qs = revealSecrets ? '?revealSecrets=true' : '';
    const res = await fetch(`/api/llm/settings${qs}`, { credentials: 'include' });
    return parseJson(res);
  },

  async listModels(
    provider: LlmProvider,
    draftApiKey?: string,
  ): Promise<LlmModelOption[]> {
    if (draftApiKey?.trim()) {
      const res = await fetch(`/api/llm/models/${provider}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: draftApiKey.trim() }),
      });
      return parseJson(res);
    }
    const res = await fetch(`/api/llm/models/${provider}`, { credentials: 'include' });
    return parseJson(res);
  },

  async updateSettings(input: LlmPlatformSettingsUpdate): Promise<LlmPlatformSettingsResponse> {
    const res = await fetch('/api/llm/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },
};

export type LlmSettingsFormState = {
  defaultProvider: LlmProvider;
  openaiApiKey: string;
  openaiApiKeyMasked: string;
  hasOpenaiApiKey: boolean;
  googleApiKey: string;
  googleApiKeyMasked: string;
  hasGoogleApiKey: boolean;
  openaiDefaultModel: string;
  googleDefaultModel: string;
  maxOutputTokens: number;
};

export function toLlmFormState(data: LlmPlatformSettingsResponse): LlmSettingsFormState {
  return {
    defaultProvider: data.defaultProvider,
    openaiApiKey: '',
    openaiApiKeyMasked: data.openaiApiKeyMasked,
    hasOpenaiApiKey: data.hasOpenaiApiKey,
    googleApiKey: '',
    googleApiKeyMasked: data.googleApiKeyMasked,
    hasGoogleApiKey: data.hasGoogleApiKey,
    openaiDefaultModel: data.openaiDefaultModel,
    googleDefaultModel: data.googleDefaultModel,
    maxOutputTokens: data.maxOutputTokens,
  };
}
