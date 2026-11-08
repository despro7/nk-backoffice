import type { NotificationGlossaryEntry, NotificationRuleDef } from '@shared/types/notificationRules';
import type {
  NotificationConfigRevisionDto,
  NotificationRawLog,
  NotificationSourceSummary,
} from '@shared/types/notificationSettings';
import type { NotificationFeedCounts, NotificationFeedItem, NotificationTab } from '@shared/types/notifications';

export class NotificationSettingsApiError extends Error {
  constructor(message: string, public details: string[] = []) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api/notification-settings${path}`, {
    credentials: 'include',
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new NotificationSettingsApiError(data.error || data.message || `HTTP ${res.status}`, data.details ?? []);
  }
  return data.data as T;
}

export const notificationSettingsApi = {
  rules: () => call<NotificationRuleDef[]>('/rules'),
  createRule: (rule: Partial<NotificationRuleDef>) => call<NotificationRuleDef>('/rules', { method: 'POST', json: rule }),
  updateRule: (id: number, rule: Partial<NotificationRuleDef>) => call<NotificationRuleDef>(`/rules/${id}`, { method: 'PUT', json: rule }),
  setRuleEnabled: (id: number, enabled: boolean) => call<NotificationRuleDef[]>(`/rules/${id}/enabled`, { method: 'PATCH', json: { enabled } }),
  deleteRule: (id: number) => call<null>(`/rules/${id}`, { method: 'DELETE' }),
  reorderRules: (ids: number[]) => call<NotificationRuleDef[]>('/rules/reorder', { method: 'PUT', json: { ids } }),
  resetRule: (id: number) => call<NotificationRuleDef>(`/rules/${id}/reset`, { method: 'POST' }),

  glossary: () => call<NotificationGlossaryEntry[]>('/glossary'),
  createGlossary: (entry: Partial<NotificationGlossaryEntry>) => call<NotificationGlossaryEntry>('/glossary', { method: 'POST', json: entry }),
  updateGlossary: (id: number, entry: Partial<NotificationGlossaryEntry>) => call<NotificationGlossaryEntry>(`/glossary/${id}`, { method: 'PUT', json: entry }),
  deleteGlossary: (id: number) => call<null>(`/glossary/${id}`, { method: 'DELETE' }),

  revisions: () => call<NotificationConfigRevisionDto[]>('/revisions'),
  revert: (id: number) => call<null>(`/revisions/${id}/revert`, { method: 'POST' }),

  sources: (days = 90) => call<NotificationSourceSummary[]>(`/sources?days=${days}`),
  logs: (params: { search?: string; category?: string; status?: string; limit?: number; ids?: number[] } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    if (params.status) qs.set('status', params.status);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.ids?.length) qs.set('ids', params.ids.join(','));
    return call<NotificationRawLog[]>(`/logs?${qs}`);
  },
  previewFeed: (role: string, tab: NotificationTab) =>
    call<{ data: NotificationFeedItem[]; counts: NotificationFeedCounts }>(`/preview-feed?role=${encodeURIComponent(role)}&tab=${tab}`),
};
