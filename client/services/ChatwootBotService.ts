import type {
  ChatwootBotAgentSummary,
  ChatwootBotConnectionTestResult,
  ChatwootBotEventRecord,
  ChatwootInboxHoursStatus,
  ChatwootBotSettingsResponse,
  ChatwootBotSettingsUpdate,
  ChatwootBotAnalyticsOverview,
} from '@shared/types/chatwootBot';
import type {
  ChatwootBotCatalogItemDto,
  ChatwootBotVerifiedOrderDto,
} from '@shared/types/chatwootBotTools';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data.data as T;
}

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

  async probeOutgoingWebhook(): Promise<{
    postUrl: string;
    httpStatus: number;
    ok: boolean;
    bodyPreview: string;
    hint: string;
  }> {
    const res = await fetch('/api/chatwoot-bot/probe-outgoing-webhook', {
      method: 'POST',
      credentials: 'include',
    });
    return parseJson(res);
  },

  async getWebhookProcessorHealth(): Promise<{
    localBuild: string;
    localProcessor?: string | null;
    localHost?: string | null;
    targetHealthUrl: string | null;
    targetBuild: string | null;
    targetProcessor?: string | null;
    targetHost?: string | null;
    tunnelPointsHere?: boolean;
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

  /** Debug: зняти assignee у Chatwoot + скинути bot_human_handover_active. */
  async unassignConversation(conversationId: number): Promise<{
    conversationId: number;
    unassigned: boolean;
    humanHandoverAttrCleared: boolean;
    typingOff: 'ok' | 'fail' | 'skipped';
  }> {
    const res = await fetch(`/api/chatwoot-bot/conversations/${conversationId}/unassign`, {
      method: 'POST',
      credentials: 'include',
    });
    return parseJson(res);
  },

  async testCatalog(query?: string, limit?: number): Promise<ChatwootBotCatalogItemDto[]> {
    const res = await fetch('/api/chatwoot-bot/tools/catalog', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    return parseJson(res);
  },

  async verifyOrderTest(phone: string, orderNumber: string): Promise<{
    verified: boolean;
    order?: ChatwootBotVerifiedOrderDto;
    message?: string;
    reason?: string;
  }> {
    const res = await fetch('/api/chatwoot-bot/tools/verify-order', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, orderNumber }),
    });
    return parseJson(res);
  },

  async verifyByDateTest(phone: string, lastOrderDate: string): Promise<{
    verified: boolean;
    order?: ChatwootBotVerifiedOrderDto;
    message?: string;
    reason?: string;
  }> {
    const res = await fetch('/api/chatwoot-bot/tools/verify-by-date', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, lastOrderDate }),
    });
    return parseJson(res);
  },

  async testAi(message: string): Promise<{ reply: string }> {
    const res = await fetch('/api/chatwoot-bot/ai/test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return parseJson(res);
  },

  async getAnalyticsOverview(from?: string, to?: string): Promise<ChatwootBotAnalyticsOverview> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/chatwoot-bot/analytics/overview${qs}`, {
      credentials: 'include',
    });
    return parseJson(res);
  },
};
