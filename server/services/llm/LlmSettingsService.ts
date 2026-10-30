import { prisma, logServer } from '../../lib/utils.js';
import { resolveGoogleLlmModelId } from '../../../shared/constants/googleLlmModelAliases.js';
import { isLlmProvider } from '../../../shared/constants/llmProviders.js';
import {
  DEFAULT_LLM_PLATFORM_SETTINGS,
  LLM_PLATFORM_SETTINGS_CATEGORY,
  LLM_PLATFORM_SETTINGS_KEY,
  type LlmPlatformSettings,
  type LlmPlatformSettingsResponse,
  type LlmPlatformSettingsUpdate,
  type LlmProvider,
} from '../../../shared/types/llm.js';
import { mergeLlmModelPriceHighlightSettings } from '../../../shared/utils/llmModelPriceHighlight.js';

const CACHE_TTL_MS = 60_000;

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `****…${value.slice(-4)}`;
}

function normalizeProvider(raw: unknown): LlmProvider {
  if (typeof raw === 'string' && isLlmProvider(raw)) return raw;
  return DEFAULT_LLM_PLATFORM_SETTINGS.defaultProvider;
}

function applyEnvFallback(settings: LlmPlatformSettings): LlmPlatformSettings {
  const envProvider = process.env.LLM_DEFAULT_PROVIDER?.trim();
  return {
    ...settings,
    defaultProvider:
      envProvider && isLlmProvider(envProvider) ? envProvider : settings.defaultProvider,
    openaiApiKey: settings.openaiApiKey || process.env.LLM_OPENAI_API_KEY || '',
    googleApiKey: settings.googleApiKey || process.env.LLM_GOOGLE_API_KEY || '',
    openrouterApiKey: settings.openrouterApiKey || process.env.LLM_OPENROUTER_API_KEY || '',
    typesafeApiKey: settings.typesafeApiKey || process.env.LLM_TYPESAFE_API_KEY || '',
  };
}

function mergeWithDefaults(raw: Partial<LlmPlatformSettings>): LlmPlatformSettings {
  const maxTokens = Number(raw.maxOutputTokens ?? DEFAULT_LLM_PLATFORM_SETTINGS.maxOutputTokens);
  const merged: LlmPlatformSettings = {
    ...DEFAULT_LLM_PLATFORM_SETTINGS,
    ...raw,
    defaultProvider: normalizeProvider(raw.defaultProvider),
    openaiApiKey: typeof raw.openaiApiKey === 'string' ? raw.openaiApiKey.trim() : '',
    googleApiKey: typeof raw.googleApiKey === 'string' ? raw.googleApiKey.trim() : '',
    openrouterApiKey: typeof raw.openrouterApiKey === 'string' ? raw.openrouterApiKey.trim() : '',
    openaiDefaultModel:
      typeof raw.openaiDefaultModel === 'string' && raw.openaiDefaultModel.trim()
        ? raw.openaiDefaultModel.trim()
        : DEFAULT_LLM_PLATFORM_SETTINGS.openaiDefaultModel,
    googleDefaultModel: resolveGoogleLlmModelId(
      typeof raw.googleDefaultModel === 'string' && raw.googleDefaultModel.trim()
        ? raw.googleDefaultModel.trim()
        : DEFAULT_LLM_PLATFORM_SETTINGS.googleDefaultModel,
    ),
    openrouterDefaultModel:
      typeof raw.openrouterDefaultModel === 'string' && raw.openrouterDefaultModel.trim()
        ? raw.openrouterDefaultModel.trim()
        : DEFAULT_LLM_PLATFORM_SETTINGS.openrouterDefaultModel,
    maxOutputTokens: Number.isFinite(maxTokens)
      ? Math.max(256, Math.min(8192, Math.floor(maxTokens)))
      : DEFAULT_LLM_PLATFORM_SETTINGS.maxOutputTokens,
    modelPriceHighlight: mergeLlmModelPriceHighlightSettings(raw.modelPriceHighlight),
    typesafeApiKey: typeof raw.typesafeApiKey === 'string' ? raw.typesafeApiKey.trim() : '',
    typesafeModel:
      typeof raw.typesafeModel === 'string' && raw.typesafeModel.trim()
        ? raw.typesafeModel.trim()
        : DEFAULT_LLM_PLATFORM_SETTINGS.typesafeModel,
  };
  return applyEnvFallback(merged);
}

