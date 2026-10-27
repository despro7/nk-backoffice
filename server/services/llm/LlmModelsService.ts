import OpenAI from 'openai';
import { logServer } from '../../lib/utils.js';
import type { LlmModelOption, LlmProvider } from '../../../shared/types/llm.js';
import { llmSettingsService } from './LlmSettingsService.js';
import {
  llmOpenAiOfficialPricingService,
  type PriceRow,
} from './LlmOpenAiOfficialPricingService.js';
import { llmGoogleOfficialPricingService } from './LlmGoogleOfficialPricingService.js';

function sortModels(options: LlmModelOption[]): LlmModelOption[] {
  const byId = new Map<string, LlmModelOption>();
  for (const opt of options) {
    if (!opt.id.trim()) continue;
    byId.set(opt.id, opt);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

function isOpenAiChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.startsWith('gpt-') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('chatgpt-')
  );
}

function isGeminiGenerativeModel(name: string, methods: string[] | undefined): boolean {
  if (!methods?.includes('generateContent')) return false;
  const id = name.replace(/^models\//, '').toLowerCase();
  return id.includes('gemini');
}

export class LlmModelsService {
  async resolveApiKey(provider: LlmProvider, draftKey?: string): Promise<string> {
    const trimmed = draftKey?.trim();
    if (trimmed) return trimmed;
    const settings = await llmSettingsService.getSettings();
    const key = provider === 'google' ? settings.googleApiKey : settings.openaiApiKey;
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
    try {
      for await (const model of client.models.list()) {
        if (!isOpenAiChatModel(model.id)) continue;
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json()) as {
        models?: Array<{
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
          inputTokenLimit?: number;
          outputTokenLimit?: number;
        }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message || `HTTP ${response.status}`);
      }
      const options: LlmModelOption[] = [];
      for (const model of body.models ?? []) {
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
      if (options.length === 0) {
        throw new Error('Gemini не повернув жодної generateContent-моделі');
      }
      return sortModels(options);
    } catch (error) {
      logServer('[LlmModelsService] Google models list failed', error);
      throw new Error(error instanceof Error ? error.message : 'Не вдалося завантажити моделі Gemini');
    }
  }

  async listModels(provider: LlmProvider, draftKey?: string): Promise<LlmModelOption[]> {
    if (provider === 'google') {
      return this.listGoogleModels(draftKey);
    }
    return this.listOpenAiModels(draftKey);
  }
}

export const llmModelsService = new LlmModelsService();
