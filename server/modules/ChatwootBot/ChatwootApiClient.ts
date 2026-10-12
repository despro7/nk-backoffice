/**
 * Chatwoot Application API client (reply / toggle_status / test).
 */

import { logServer } from '../../lib/utils.js';
import type { ChatwootBotConnectionTestResult } from '../../../shared/types/chatwootBot.js';

export interface ChatwootApiCredentials {
  baseUrl: string;
  accountId: number;
  apiAccessToken: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Chatwoot base URL обовʼязковий');
  return trimmed;
}

type ChatwootRawResponse = {
  status: number;
  bodyText: string;
};

async function fetchChatwootRaw(
  creds: ChatwootApiCredentials,
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ChatwootRawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        api_access_token: creds.apiAccessToken,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const bodyText = await res.text().catch(() => '');
    return { status: res.status, bodyText };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Chatwoot API timeout (15s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function accountApiUrl(creds: ChatwootApiCredentials, path: string): string {
  const base = normalizeBaseUrl(creds.baseUrl);
  return `${base}/api/v1/accounts/${creds.accountId}${path}`;
}

function isBotTokenRejected(bodyText: string): boolean {
  const lower = bodyText.toLowerCase();
  return lower.includes('not authorized for bots') || lower.includes('authorized for bots');
}

async function fetchChatwoot<T>(
  creds: ChatwootApiCredentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = accountApiUrl(creds, path);
  const { status, bodyText } = await fetchChatwootRaw(creds, url, options);

  if (!status || status < 200 || status >= 300) {
    throw new Error(`Chatwoot HTTP ${status}: ${bodyText.slice(0, 300)}`);
  }

  if (status === 204) return undefined as T;
  if (!bodyText) return undefined as T;
  return JSON.parse(bodyText) as T;
}

export class ChatwootApiClient {
  constructor(private readonly creds: ChatwootApiCredentials) {}

  async testConnection(): Promise<ChatwootBotConnectionTestResult> {
    try {
      if (!this.creds.apiAccessToken) {
        return { ok: false, message: 'API access token не налаштовано', error: 'missing_token' };
      }
      if (!this.creds.baseUrl) {
        return { ok: false, message: 'Base URL не налаштовано', error: 'missing_base_url' };
      }

      const base = normalizeBaseUrl(this.creds.baseUrl);
      const profileUrl = `${base}/api/v1/profile`;
      const profile = await fetchChatwootRaw(this.creds, profileUrl);

      if (profile.status >= 200 && profile.status < 300) {
        const raw = await fetchChatwoot<{ payload?: unknown[] } | unknown[]>(
          this.creds,
          '/inboxes',
        );
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { payload?: unknown[] })?.payload)
            ? (raw as { payload: unknown[] }).payload
            : undefined;
        const inboxCount = list?.length;
        return {
          ok: true,
          message:
            inboxCount != null
              ? `OK (користувач) — inboxes: ${inboxCount}`
              : 'OK (користувач)',
          inboxCount,
        };
      }

      const inboxesProbe = await fetchChatwootRaw(
        this.creds,
        accountApiUrl(this.creds, '/inboxes'),
      );

      if (inboxesProbe.status === 401 && isBotTokenRejected(inboxesProbe.bodyText)) {
        return {
          ok: true,
          message:
            'OK (Agent Bot) — токен дійсний. Echo/handover у live; список inboxes для ботів недоступний.',
        };
      }

      if (inboxesProbe.status === 401) {
        const snippet = inboxesProbe.bodyText.slice(0, 200);
        return {
          ok: false,
          message: 'Невірний або прострочений access token',
          error: snippet || `HTTP ${inboxesProbe.status}`,
        };
      }

      if (inboxesProbe.status >= 200 && inboxesProbe.status < 300) {
        let inboxCount: number | undefined;
        try {
          const parsed = JSON.parse(inboxesProbe.bodyText) as
            | { payload?: unknown[] }
            | unknown[];
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.payload)
              ? parsed.payload
              : undefined;
          inboxCount = list?.length;
        } catch {
          inboxCount = undefined;
        }
        return {
          ok: true,
          message:
            inboxCount != null ? `OK — inboxes: ${inboxCount}` : 'OK — зʼєднання з Chatwoot',
          inboxCount,
        };
      }

      throw new Error(
        `Chatwoot HTTP ${inboxesProbe.status}: ${inboxesProbe.bodyText.slice(0, 300)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logServer('[ChatwootApiClient] testConnection failed', err);
      return { ok: false, message: 'Зʼєднання не вдалося', error: message };
    }
  }

  async createOutgoingMessage(conversationId: number, content: string, isPrivate = false): Promise<unknown> {
    return fetchChatwoot(this.creds, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: {
        content,
        message_type: 'outgoing',
        private: isPrivate,
      },
    });
  }

  async toggleStatusOpen(conversationId: number): Promise<unknown> {
    return fetchChatwoot(this.creds, `/conversations/${conversationId}/toggle_status`, {
      method: 'POST',
      body: { status: 'open' },
    });
  }

  /** Best-effort: зняти assignee (бот / агент), якщо API дозволяє. */
  async unassignConversation(conversationId: number): Promise<void> {
    try {
      await fetchChatwoot(this.creds, `/conversations/${conversationId}/assignments`, {
        method: 'POST',
        body: { assignee_id: null },
      });
    } catch (err) {
      logServer('[ChatwootApiClient] unassignConversation skipped/failed', err);
    }
  }
}

export function createChatwootApiClient(creds: ChatwootApiCredentials): ChatwootApiClient {
  return new ChatwootApiClient(creds);
}
