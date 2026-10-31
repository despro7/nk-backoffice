import { logServer } from '../../lib/utils.js';
import type { LlmBalancesResponse, LlmProviderBalance } from '../../../shared/types/llm.js';
import { getOpenRouterBaseUrl, getOpenRouterDefaultHeaders } from '../../../shared/constants/openRouterConfig.js';
import { llmSettingsService } from './LlmSettingsService.js';

/**
 * Баланси провайдерів: OpenRouter — `/key` і `/credits`; OpenAI — лише витрати організації
 * за 30 днів з Admin key (балансу в API немає); Google і TypeSafe API балансу не мають.
 */

const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const OPENAI_COSTS_DAYS = 30;

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } | string }) | null;
  if (!res.ok) {
    const raw = body?.error;
    const text = typeof raw === 'string' ? raw : raw?.message;
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
  }
  if (!body) throw new Error('Порожня відповідь');
  return body;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type OpenRouterKeyResponse = { data?: { limit?: number | null; usage?: number; limit_remaining?: number | null } };
type OpenRouterCreditsResponse = { data?: { total_credits?: number; total_usage?: number } };
type OpenAiCostsResponse = {
  data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>;
  has_more?: boolean;
  next_page?: string | null;
};

async function openRouterBalance(apiKey: string): Promise<LlmProviderBalance> {
  if (!apiKey) return { provider: 'openrouter', status: 'no_key' };
  const base = getOpenRouterBaseUrl();
  const headers = { ...getOpenRouterDefaultHeaders(), Authorization: `Bearer ${apiKey}` };
  try {
    const key = await getJson<OpenRouterKeyResponse>(`${base}/key`, headers);
    // /credits — баланс акаунта; доступ залежить від типу ключа, тож без нього лишаємо ліміт ключа.
    const credits = await getJson<OpenRouterCreditsResponse>(`${base}/credits`, headers).catch(() => null);
    const total = num(credits?.data?.total_credits);
    const used = num(credits?.data?.total_usage);
    if (total != null && used != null) {
      return {
        provider: 'openrouter',
        status: 'available',
        remainingUsd: total - used,
        limitUsd: total,
        usedUsd: used,
        usedPeriod: 'за весь час',
        note: 'Кредити акаунта',
      };
    }
    const limit = num(key.data?.limit);
    return {
      provider: 'openrouter',
      status: 'available',
      remainingUsd: num(key.data?.limit_remaining),
      limitUsd: limit,
      usedUsd: num(key.data?.usage),
      usedPeriod: 'цим ключем за весь час',
      note: limit == null ? 'Ключ без ліміту; баланс акаунта недоступний цьому ключу' : 'Ліміт ключа',
    };
  } catch (error) {
    return { provider: 'openrouter', status: 'error', error: errorText(error) };
  }
}

async function openAiBalance(adminKey: string): Promise<LlmProviderBalance> {
  if (!adminKey) {
    return {
      provider: 'openai',
      status: 'no_key',
      note: 'Витрати організації — з Admin key; баланс OpenAI через API не віддає',
    };
  }
  const startTime = Math.floor(Date.now() / 1000) - OPENAI_COSTS_DAYS * 24 * 60 * 60;
  const headers = { Authorization: `Bearer ${adminKey}` };
  try {
    let used = 0;
    let page: string | null = null;
    for (let i = 0; i < 5; i++) {
      const params = new URLSearchParams({ start_time: String(startTime), bucket_width: '1d', limit: '31' });
      if (page) params.set('page', page);
      const body = await getJson<OpenAiCostsResponse>(
        `https://api.openai.com/v1/organization/costs?${params.toString()}`,
        headers,
      );
      for (const bucket of body.data ?? []) {
        for (const result of bucket.results ?? []) used += num(result.amount?.value) ?? 0;
      }
      if (!body.has_more || !body.next_page) break;
      page = body.next_page;
    }
    return {
      provider: 'openai',
      status: 'available',
      usedUsd: used,
      usedPeriod: `${OPENAI_COSTS_DAYS} днів, уся організація`,
      note: 'Баланс OpenAI через API не віддає',
    };
  } catch (error) {
    return { provider: 'openai', status: 'error', error: errorText(error) };
  }
}

export class LlmBalancesService {
  private cache: LlmBalancesResponse | null = null;
  private cacheExpiresAt = 0;

  async getBalances(force = false): Promise<LlmBalancesResponse> {
    if (!force && this.cache && Date.now() < this.cacheExpiresAt) return this.cache;
    const settings = await llmSettingsService.getSettings();
    const [openrouter, openai] = await Promise.all([
      openRouterBalance(settings.openrouterApiKey),
      openAiBalance(settings.openaiAdminKey),
    ]);
    for (const balance of [openrouter, openai]) {
      if (balance.status === 'error') logServer(`[LlmBalances] ${balance.provider}: ${balance.error}`);
    }
    const response: LlmBalancesResponse = {
      fetchedAt: new Date().toISOString(),
      balances: [
        openai,
        openrouter,
        { provider: 'google', status: 'unsupported', note: 'API балансу немає — див. наші витрати' },
        { provider: 'typesafe', status: 'unsupported', note: 'API балансу немає — див. наші витрати' },
      ],
    };
    this.cache = response;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return response;
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }
}

export const llmBalancesService = new LlmBalancesService();
