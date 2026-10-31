import OpenAI from 'openai';
import { logServer } from '../../lib/utils.js';
import type { LlmModelOption, LlmProvider, LlmTestModelResponse } from '../../../shared/types/llm.js';
import { llmSettingsService } from './LlmSettingsService.js';
import {
  llmOpenAiOfficialPricingService,
  type PriceRow,
} from './LlmOpenAiOfficialPricingService.js';
import { llmGoogleOfficialPricingService } from './LlmGoogleOfficialPricingService.js';
import { googleComplete } from './providers/googleLlmProvider.js';
import { openaiComplete } from './providers/openaiLlmProvider.js';
import { openRouterComplete } from './providers/openRouterLlmProvider.js';
import { getOpenRouterBaseUrl, getOpenRouterDefaultHeaders } from '../../../shared/constants/openRouterConfig.js';
import { resolveLlmApiKey, resolveLlmDefaultModel } from './llmPlatformResolve.js';
import { enrichLlmTokenUsageCost } from './llmUsageCostEnrichment.js';
import { llmUsageLogService } from './LlmUsageLogService.js';
import { isLlmProvider } from '../../../shared/constants/llmProviders.js';
import {
  isGeminiPlatformChatModel,
  isOpenAiPlatformChatModel,
  isOpenRouterPlatformChatModel,
} from '../../../shared/constants/llmModelCatalogFilter.js';
import { completionToTestDiagnostics } from '../../../shared/utils/llmTestDiagnostics.js';
import {
  loadOpenRouterProviderIcons,
  resolveOpenRouterModelIconUrl,
} from './openRouterProviderIcons.js';

function sortModels(options: LlmModelOption[]): LlmModelOption[] {
  const byId = new Map<string, LlmModelOption>();
  for (const opt of options) {
    if (!opt.id.trim()) continue;
    byId.set(opt.id, opt);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

type GoogleModelListItem = {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

type GoogleModelsListResponse = {
  models?: Array<Record<string, unknown>>;
  nextPageToken?: string;
  next_page_token?: string;
  error?: { message?: string };
};

function readGoogleGenerationMethods(raw: Record<string, unknown>): string[] | undefined {
  const methods = raw.supportedGenerationMethods ?? raw.supported_generation_methods;
  if (!Array.isArray(methods)) return undefined;
  return methods.map((m) => String(m));
}

function normalizeGoogleModelRow(raw: Record<string, unknown>): GoogleModelListItem {
  const displayName = raw.displayName ?? raw.display_name;
  return {
    name: typeof raw.name === 'string' ? raw.name : undefined,
    displayName: typeof displayName === 'string' ? displayName : undefined,
    supportedGenerationMethods: readGoogleGenerationMethods(raw),
  };
}

function supportsGenerateContent(methods: string[] | undefined): boolean {
  if (!methods?.length) return false;
  return methods.some((m) => m.replace(/_/g, '').toLowerCase() === 'generatecontent');
}

function isGeminiGenerativeModel(name: string, methods: string[] | undefined): boolean {
  if (!supportsGenerateContent(methods)) return false;
  const id = name.replace(/^models\//, '');
  return isGeminiPlatformChatModel(id);
}

async function fetchAllGoogleModels(apiKey: string): Promise<GoogleModelListItem[]> {
  const all: GoogleModelListItem[] = [];
  let pageToken: string | undefined;
  const pageSize = 100;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      pageSize: String(pageSize),
    });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json()) as GoogleModelsListResponse;
    if (!response.ok) {
      throw new Error(body.error?.message || `HTTP ${response.status}`);
    }
    for (const row of body.models ?? []) {
      all.push(normalizeGoogleModelRow(row));
    }
    const next = body.nextPageToken ?? body.next_page_token;
    pageToken = typeof next === 'string' && next.trim() ? next.trim() : undefined;
  } while (pageToken);

  return all;
}

function formatOpenRouterPricingHint(promptPerToken: string, completionPerToken: string): string | null {
  const inPerM = Number(promptPerToken) * 1_000_000;
  const outPerM = Number(completionPerToken) * 1_000_000;
  if (!Number.isFinite(inPerM) || !Number.isFinite(outPerM)) return null;
  const fmt = (n: number) => (n < 0.01 ? n.toFixed(4) : n < 1 ? n.toFixed(3) : n.toFixed(2));
  return `$${fmt(inPerM)}/1M in · $${fmt(outPerM)}/1M out`;
}

