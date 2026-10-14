/**
 * Спільний HTTP-шар для Chatwoot API: auth, retry, зрозумілі помилки.
 */

import type { ChatwootApiCredentials } from './ChatwootApiClient.js';

export const CHATWOOT_REQUEST_TIMEOUT_MS = 15_000;

const RETRYABLE_HTTP_STATUS = new Set([408, 429, 502, 503, 504]);

export type ChatwootRawResponse = {
  status: number;
  bodyText: string;
};

export function sanitizeChatwootApiToken(token: string): string {
  return token.replace(/[\r\n\t]/g, '').trim();
}

export function normalizeBaseUrl(baseUrl: string): string {
  let trimmed = baseUrl.trim().replace(/\/+$/, '');
  trimmed = trimmed.replace(/\/app\/?$/i, '');
  if (!trimmed) throw new Error('Chatwoot base URL обовʼязковий');
  return trimmed;
}

export function buildChatwootAuthHeaders(token: string): Record<string, string> {
  const clean = sanitizeChatwootApiToken(token);
  if (!clean) {
    return {};
  }
  // Self-hosted nginx інколи відповідає HTML 400 на подвійну auth; Chatwoot приймає api_access_token.
  return {
    api_access_token: clean,
    'User-Agent': 'NK-Backoffice-ChatwootBot/1',
  };
}

function isHtmlErrorBody(bodyText: string): boolean {
  const trimmed = bodyText.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function summarizeHtmlError(status: number, bodyText: string): string {
  const titleMatch = bodyText.match(/<title>\s*([^<]+)\s*<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();
  const hint =
    status === 400
      ? 'проксі/nginx відхилив запит (часто паралельні виклики або невірний URL API)'
      : 'HTML-відповідь замість JSON API';
  return title ? `${hint}: ${title}` : hint;
}

export function formatChatwootHttpError(
  status: number,
  path: string,
  bodyText: string,
  method = 'GET',
): string {
  const trimmed = bodyText.trim();
  if (isHtmlErrorBody(trimmed)) {
    return (
      `Chatwoot HTTP ${status} ${method} ${path} — ${summarizeHtmlError(status, trimmed)}. ` +
      `Перевірте base URL (шлях /api/v1/...), User PAT для assign і що інстанс не віддає фронт замість API.`
    );
  }
  const snippet = trimmed.slice(0, 400);
  return `Chatwoot HTTP ${status} ${method} ${path}: ${snippet || '(empty body)'}`;
}

function isRetryableResponse(status: number, bodyText: string): boolean {
  if (RETRYABLE_HTTP_STATUS.has(status)) return true;
  if (status === 400 && isHtmlErrorBody(bodyText)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchChatwootRaw(
  creds: ChatwootApiCredentials,
  url: string,
  options: { method?: string; body?: unknown; maxRetries?: number } = {},
): Promise<ChatwootRawResponse> {
  const method = options.method || 'GET';
  const maxRetries = options.maxRetries ?? 3;
  const token = sanitizeChatwootApiToken(creds.apiAccessToken);
  if (!token) {
    throw new Error('Chatwoot API access token не налаштовано');
  }

  let last: ChatwootRawResponse = { status: 0, bodyText: '' };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHATWOOT_REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...buildChatwootAuthHeaders(token),
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const bodyText = await res.text().catch(() => '');
      last = { status: res.status, bodyText };

      if (attempt < maxRetries && isRetryableResponse(res.status, bodyText)) {
        await sleep(150 * (attempt + 1));
        continue;
      }

      return last;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Chatwoot API timeout (15s)');
      }
      if (attempt < maxRetries) {
        await sleep(150 * (attempt + 1));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}

export function accountApiUrl(creds: ChatwootApiCredentials, path: string): string {
  const base = normalizeBaseUrl(creds.baseUrl);
  return `${base}/api/v1/accounts/${creds.accountId}${path}`;
}
