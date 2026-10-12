import type { IncomingHttpHeaders } from 'http';
import {
  CHATWOOT_DELIVERY_HEADER,
  CHATWOOT_SIGNATURE_HEADER,
  CHATWOOT_TIMESTAMP_HEADER,
  CHATWOOT_WEBHOOK_SECRET_HEADER,
  type ChatwootBotWebhookHeadersMeta,
  type ChatwootWebhookAuthScheme,
} from '../../../shared/types/chatwootBot.js';

function headerPresent(headers: IncomingHttpHeaders, name: string): boolean {
  const value = headers[name];
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some((v) => String(v).trim().length > 0);
  return String(value).trim().length > 0;
}

function detectScheme(meta: Omit<ChatwootBotWebhookHeadersMeta, 'detectedScheme'>): ChatwootWebhookAuthScheme {
  if (meta.hasSignature && meta.hasTimestamp) return 'hmac';
  if (meta.hasPlainWebhookSecretHeader) return 'plain_secret';
  if (!meta.hasSignature && !meta.hasPlainWebhookSecretHeader) return 'unsigned';
  return 'unknown';
}

/** Метадані заголовків вхідного webhook (без значень secret/signature). */
export function extractWebhookHeadersMeta(headers: IncomingHttpHeaders): ChatwootBotWebhookHeadersMeta {
  const partial = {
    hasSignature: headerPresent(headers, CHATWOOT_SIGNATURE_HEADER),
    hasTimestamp: headerPresent(headers, CHATWOOT_TIMESTAMP_HEADER),
    hasDelivery: headerPresent(headers, CHATWOOT_DELIVERY_HEADER),
    hasPlainWebhookSecretHeader: headerPresent(headers, CHATWOOT_WEBHOOK_SECRET_HEADER),
  };
  return {
    ...partial,
    detectedScheme: detectScheme(partial),
  };
}
