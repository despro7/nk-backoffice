import type { ChatwootWebhookMessageCreated } from '../../../shared/types/chatwootBot.js';

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Перший email у повідомленні клієнта (lowercase) або null. */
export function extractContactEmail(content: string): string | null {
  const match = content.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase().replace(/\.$/, '') : null;
}

export type ChatwootBotPageContext = {
  url: string;
  title?: string;
  productName?: string;
  productSku?: string;
};

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Сторінка, з якої пише клієнт: custom attributes від скрипта на сайті (`page_url`, `product_*`)
 * мають пріоритет, інакше `additional_attributes.referer` віджета (сторінка, де відкрили чат).
 */
export function extractPageContext(payload: ChatwootWebhookMessageCreated): ChatwootBotPageContext | null {
  const custom = payload.conversation?.custom_attributes ?? {};
  const additional = payload.conversation?.additional_attributes ?? {};
  const url = str(custom.page_url, 300) ?? str(additional.referer, 300);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    url,
    title: str(custom.page_title, 200),
    productName: str(custom.product_name, 200),
    productSku: str(custom.product_sku, 64),
  };
}