export class LlmSettingsService {
  private cache: LlmPlatformSettings | null = null;
  private cacheExpiresAt = 0;

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }

  async getSettings(): Promise<LlmPlatformSettings> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }

    try {
      const record = await prisma.settingsBase.findUnique({
        where: { key: LLM_PLATFORM_SETTINGS_KEY },
      });
      if (!record?.value) {
        const defaults = mergeWithDefaults({});
        this.cache = defaults;
        this.cacheExpiresAt = now + CACHE_TTL_MS;
        return defaults;
      }
      const parsed = JSON.parse(record.value) as Partial<LlmPlatformSettings>;
      const settings = mergeWithDefaults(parsed);
      this.cache = settings;
      this.cacheExpiresAt = now + CACHE_TTL_MS;
      return settings;
    } catch (error) {
      logServer('LlmSettingsService: failed to load settings', error);
      return mergeWithDefaults({});
    }
  }

  async getSettingsForAdmin(revealSecrets = false): Promise<LlmPlatformSettingsResponse> {
    const settings = await this.getSettings();
    return {
      defaultProvider: settings.defaultProvider,
      openaiDefaultModel: settings.openaiDefaultModel,
      googleDefaultModel: settings.googleDefaultModel,
      openrouterDefaultModel: settings.openrouterDefaultModel,
      maxOutputTokens: settings.maxOutputTokens,
      openaiApiKey: revealSecrets ? settings.openaiApiKey : '',
      openaiApiKeyMasked: maskSecret(settings.openaiApiKey),
      hasOpenaiApiKey: Boolean(settings.openaiApiKey),
      googleApiKey: revealSecrets ? settings.googleApiKey : '',
      googleApiKeyMasked: maskSecret(settings.googleApiKey),
      hasGoogleApiKey: Boolean(settings.googleApiKey),
      openrouterApiKey: revealSecrets ? settings.openrouterApiKey : '',
      openrouterApiKeyMasked: maskSecret(settings.openrouterApiKey),
      hasOpenrouterApiKey: Boolean(settings.openrouterApiKey),
      modelPriceHighlight: settings.modelPriceHighlight,
      typesafeModel: settings.typesafeModel,
      typesafeApiKey: revealSecrets ? settings.typesafeApiKey : '',
      typesafeApiKeyMasked: maskSecret(settings.typesafeApiKey),
      hasTypesafeApiKey: Boolean(settings.typesafeApiKey),
    };
  }

  async saveSettings(incoming: LlmPlatformSettingsUpdate): Promise<LlmPlatformSettings> {
    const current = await this.getSettings();
    const { clearOpenaiApiKey, clearGoogleApiKey, clearOpenrouterApiKey, clearTypesafeApiKey, ...rest } = incoming;
    const next = mergeWithDefaults({
      ...current,
      ...rest,
      openaiApiKey: clearOpenaiApiKey
        ? ''
        : rest.openaiApiKey !== undefined && rest.openaiApiKey !== ''
          ? rest.openaiApiKey
          : current.openaiApiKey,
      googleApiKey: clearGoogleApiKey
        ? ''
        : rest.googleApiKey !== undefined && rest.googleApiKey !== ''
          ? rest.googleApiKey
          : current.googleApiKey,
      openrouterApiKey: clearOpenrouterApiKey
        ? ''
        : rest.openrouterApiKey !== undefined && rest.openrouterApiKey !== ''
          ? rest.openrouterApiKey
          : current.openrouterApiKey,
      typesafeApiKey: clearTypesafeApiKey
        ? ''
        : rest.typesafeApiKey !== undefined && rest.typesafeApiKey !== ''
          ? rest.typesafeApiKey
          : current.typesafeApiKey,
    });

    await prisma.settingsBase.upsert({
      where: { key: LLM_PLATFORM_SETTINGS_KEY },
      update: {
        value: JSON.stringify(next),
        category: LLM_PLATFORM_SETTINGS_CATEGORY,
        isActive: true,
      },
      create: {
        key: LLM_PLATFORM_SETTINGS_KEY,
        value: JSON.stringify(next),
        category: LLM_PLATFORM_SETTINGS_CATEGORY,
        description: 'Global LLM platform settings',
        isActive: true,
      },
    });

    this.invalidateCache();
    return this.getSettings();
  }
}

export const llmSettingsService = new LlmSettingsService();
