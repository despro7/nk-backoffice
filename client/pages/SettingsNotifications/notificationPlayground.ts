import { findMatchingRule, renderNotification } from '@shared/notifications/ruleEngine';
import { resolveSource, resolveVia } from '@shared/notifications/feedPresentation';
import type {
  NotificationGlossaryEntry,
  NotificationRuleDef,
  NotificationSourceLog,
  RenderedNotification,
} from '@shared/types/notificationRules';
import type { NotificationRawLog } from '@shared/types/notificationSettings';
import type { NotificationFeedItem } from '@shared/types/notifications';

export function toSourceLog(raw: NotificationRawLog): NotificationSourceLog {
  return {
    id: raw.id,
    category: raw.category,
    status: raw.status,
    title: raw.title,
    message: raw.message,
    orderNumber: raw.orderNumber,
    initiatedBy: raw.initiatedBy,
    data: raw.data,
    actorName: raw.actorName,
  };
}

/** Рядок дропдауну з сирого запису (як його побачить користувач). */
export function previewItem(raw: NotificationRawLog, rendered: RenderedNotification): NotificationFeedItem {
  const recipients = (raw.data as { recipients?: unknown } | null)?.recipients;
  return {
    id: raw.id,
    ids: [raw.id],
    count: 1,
    kind: rendered.kind,
    group: rendered.group,
    level: rendered.level,
    title: rendered.title,
    message: rendered.message,
    createdAt: raw.createdAt,
    read: false,
    archived: null,
    addressed: Array.isArray(recipients),
    mine: false,
    orderNumber: raw.orderNumber,
    category: raw.category,
    source: resolveSource({ category: raw.category, actorUserId: raw.actorUserId, actorName: raw.actorName }),
    via: resolveVia(raw.initiatedBy),
    action: rendered.actionLink && rendered.actionLabel ? { label: rendered.actionLabel, link: rendered.actionLink } : null,
    ruleId: rendered.ruleId,
    ruleName: rendered.ruleName,
  };
}

export function render(raw: NotificationRawLog, rules: NotificationRuleDef[], glossary: NotificationGlossaryEntry[]) {
  return renderNotification(toSourceLog(raw), rules, glossary);
}

/** Правила з чернеткою замість оригіналу (або доданою в кінець, якщо нова). */
export function withDraft(rules: NotificationRuleDef[], draft: NotificationRuleDef): NotificationRuleDef[] {
  if (draft.id != null && rules.some((r) => r.id === draft.id)) {
    return rules.map((r) => (r.id === draft.id ? draft : r));
  }
  const maxPos = rules.reduce((m, r) => Math.max(m, r.position), 0);
  return [...rules, { ...draft, position: draft.position || maxPos + 10 }];
}

/** Записи, які в наборі з чернеткою обробляє саме чернетка. */
export function logsHandledBy(
  draft: NotificationRuleDef,
  rules: NotificationRuleDef[],
  logs: NotificationRawLog[],
): NotificationRawLog[] {
  const set = withDraft(rules, draft);
  const target = set.find((r) => r === draft || (draft.id != null && r.id === draft.id)) ?? draft;
  return logs.filter((log) => findMatchingRule(toSourceLog(log), set)?.rule === target);
}

/** Записи, які чернетка ловила б, якби стояла першою (щоб бачити перекриття іншими правилами). */
export function logsMatchedAnywhere(draft: NotificationRuleDef, logs: NotificationRawLog[]): NotificationRawLog[] {
  const solo = [{ ...draft, enabled: true, position: 0 }];
  return logs.filter((log) => findMatchingRule(toSourceLog(log), solo) !== null);
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function emptyRule(): NotificationRuleDef {
  return {
    name: '',
    enabled: true,
    position: 0,
    match: {},
    output: { visibility: 'show' },
  };
}

/** Чернетка правила з прикладу запису (категорія, статус, точний заголовок). */
export function ruleFromSample(raw: Pick<NotificationRawLog, 'category' | 'status' | 'title'>): NotificationRuleDef {
  const level = raw.status === 'error' || raw.status === 'warning' || raw.status === 'success' ? raw.status : 'info';
  return {
    ...emptyRule(),
    name: raw.title ? raw.title.slice(0, 120) : raw.category,
    match: {
      categories: [raw.category],
      statuses: [level],
      ...(raw.title ? { title: `^${escapeRegex(raw.title)}$` } : {}),
    },
  };
}

/** Іменовані групи з regex правила – підказка змінних для шаблонів. */
export function namedGroups(rule: NotificationRuleDef): string[] {
  const out = new Set<string>();
  for (const p of [rule.match.title, rule.match.message, rule.match.initiatedBy]) {
    if (!p) continue;
    for (const m of p.matchAll(/\(\?<([A-Za-z_]\w*)>/g)) out.add(m[1]);
  }
  return [...out];
}

export const BASE_TEMPLATE_VARS = ['message', 'title', 'orderNumber', 'actor', 'category', 'rawMessage', 'rawTitle'];

export function describeMatch(rule: NotificationRuleDef): string {
  const parts: string[] = [];
  if (rule.match.categories?.length) parts.push(rule.match.categories.join(', '));
  if (rule.match.statuses?.length) parts.push(rule.match.statuses.join('/'));
  if (rule.match.title) parts.push(`заголовок ~ ${rule.match.title}`);
  if (rule.match.message) parts.push(`текст ~ ${rule.match.message}`);
  if (rule.match.initiatedBy) parts.push(`ініціатор ~ ${rule.match.initiatedBy}`);
  if (rule.match.dataHas) parts.push(`data.${rule.match.dataHas}`);
  return parts.join(' · ') || 'Будь-який запис';
}
