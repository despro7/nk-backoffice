/** Chatwoot Bot v1 – verify session, tool DTOs (no PII). */

export type ChatwootBotVerifiedOrderItem = {
  name: string;
  sku?: string;
  quantity: number;
  price?: number;
};

export type ChatwootBotVerifiedOrderDto = {
  orderNumber: string;
  status: string;
  statusText: string;
  ttn: string;
  items: ChatwootBotVerifiedOrderItem[];
};

export type ChatwootBotOrderToolResult =
  | { verified: true; order: ChatwootBotVerifiedOrderDto }
  | {
      verified: false;
      code: 'verification_required' | 'not_found' | 'rate_limited';
      hint: string;
    };

export type ChatwootBotCatalogStockTier = 'out_of_stock' | 'exact' | 'low' | 'enough';

export type ChatwootBotCatalogItemDto = {
  name: string;
  sku: string;
  retailPrice: number | null;
  stockTier: ChatwootBotCatalogStockTier;
  /** Лише для tier exact – приблизна кількість порцій. */
  effectiveStock?: number;
};

export type ChatwootBotSitePageSource = 'wp_rest' | 'html_fallback';

export type ChatwootBotSitePageDto = {
  slug: string;
  title: string;
  excerpt: string;
  text: string;
};

export type ChatwootBotSitePagesToolResult = {
  source: ChatwootBotSitePageSource;
  fetchedAt: string;
  cachedUntil: string;
  pages: ChatwootBotSitePageDto[];
  error?: string;
};

export type ChatwootBotVerifyMethod = 'order_number' | 'last_order_date';

export type ChatwootBotVerifyAttemptResult =
  | { ok: true; orderId: number; method: ChatwootBotVerifyMethod }
  | { ok: false; reason: 'mismatch' | 'rate_limited' | 'invalid_input' };
