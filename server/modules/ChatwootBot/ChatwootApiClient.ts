/**
 * Chatwoot Application API client (reply / toggle_status / test).
 */

import { logServer } from '../../lib/utils.js';
import type {
  ChatwootBotAgentSummary,
  ChatwootBotConnectionTestResult,
  ChatwootHandoverAssignMode,
  ChatwootInboxSchedule,
  ChatwootInboxWorkingHourSlot,
} from '../../../shared/types/chatwootBot.js';
import {
  accountApiUrl,
  fetchChatwootRaw,
  formatChatwootHttpError,
  normalizeBaseUrl,
  sanitizeChatwootApiToken,
} from './chatwootHttp.js';

export interface ChatwootAgentBotSummary {
  id: number;
  name: string;
  outgoingUrl: string | null;
  /** null — системний бот (Super Admin), API акаунта його не змінює. */
  accountId: number | null;
}

export interface ChatwootApiCredentials {
  baseUrl: string;
  accountId: number;
  apiAccessToken: string;
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
  const method = options.method || 'GET';
  const url = accountApiUrl(creds, path);
  const { status, bodyText } = await fetchChatwootRaw(creds, url, options);

  if (!status || status < 200 || status >= 300) {
    throw new Error(formatChatwootHttpError(status, path, bodyText, method));
  }

  if (status === 204) return undefined as T;
  if (!bodyText) return undefined as T;
  return JSON.parse(bodyText) as T;
}

export class ChatwootApiClient {
  constructor(private readonly creds: ChatwootApiCredentials) {}

