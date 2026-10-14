import type {
  ChatwootBotAgentSummary,
  ChatwootBotConnectionTestResult,
  ChatwootBotEventRecord,
  ChatwootInboxHoursStatus,
  ChatwootBotProcessResult,
  ChatwootBotSettingsResponse,
  ChatwootBotSettingsUpdate,
  ChatwootWebhookMessageCreated,
} from '@shared/types/chatwootBot';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data.data as T;
}

export type ChatwootBotSimulateInput =
  | { fixture: 'echo' | 'handover'; overrides?: Partial<ChatwootWebhookMessageCreated> }
  | ChatwootWebhookMessageCreated;

export const chatwootBotApi = {
  async getSettings(revealSecrets = false): Promise<ChatwootBotSettingsResponse> {
    const qs = revealSecrets ? '?revealSecrets=true' : '';
    const res = await fetch(`/api/chatwoot-bot/settings${qs}`, { credentials: 'include' });
    return parseJson(res);
  },

  async updateSettings(input: ChatwootBotSettingsUpdate): Promise<ChatwootBotSettingsResponse> {
    const res = await fetch('/api/chatwoot-bot/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async getWebhookProcessorHealth(): Promise<{
    localBuild: string;
    targetHealthUrl: string | null;
    targetBuild: string | null;
    mismatch: boolean;
    fetchError?: string | null;
    message: string;
  }> {
    const res = await fetch('/api/chatwoot-bot/webhook-processor-health', { credentials: 'include' });
    return parseJson(res);
  },

  async testConnection(): Promise<ChatwootBotConnectionTestResult> {
    const res = await fetch('/api/chatwoot-bot/test-connection', {
      method: 'POST',
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      return (
        json.data ?? {
          ok: false,
          message: json.message || 'Test failed',
          error: json.error || `HTTP ${res.status}`,
        }
      );
    }
    return json.data as ChatwootBotConnectionTestResult;
  },

  async clearRecentEvents(): Promise<number> {
    const res = await fetch('/api/chatwoot-bot/recent-events', {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = (await res.json()) as { success?: boolean; data?: { deleted?: number }; error?: string };
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data.data?.deleted ?? 0;
  },

  async getInboxSchedule(inboxId: number): Promise<ChatwootInboxHoursStatus | null> {
    const res = await fetch(`/api/chatwoot-bot/inbox-schedule?inboxId=${inboxId}`, {
      credentials: 'include',
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: ChatwootInboxHoursStatus;
    };
    if (!res.ok || json.success === false || !json.data) {
      return null;
    }
    return json.data;
  },

  async listAgents(): Promise<ChatwootBotAgentSummary[]> {
    const res = await fetch('/api/chatwoot-bot/agents', { credentials: 'include' });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      return [];
    }
    return (json.data ?? []) as ChatwootBotAgentSummary[];
  },

  async recentEvents(limit = 20): Promise<ChatwootBotEventRecord[]> {
    const res = await fetch(`/api/chatwoot-bot/recent-events?limit=${limit}`, {
      credentials: 'include',
    });
    return parseJson(res);
  },

  async simulate(input: ChatwootBotSimulateInput): Promise<ChatwootBotProcessResult> {
    const res = await fetch('/api/webhooks/chatwoot/simulate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },
};