export class LlmModelsService {
  async resolveApiKey(provider: LlmProvider, draftKey?: string): Promise<string> {
    const trimmed = draftKey?.trim();
    if (trimmed) return trimmed;
    const settings = await llmSettingsService.getSettings();
    const key = resolveLlmApiKey(settings, provider);
    if (!key.trim()) {
      throw new Error('API key не налаштовано');
    }
    return key.trim();
  }

  async listOpenAiModels(draftKey?: string): Promise<LlmModelOption[]> {
    const apiKey = await this.resolveApiKey('openai', draftKey);
    const client = new OpenAI({ apiKey });
    const options: LlmModelOption[] = [];
    let pricingMap: Map<string, PriceRow> | null = null;
    try {
      pricingMap = await llmOpenAiOfficialPricingService.loadStandardPricing();
    } catch (error) {
      logServer('[LlmModelsService] OpenAI official pricing unavailable', error);
    }
    let rawCount = 0;
    try {
      for await (const model of client.models.list()) {
        rawCount += 1;
        if (!isOpenAiPlatformChatModel(model.id)) continue;
        const pricingHint =
          pricingMap != null
            ? llmOpenAiOfficialPricingService.resolveHint(model.id, pricingMap)
            : null;
        options.push({
          id: model.id,
          label: model.id,
          pricingHint,
          pricingSource: pricingHint ? 'openai_official_docs' : null,
        });
      }
    } catch (error) {
      logServer('[LlmModelsService] OpenAI models.list failed', error);
      throw new Error(error instanceof Error ? error.message : 'Не вдалося завантажити моделі OpenAI');
    }
    if (options.length === 0) {
      throw new Error('OpenAI не повернув жодної chat-моделі');
    }
    logServer(
      `[LlmModelsService] OpenAI models listed: ${options.length} platform chat (raw ${rawCount})`,
    );
    return sortModels(options);
  }