  async testConnection(): Promise<ChatwootBotConnectionTestResult> {
    try {
      if (!sanitizeChatwootApiToken(this.creds.apiAccessToken)) {
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
              ? `OK (користувач) – inboxes: ${inboxCount}`
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
            'OK (Agent Bot) – токен дійсний. Echo/handover у live; список inboxes для ботів недоступний.',
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
            inboxCount != null ? `OK – inboxes: ${inboxCount}` : 'OK – зʼєднання з Chatwoot',
          inboxCount,
        };
      }

      throw new Error(
        formatChatwootHttpError(
          inboxesProbe.status,
          '/inboxes',
          inboxesProbe.bodyText,
          'GET',
        ),
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
        content_type: 'text',
      },
    });
  }

  /**
   * Відкрити діалог (токен Agent Bot) і призначити агента (User PAT на `this`).
   */
  async openAndAssignConversation(
    conversationId: number,
    assigneeId: number | null,
    assignMode: ChatwootHandoverAssignMode,
    statusClient: ChatwootApiClient,
  ): Promise<{ assigneeId: number | null }> {
    const isAuto = assignMode === 'auto_inbox';

    await statusClient.toggleStatusOpen(conversationId);

    if (isAuto || !assigneeId) {
      await this.unassignConversation(conversationId);
      return { assigneeId: null };
    }

    await this.assignConversation(conversationId, assigneeId);
    const verified = await this.getConversationAssigneeId(conversationId);
    if (verified !== assigneeId) {
      logServer(
        `[ChatwootApiClient] assign verify conv=${conversationId} expected=${assigneeId} got=${verified ?? 'null'}`,
      );
    }
    return { assigneeId: verified ?? assigneeId };
  }

  async getConversationAssigneeId(conversationId: number): Promise<number | null> {
    try {
      const raw = await fetchChatwoot<{
        meta?: { assignee?: { id?: number } };
        assignee_id?: number;
      }>(this.creds, `/conversations/${conversationId}`);
      const fromMeta = raw.meta?.assignee?.id;
      if (fromMeta != null && Number.isFinite(fromMeta)) return fromMeta;
      if (raw.assignee_id != null && Number.isFinite(raw.assignee_id)) return raw.assignee_id;
      return null;
    } catch (err) {
      logServer('[ChatwootApiClient] getConversationAssigneeId failed', err);
      return null;
    }
  }

  /**
   * Agent Bot handoff: pending + status open → `bot_handoff!` у Chatwoot (PR #8639).
   * Потрібен токен Agent Bot, не User PAT.
   */
  async botHandoffOpen(conversationId: number): Promise<unknown> {
    return fetchChatwoot(this.creds, `/conversations/${conversationId}/toggle_status`, {
      method: 'POST',
      body: { status: 'open' },
    });
  }

  /**
   * Увімкнути/вимкнути typing indicator у віджеті.
   * Chatwoot Agent Bot часто вмикає typing сам; якщо бот не відповідає – треба `off`.
   * @see https://developers.chatwoot.com/api-reference/conversations/toggle-typing-status
   */
  async toggleTypingStatus(
    conversationId: number,
    typingStatus: 'on' | 'off',
  ): Promise<unknown> {
    return fetchChatwoot(this.creds, `/conversations/${conversationId}/toggle_typing_status`, {
      method: 'POST',
      body: { typing_status: typingStatus, is_private: false },
    });
  }

  /** Best-effort: не кидає – Chatwoot інколи ігнорує off при human assignee. */
  async toggleTypingStatusBestEffort(
    conversationId: number,
    typingStatus: 'on' | 'off',
  ): Promise<boolean> {
    try {
      await this.toggleTypingStatus(conversationId, typingStatus);
      return true;
    } catch (err) {
      logServer(
        `[ChatwootApiClient] toggleTypingStatus ${typingStatus} failed conv=${conversationId}`,
        err,
      );
      return false;
    }
  }

  /** @deprecated Використовуйте botHandoffOpen для handover. */
  async toggleStatusOpen(conversationId: number): Promise<unknown> {
    return this.botHandoffOpen(conversationId);
  }

  async assignConversation(conversationId: number, assigneeId: number): Promise<unknown> {
    return fetchChatwoot(this.creds, `/conversations/${conversationId}/assignments`, {
      method: 'POST',
      body: { assignee_id: assigneeId },
    });
  }

  /** Зняти assignee; кидає при помилці API. */
  async unassignConversationOrThrow(conversationId: number): Promise<void> {
    await fetchChatwoot(this.creds, `/conversations/${conversationId}/assignments`, {
      method: 'POST',
      body: { assignee_id: null },
    });
  }

  /** Best-effort: зняти assignee (бот / агент), якщо API дозволяє. */
  async unassignConversation(conversationId: number): Promise<void> {
    try {
      await this.unassignConversationOrThrow(conversationId);
    } catch (err) {
      logServer('[ChatwootApiClient] unassignConversation skipped/failed', err);
    }
  }

  async mergeConversationCustomAttributes(
    conversationId: number,
    customAttributes: Record<string, unknown>,
  ): Promise<void> {
    try {
      await fetchChatwoot(this.creds, `/conversations/${conversationId}/custom_attributes`, {
        method: 'POST',
        body: { custom_attributes: customAttributes, merge: true },
      });
    } catch (err) {
      logServer('[ChatwootApiClient] mergeConversationCustomAttributes (merge) failed', err);
      try {
        await fetchChatwoot(this.creds, `/conversations/${conversationId}`, {
          method: 'PATCH',
          body: { custom_attributes: customAttributes },
        });
      } catch (patchErr) {
        logServer('[ChatwootApiClient] mergeConversationCustomAttributes (patch) failed', patchErr);
        throw patchErr;
      }
    }
  }

  async mergeConversationCustomAttributesBestEffort(
    conversationId: number,
    customAttributes: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.mergeConversationCustomAttributes(conversationId, customAttributes);
    } catch (err) {
      logServer('[ChatwootApiClient] custom attributes skipped (non-fatal)', err);
    }
  }

  async updateContact(
    contactId: number,
    fields: { phone_number?: string; name?: string },
  ): Promise<void> {
    try {
      await fetchChatwoot(this.creds, `/contacts/${contactId}`, {
        method: 'PUT',
        body: fields,
      });
    } catch (err) {
      logServer('[ChatwootApiClient] updateContact failed (non-fatal)', err);
    }
  }

  async getInboxSchedule(inboxId: number): Promise<ChatwootInboxSchedule> {
    const raw = await fetchChatwoot<{
      id: number;
      name?: string;
      working_hours_enabled?: boolean;
      timezone?: string;
      working_hours?: ChatwootInboxWorkingHourSlot[];
    }>(this.creds, `/inboxes/${inboxId}`);

    return {
      inboxId: raw.id,
      name: raw.name?.trim() || `Inbox #${inboxId}`,
      workingHoursEnabled: Boolean(raw.working_hours_enabled),
      timezone: raw.timezone?.trim() || 'UTC',
      workingHours: Array.isArray(raw.working_hours) ? raw.working_hours : [],
    };
  }

  async listConversationMessages(conversationId: number): Promise<
    Array<{
      id: number;
      createdAt: Date;
      message_type?: string | number;
      private?: boolean;
      sender?: { type?: string };
    }>
  > {
    const raw = await fetchChatwoot<
      | Array<{
          id: number;
          created_at?: number;
          message_type?: string | number;
          private?: boolean;
          sender?: { type?: string };
        }>
      | {
          payload?: Array<{
            id: number;
            created_at?: number;
            message_type?: string | number;
            private?: boolean;
            sender?: { type?: string };
          }>;
        }
    >(this.creds, `/conversations/${conversationId}/messages`);

    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.payload) ? raw.payload : [];
    return list
      .filter((m) => m && Number.isFinite(m.id))
      .map((m) => ({
        id: m.id,
        createdAt: new Date(
          typeof m.created_at === 'number' ? m.created_at * 1000 : Date.now(),
        ),
        message_type: m.message_type,
        private: m.private,
        sender: m.sender,
      }));
  }

  /** Agent Bots акаунта (потрібен User PAT адміністратора). */
  async listAgentBots(): Promise<ChatwootAgentBotSummary[]> {
    const raw = await fetchChatwoot<
      | Array<{ id: number; name?: string; outgoing_url?: string | null; account_id?: number | null }>
      | { payload?: Array<{ id: number; name?: string; outgoing_url?: string | null; account_id?: number | null }> }
    >(this.creds, '/agent_bots');
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.payload) ? raw.payload : [];
    return list
      .filter((b) => b && Number.isFinite(b.id))
      .map((b) => ({
        id: b.id,
        name: b.name ?? `#${b.id}`,
        outgoingUrl: typeof b.outgoing_url === 'string' ? b.outgoing_url : null,
        accountId: typeof b.account_id === 'number' ? b.account_id : null,
      }));
  }

  async updateAgentBotOutgoingUrl(agentBotId: number, outgoingUrl: string): Promise<void> {
    await fetchChatwoot(this.creds, `/agent_bots/${agentBotId}`, {
      method: 'PATCH',
      body: { outgoing_url: outgoingUrl },
    });
  }

  async listAgents(): Promise<ChatwootBotAgentSummary[]> {
    const raw = await fetchChatwoot<
      | Array<{
          id: number;
          name?: string;
          email?: string;
          availability_status?: string;
          role?: string;
        }>
      | { payload?: Array<{
          id: number;
          name?: string;
          email?: string;
          availability_status?: string;
          role?: string;
        }> }
    >(this.creds, '/agents');

    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.payload) ? raw.payload : [];
    return list
      .filter((a) => a && Number.isFinite(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name?.trim() || `Agent #${a.id}`,
        email: a.email ?? '',
        availabilityStatus: a.availability_status ?? 'offline',
        role: a.role ?? 'agent',
      }));
  }
}

export function createChatwootApiClient(creds: ChatwootApiCredentials): ChatwootApiClient {
  return new ChatwootApiClient(creds);
}
