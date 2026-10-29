import { logServer } from '../../lib/utils.js';
import {
  CHATWOOT_BOT_SITE_HTML_FALLBACK_SLUGS,
  CHATWOOT_BOT_SITE_PAGE_MAX_TEXT_CHARS,
  CHATWOOT_BOT_SITE_PAGES_CACHE_TTL_MS,
  CHATWOOT_BOT_SITE_PAGES_FETCH_MAX,
} from '../../../shared/constants/chatwootBotSitePages.js';
import { textMatchesCatalogQuery } from '../../../shared/utils/catalogNameQueryMatch.js';
import { stripHtmlToPlainText, truncateUtf8 } from '../../../shared/utils/htmlTextStrip.js';
import type {
  ChatwootBotSitePageDto,
  ChatwootBotSitePagesToolResult,
} from '../../../shared/types/chatwootBotTools.js';
import { storefrontService } from '../Storefront/StorefrontService.js';

const REQUEST_TIMEOUT_MS = 15_000;

type WpPageRow = {
  slug: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
};

type CacheEntry = {
  expiresAt: number;
  fetchedAt: number;
  source: ChatwootBotSitePagesToolResult['source'];
  pages: ChatwootBotSitePageDto[];
};

const cacheBySite = new Map<string, CacheEntry>();

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, '');
}

function mapWpPage(row: WpPageRow): ChatwootBotSitePageDto {
  const title = stripHtmlToPlainText(row.title?.rendered ?? row.slug);
  const excerpt = truncateUtf8(stripHtmlToPlainText(row.excerpt?.rendered ?? ''), 500);
  const text = truncateUtf8(
    stripHtmlToPlainText(row.content?.rendered ?? row.excerpt?.rendered ?? ''),
    CHATWOOT_BOT_SITE_PAGE_MAX_TEXT_CHARS,
  );
  return { slug: row.slug, title, excerpt, text };
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadWpPagesViaRest(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<ChatwootBotSitePageDto[]> {
  const base = normalizeSiteUrl(siteUrl);
  const pages: ChatwootBotSitePageDto[] = [];
  let pageNum = 1;
  const perPage = 100;

  while (pages.length < CHATWOOT_BOT_SITE_PAGES_FETCH_MAX) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(pageNum),
      status: 'publish',
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    });
    const url = `${base}/wp-json/wp/v2/pages?${params.toString()}`;
    let batch: WpPageRow[];
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      batch = (await res.json()) as WpPageRow[];
    } catch (err) {
      if (pageNum === 1) throw err;
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) {
      if (!row.slug) continue;
      pages.push(mapWpPage(row));
      if (pages.length >= CHATWOOT_BOT_SITE_PAGES_FETCH_MAX) break;
    }
    if (batch.length < perPage) break;
    pageNum += 1;
  }

  return pages;
}

async function fetchHtmlPageText(siteUrl: string, slugPath: string): Promise<ChatwootBotSitePageDto | null> {
  const base = normalizeSiteUrl(siteUrl);
  const path = slugPath ? `/${slugPath.replace(/^\/+/, '')}/` : '/';
  const url = `${base}${path}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || slugPath || 'home';
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const text = truncateUtf8(
      stripHtmlToPlainText(bodyMatch?.[1] ?? html),
      CHATWOOT_BOT_SITE_PAGE_MAX_TEXT_CHARS,
    );
    const slug = slugPath || 'home';
    return { slug, title, excerpt: truncateUtf8(text, 400), text };
  } catch (error) {
    logServer('[ChatwootBotStorefrontSite] html fallback failed', { url, error });
    return null;
  }
}

async function loadPagesHtmlFallback(siteUrl: string): Promise<ChatwootBotSitePageDto[]> {
  const results: ChatwootBotSitePageDto[] = [];
  for (const slug of CHATWOOT_BOT_SITE_HTML_FALLBACK_SLUGS) {
    const row = await fetchHtmlPageText(siteUrl, slug);
    if (row) results.push(row);
  }
  return results;
}

async function loadAllPages(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<{
  source: ChatwootBotSitePagesToolResult['source'];
  pages: ChatwootBotSitePageDto[];
}> {
  try {
    const pages = await loadWpPagesViaRest(siteUrl, consumerKey, consumerSecret);
    return { source: 'wp_rest', pages };
  } catch (error) {
    logServer('[ChatwootBotStorefrontSite] WP REST failed, trying HTML fallback', error);
  }
  const pages = await loadPagesHtmlFallback(siteUrl);
  return { source: 'html_fallback', pages };
}

function parseSlugsArg(slugs: unknown): string[] | undefined {
  if (Array.isArray(slugs)) {
    return slugs.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof slugs === 'string' && slugs.trim()) {
    return slugs
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export class ChatwootBotStorefrontSiteToolService {
  async listSitePages(params: {
    query?: string;
    slugs?: unknown;
    limit?: number;
  }): Promise<ChatwootBotSitePagesToolResult> {
    const limit = Math.max(1, Math.min(20, params.limit ?? 10));
    const slugFilter = parseSlugsArg(params.slugs);
    const q = params.query?.trim() ?? '';

    const settings = await storefrontService.getSettings();
    const woo = settings.wooCommerce;
    if (!woo.enabled || !woo.siteUrl.trim()) {
      return {
        source: 'html_fallback',
        fetchedAt: new Date().toISOString(),
        cachedUntil: new Date().toISOString(),
        pages: [],
        error: 'storefront_disabled_or_no_site_url',
      };
    }

    let creds: { siteUrl: string; consumerKey: string; consumerSecret: string };
    try {
      creds = await storefrontService.getWooCredentialsInternal();
    } catch {
      return {
        source: 'html_fallback',
        fetchedAt: new Date().toISOString(),
        cachedUntil: new Date().toISOString(),
        pages: [],
        error: 'woocommerce_credentials_missing',
      };
    }

    const siteKey = normalizeSiteUrl(creds.siteUrl);
    const now = Date.now();
    let entry = cacheBySite.get(siteKey);
    if (!entry || now >= entry.expiresAt) {
      const loaded = await loadAllPages(siteKey, creds.consumerKey, creds.consumerSecret);
      entry = {
        fetchedAt: now,
        expiresAt: now + CHATWOOT_BOT_SITE_PAGES_CACHE_TTL_MS,
        source: loaded.source,
        pages: loaded.pages,
      };
      cacheBySite.set(siteKey, entry);
    }

    let filtered = entry.pages;
    if (slugFilter?.length) {
      const set = new Set(slugFilter.map((s) => s.toLowerCase()));
      filtered = filtered.filter((p) => set.has(p.slug.toLowerCase()));
    }
    if (q) {
      filtered = filtered.filter((p) =>
        textMatchesCatalogQuery(q, p.title, p.slug, p.excerpt, p.text),
      );
    }

    return {
      source: entry.source,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      cachedUntil: new Date(entry.expiresAt).toISOString(),
      pages: filtered.slice(0, limit),
    };
  }

  clearCache(): void {
    cacheBySite.clear();
  }
}

export const chatwootBotStorefrontSiteToolService = new ChatwootBotStorefrontSiteToolService();
