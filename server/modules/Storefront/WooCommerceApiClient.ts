/**
 * WooCommerce REST API client (wc/v3).
 */

import { logServer } from '../../lib/utils.js';
import type {
  WooCommerceProduct,
  WooCommerceProductCategory,
  WooConnectionTestResult,
} from '../../../shared/types/storefront.js';

export interface WooCommerceCredentials {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

function normalizeSiteUrl(siteUrl: string): string {
  const trimmed = siteUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('URL магазину обовʼязковий');
  return trimmed;
}

function buildApiUrl(creds: WooCommerceCredentials, path: string, query?: Record<string, string>): string {
  const base = `${normalizeSiteUrl(creds.siteUrl)}/wp-json/wc/v3${path}`;
  const params = new URLSearchParams({
    consumer_key: creds.consumerKey,
    consumer_secret: creds.consumerSecret,
    ...(query || {}),
  });
  return `${base}?${params.toString()}`;
}

async function fetchWc<T>(
  creds: WooCommerceCredentials,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = buildApiUrl(creds, path, options.query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 429) {
      logServer('[WooCommerceApiClient] rate limited, retrying…');
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await fetch(url, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      if (!retry.ok) {
        const text = await retry.text().catch(() => '');
        throw new Error(`WooCommerce HTTP ${retry.status}: ${text.slice(0, 200)}`);
      }
      return (await retry.json()) as T;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WooCommerce HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('WooCommerce API timeout (15s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class WooCommerceApiClient {
  constructor(private readonly creds: WooCommerceCredentials) {}

  async testConnection(): Promise<WooConnectionTestResult> {
    try {
      const products = await fetchWc<WooCommerceProduct[]>(this.creds, '/products', {
        query: { per_page: '1' },
      });
      let wcVersion: string | undefined;
      try {
        const statusUrl = `${normalizeSiteUrl(this.creds.siteUrl)}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(this.creds.consumerKey)}&consumer_secret=${encodeURIComponent(this.creds.consumerSecret)}`;
        const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (statusRes.ok) {
          const status = (await statusRes.json()) as { environment?: { version?: string } };
          wcVersion = status.environment?.version;
        }
      } catch {
        // optional
      }
      return { ok: true, wcVersion, productCount: products.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[WooCommerceApiClient] testConnection failed', err);
      return { ok: false, error: message };
    }
  }

  async getProductBySku(sku: string): Promise<WooCommerceProduct | null> {
    const rows = await fetchWc<WooCommerceProduct[]>(this.creds, '/products', {
      query: { sku, per_page: '1' },
    });
    return rows[0] ?? null;
  }

  async getProductById(id: number): Promise<WooCommerceProduct | null> {
    try {
      return await fetchWc<WooCommerceProduct>(this.creds, `/products/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('404') || message.includes('woocommerce_rest_product_invalid_id')) {
        return null;
      }
      throw err;
    }
  }

  async updateProduct(id: number, payload: Record<string, unknown>): Promise<WooCommerceProduct> {
    return fetchWc<WooCommerceProduct>(this.creds, `/products/${id}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async createProduct(payload: Record<string, unknown>): Promise<WooCommerceProduct> {
    return fetchWc<WooCommerceProduct>(this.creds, '/products', {
      method: 'POST',
      body: payload,
    });
  }

  async findProductCategoryByName(name: string): Promise<WooCommerceProductCategory | null> {
    const rows = await fetchWc<WooCommerceProductCategory[]>(this.creds, '/products/categories', {
      query: { search: name.trim(), per_page: '100' },
    });
    const normalized = name.trim().toLowerCase();
    return rows.find((row) => row.name.trim().toLowerCase() === normalized) ?? null;
  }

  async createProductCategory(payload: {
    name: string;
    parent?: number;
  }): Promise<WooCommerceProductCategory> {
    return fetchWc<WooCommerceProductCategory>(this.creds, '/products/categories', {
      method: 'POST',
      body: payload,
    });
  }

  async batchUpdateProducts(
    updates: Array<{ id: number; manage_stock: boolean; stock_quantity: number; stock_status: 'instock' | 'outofstock' }>,
  ): Promise<{ update?: WooCommerceProduct[] }> {
    if (updates.length === 0) return { update: [] };
    return fetchWc<{ update?: WooCommerceProduct[] }>(this.creds, '/products/batch', {
      method: 'POST',
      body: { update: updates },
    });
  }

  async listMedia(perPage = 100, page = 1): Promise<Array<{ id: number; src: string; title?: { rendered?: string } }>> {
    const wpBase = `${normalizeSiteUrl(this.creds.siteUrl)}/wp-json/wp/v2/media`;
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    const res = await fetch(`${wpBase}?${params}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.creds.consumerKey}:${this.creds.consumerSecret}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WP Media HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as Array<{ id: number; src: string; title?: { rendered?: string } }>;
  }

  async deleteMedia(id: number): Promise<void> {
    const wpBase = `${normalizeSiteUrl(this.creds.siteUrl)}/wp-json/wp/v2/media/${id}?force=true`;
    const res = await fetch(wpBase, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.creds.consumerKey}:${this.creds.consumerSecret}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WP Media delete HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  async uploadMedia(filePath: string, fileName: string, mimeType: string, buffer: Buffer): Promise<number> {
    const wpBase = `${normalizeSiteUrl(this.creds.siteUrl)}/wp-json/wp/v2/media`;
    const res = await fetch(wpBase, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.creds.consumerKey}:${this.creds.consumerSecret}`).toString('base64')}`,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WP Media upload HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { id: number };
    return json.id;
  }
}

export function createWooCommerceClient(creds: WooCommerceCredentials): WooCommerceApiClient {
  return new WooCommerceApiClient(creds);
}