  async listGoogleModels(draftKey?: string): Promise<LlmModelOption[]> {
    const apiKey = await this.resolveApiKey('google', draftKey);
    let pricingMap: Map<string, PriceRow> | null = null;
    try {
      pricingMap = await llmGoogleOfficialPricingService.loadStandardPricing();
    } catch (error) {
      logServer('[LlmModelsService] Google official pricing unavailable', error);
    }
    try {
      const remoteModels = await fetchAllGoogleModels(apiKey);
      const options: LlmModelOption[] = [];
      for (const model of remoteModels) {
        const name = model.name ?? '';
        if (!isGeminiGenerativeModel(name, model.supportedGenerationMethods)) continue;
        const id = name.replace(/^models\//, '');
        const pricingHint =
          pricingMap != null ? llmGoogleOfficialPricingService.resolveHint(id, pricingMap) : null;
        options.push({
          id,
          label: model.displayName || id,
          pricingHint,
          pricingSource: pricingHint ? 'google_official_docs' : null,
        });
      }
      if (pricingMap) {
        for (const modelId of pricingMap.keys()) {
          if (!isGeminiPlatformChatModel(modelId)) continue;
          if (options.some((o) => o.id === modelId)) continue;
          const pricingHint = llmGoogleOfficialPricingService.resolveHint(modelId, pricingMap);
          options.push({
            id: modelId,
            label: modelId,
            pricingHint,
            pricingSource: pricingHint ? 'google_official_docs' : null,
          });
        }
      }

      if (options.length === 0) {
        throw new Error('Gemini не повернув жодної generateContent-моделі');
      }
      logServer(
        `[LlmModelsService] Google models listed: ${options.length} platform chat (raw API ${remoteModels.length})`,
      );
      return sortModels(options);
    } catch (error) {
      logServer('[LlmModelsService] Google models list failed', error);
      throw new Error(error instanceof Error ? error.message : 'Не вдалося завантажити моделі Gemini');
    }
  }

  async listOpenRouterModels(draftKey?: string): Promise<LlmModelOption[]> {
    const apiKey = await this.resolveApiKey('openrouter', draftKey);
    const url = `${getOpenRouterBaseUrl()}/models`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...getOpenRouterDefaultHeaders(),
        },
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          pricing?: { prompt?: string; completion?: string };
          architecture?: { modality?: string; output_modalities?: string[] };
          supported_parameters?: string[];
        }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message || `HTTP ${response.status}`);
      }
      const providerIcons = await loadOpenRouterProviderIcons();
      const options: LlmModelOption[] = [];
      const rawCount = body.data?.length ?? 0;
      for (const row of body.data ?? []) {
        if (!isOpenRouterPlatformChatModel(row)) continue;
        const id = row.id!.trim();
        const pricingHint =
          row.pricing?.prompt && row.pricing?.completion
            ? formatOpenRouterPricingHint(row.pricing.prompt, row.pricing.completion)
            : null;
        options.push({
          id,
          label: row.name?.trim() || id,
          pricingHint,
          pricingSource: pricingHint ? 'openrouter_api' : null,
          iconUrl: resolveOpenRouterModelIconUrl(id, providerIcons),
        });
      }
      if (options.length === 0) {
        throw new Error('OpenRouter не повернув моделей');
      }
      logServer(
        `[LlmModelsService] OpenRouter models listed: ${options.length} chat+tools (raw ${rawCount})`,
      );
      return sortModels(options);
    } catch (error) {
      logServer('[LlmModelsService] OpenRouter models list failed', error);
      throw new Error(
        error instanceof Error ? error.message : 'Не вдалося завантажити моделі OpenRouter',
      );
    }
  }

  async listModels(provider: LlmProvider, draftKey?: string): Promise<LlmModelOption[]> {
    if (provider === 'google') {
      return this.listGoogleModels(draftKey);
    }
    if (provider === 'openrouter') {
      return this.listOpenRouterModels(draftKey);
    }
    return this.listOpenAiModels(draftKey);
  }

  /** Completion обраної моделі (перевірка inference). */
  async testModel(
    provider: LlmProvider,
    modelId: string,
    draftKey?: string,
    options?: { message?: string; system?: string; maxOutputTokens?: number },
  ): Promise<LlmTestModelResponse> {
    const model = modelId.trim();
    if (!model) {
      throw new Error('Вкажіть id моделі');
    }
    const apiKey = await this.resolveApiKey(provider, draftKey);
    const settings = await llmSettingsService.getSettings();
    const cap = options?.maxOutputTokens ?? settings.maxOutputTokens;
    const maxOutputTokens = Math.min(512, Math.max(64, cap));
    const userContent =
      options?.message?.trim() ||
      'Відповідай одним коротким словом українською: Готово';
    const request = {
      system: options?.system?.trim() || undefined,
      messages: [{ role: 'user' as const, content: userContent }],
      maxOutputTokens,
      temperature: 0.2,
    };
    const started = Date.now();
    let result: Awaited<ReturnType<LlmModelsService['runCompletion']>>;
    try {
      result = await this.runCompletion(provider, apiKey, model, request);
    } catch (error) {
      llmUsageLogService.record({ provider, model, feature: 'llm_test', error });
      throw error;
    }
    const usage = await enrichLlmTokenUsageCost(provider, model, result.usage);
    if (usage !== result.usage) result = { ...result, usage };
    llmUsageLogService.record({
      provider,
      model,
      feature: 'llm_test',
      inputTokens: usage?.promptTokens,
      outputTokens: usage?.completionTokens,
      costUsd: usage?.estimatedCostUsd,
    });
    const latencyMs = Date.now() - started;
    const reply = result.text.trim();
    if (!reply) {
      throw new Error(`Модель відповіла порожньо (finish: ${result.finishReason})`);
    }
    return {
      ...completionToTestDiagnostics(model, result, latencyMs),
      reply,
    };
  }

  async testDefaultPlatform(options?: {
    message?: string;
    system?: string;
    maxOutputTokens?: number;
    provider?: LlmProvider;
    model?: string;
  }): Promise<LlmTestModelResponse> {
    const settings = await llmSettingsService.getSettings();
    const provider =
      options?.provider && isLlmProvider(options.provider)
        ? options.provider
        : settings.defaultProvider;
    const model = options?.model?.trim() || resolveLlmDefaultModel(settings, provider);
    return this.testModel(provider, model, undefined, options);
  }

  private async runCompletion(
    provider: LlmProvider,
    apiKey: string,
    model: string,
    request: {
      system?: string;
      messages: Array<{ role: 'user'; content: string }>;
      maxOutputTokens: number;
      temperature: number;
    },
  ) {
    if (provider === 'google') {
      return googleComplete(apiKey, model, request);
    }
    if (provider === 'openrouter') {
      return openRouterComplete(apiKey, model, request);
    }
    return openaiComplete(apiKey, model, request);
  }
}

export const llmModelsService = new LlmModelsService();
