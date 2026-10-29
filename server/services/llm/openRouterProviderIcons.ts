import { logServer } from '../../lib/utils.js';
import { getOpenRouterDefaultHeaders } from '../../../shared/constants/openRouterConfig.js';

const OPENROUTER_ALL_PROVIDERS_URL = 'https://openrouter.ai/api/frontend/v1/all-providers';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedAt = 0;
let cachedIcons: Map<string, string> | null = null;

export function openRouterProviderSlugFromModelId(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash >= 0 ? modelId.slice(0, slash) : modelId;
}

function toAbsoluteOpenRouterAsset(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return `https://openrouter.ai${trimmed}`;
  return `https://openrouter.ai/${trimmed}`;
}

export async function loadOpenRouterProviderIcons(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedIcons && now < cachedAt + CACHE_TTL_MS) {
    return cachedIcons;
  }

  try {
    const response = await fetch(OPENROUTER_ALL_PROVIDERS_URL, {
      headers: {
        Accept: 'application/json',
        ...getOpenRouterDefaultHeaders(),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter all-providers HTTP ${response.status}`);
    }
    const body = (await response.json()) as
      | Array<{ slug?: string; icon?: { url?: string } }>
      | { data?: Array<{ slug?: string; icon?: { url?: string } }> };

    const rows = Array.isArray(body) ? body : body.data ?? [];
    const map = new Map<string, string>();
    for (const row of rows) {
      const slug = row.slug?.trim();
      const iconPath = row.icon?.url?.trim();
      if (!slug || !iconPath) continue;
      map.set(slug, toAbsoluteOpenRouterAsset(iconPath));
    }
    if (map.size > 0) {
      cachedIcons = map;
      cachedAt = now;
    }
    return map;
  } catch (error) {
    logServer('[openRouterProviderIcons] failed to load provider icons', error);
    return cachedIcons ?? new Map();
  }
}

export function resolveOpenRouterModelIconUrl(
  modelId: string,
  icons: Map<string, string>,
): string | null {
  const slug = openRouterProviderSlugFromModelId(modelId);
  return icons.get(slug) ?? null;
}
