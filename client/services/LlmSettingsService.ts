import type {
  LlmModelOption,
  LlmModelPriceHighlightSettings,
  LlmPlatformSettingsResponse,
  LlmPlatformSettingsUpdate,
  LlmProvider,
  LlmTestModelResponse,
  TypesafeJevTestResponse,
  LlmUsageSummaryResponse,
  LlmBalancesResponse,
  LlmTypesafeSource,
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

  async testModel(
    provider: LlmProvider,
    model: string,
    draftApiKey?: string,
    options?: { message?: string; system?: string; maxOutputTokens?: number },
  ): Promise<LlmTestModelResponse> {
    const res = await fetch(`/api/llm/test-model/${provider}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.trim(),
        apiKey: draftApiKey?.trim() || undefined,
        ...options,
      }),
    });
    return parseJson(res);
  },

  async testDefaultPlatform(options?: {
    message?: string;
    system?: string;
    maxOutputTokens?: number;
    provider?: LlmProvider;
    model?: string;
  }): Promise<LlmTestModelResponse> {
    const res = await fetch('/api/llm/test-default', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options ?? {}),
    });
    return parseJson(res);
  },

  async listModels(provider: LlmProvider, draftApiKey?: string): Promise<LlmModelOption[]> {
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

  async testTypesafe(
    draftApiKey?: string,
    model?: string,
    source?: LlmTypesafeSource,
  ): Promise<TypesafeJevTestResponse> {
    const res = await fetch('/api/llm/typesafe/test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: draftApiKey?.trim() || undefined, model: model?.trim() || undefined, source }),
    });
    return parseJson(res);
  },

  async getUsage(days: number): Promise<LlmUsageSummaryResponse> {
    const res = await fetch(`/api/llm/usage?days=${days}`, { credentials: 'include' });
    return parseJson(res);
  },

  async getBalances(refresh = false): Promise<LlmBalancesResponse> {
    const res = await fetch(`/api/llm/balances${refresh ? '?refresh=true' : ''}`, { credentials: 'include' });
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
  openrouterApiKey: string;
  openrouterApiKeyMasked: string;
  hasOpenrouterApiKey: boolean;
  openaiDefaultModel: string;
  googleDefaultModel: string;
  openrouterDefaultModel: string;
  maxOutputTokens: number;
  modelPriceHighlight: LlmModelPriceHighlightSettings;
  typesafeApiKey: string;
  typesafeApiKeyMasked: string;
  hasTypesafeApiKey: boolean;
  typesafeModel: string;
  typesafeSource: LlmTypesafeSource;
  jevApiKeyReady: boolean;
  typesafeInputPricePer1M: number;
  openaiAdminKey: string;
  openaiAdminKeyMasked: string;
  hasOpenaiAdminKey: boolean;
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
    openrouterApiKey: '',
    openrouterApiKeyMasked: data.openrouterApiKeyMasked,
    hasOpenrouterApiKey: data.hasOpenrouterApiKey,
    openaiDefaultModel: data.openaiDefaultModel,
    googleDefaultModel: data.googleDefaultModel,
    openrouterDefaultModel: data.openrouterDefaultModel,
    maxOutputTokens: data.maxOutputTokens,
    modelPriceHighlight: data.modelPriceHighlight,
    typesafeApiKey: '',
    typesafeApiKeyMasked: data.typesafeApiKeyMasked,
    hasTypesafeApiKey: data.hasTypesafeApiKey,
    typesafeModel: data.typesafeModel,
    typesafeSource: data.typesafeSource,
    jevApiKeyReady: data.jevApiKeyReady,
    typesafeInputPricePer1M: data.typesafeInputPricePer1M,
    openaiAdminKey: '',
    openaiAdminKeyMasked: data.openaiAdminKeyMasked,
    hasOpenaiAdminKey: data.hasOpenaiAdminKey,
  };
}
