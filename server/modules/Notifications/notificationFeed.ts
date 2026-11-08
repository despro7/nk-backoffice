/**
 * Pure feed assembly for the Notification Centre (no DB): visibility per user, tabs,
 * collapsing of repeated notifications, unread counters.
 */

import { hasPermission } from '../../../shared/constants/permissions.js';
import {
  notifyPermissionKey,
  type NotificationGroupId,
} from '../../../shared/constants/notifications.js';
import type { RenderedNotification } from '../../../shared/types/notificationRules.js';
import type {
  NotificationArchiveState,
  NotificationFeedCounts,
  NotificationFeedItem,
  NotificationServiceId,
  NotificationSource,
  NotificationTab,
} from '../../../shared/types/notifications.js';

/** Структура readBy / hiddenBy: { "<userId>": ISO, "_all": ISO }. */
export type ReadByMap = Record<string, string>;

export function parseReadBy(raw: unknown): ReadByMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ReadByMap;
}

/** Рядок meta_logs, уже прогнаний через рушій правил (не залежить від користувача). */
export interface PreparedLog {
  id: number;
  createdAt: string;
  category: string;
  orderNumber: string | null;
  initiatedBy: string | null;
  rendered: RenderedNotification;
  /** data.recipients; null – не адресне. */
  recipients: number[] | null;
  actorUserId: number | null;
  actorName: string | null;
}

/** Стан прочитання/архіву – змінюється часто, тому окремо від PreparedLog. */
export interface LogUserState {
  readBy: ReadByMap;
  hiddenBy: ReadByMap;
}

export interface FeedViewer {
  userId: number;
  isAdmin: boolean;
  permissions: ReadonlySet<string>;
}

const CATEGORY_SERVICE: Record<string, NotificationServiceId> = {
  dilovod: 'dilovod',
  'dilovod-export': 'dilovod',
  product_sync: 'sync',
  orders_sync: 'sync',
  salesdrive: 'salesdrive',
  warehouse: 'warehouse',
  warehouse_movement: 'warehouse',
  catalog_spec: 'products',
  products: 'products',
  assembly: 'assembly',
};

const SERVICE_LABELS: Record<NotificationServiceId, string> = {
  dilovod: 'Діловод',
  salesdrive: 'SalesDrive',
  sync: 'Синхронізація',
  warehouse: 'Склад',
  products: 'Товари',
  assembly: 'Збірка',
  cron: 'Планове завдання',
  webhook: 'Webhook',
  system: 'Система',
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

export function resolveSource(log: Pick<PreparedLog, 'category' | 'actorUserId' | 'actorName'>): NotificationSource {
  if (log.actorUserId != null && log.actorName) {
    return { type: 'user', userId: log.actorUserId, name: log.actorName, initials: initialsOf(log.actorName) };
  }
  const id = CATEGORY_SERVICE[log.category] ?? 'system';
  return { type: 'service', id, label: SERVICE_LABELS[id] };
}

/** Звідки прийшов запуск (для підпису «через …»). */
export function resolveVia(initiatedBy: string | null): string | null {
  if (!initiatedBy) return null;
  if (/salesdrive/i.test(initiatedBy)) return 'SalesDrive';
  if (initiatedBy.startsWith('cron:')) return 'за розкладом';
  if (initiatedBy.startsWith('webhook:')) return 'webhook';
  return null;
}

export function isReadBy(map: ReadByMap, userId: number): boolean {
  return `${userId}` in map || '_all' in map;
}

function archiveState(hiddenBy: ReadByMap, userId: number): NotificationArchiveState {
  if ('_all' in hiddenBy) return 'resolved';
  if (`${userId}` in hiddenBy) return 'mine';
  return null;
}

/** Чи бачить користувач запис у дропдауні (без урахування архіву). */
export function canSee(log: PreparedLog, viewer: FeedViewer): { visible: boolean; addressed: boolean } {
  if (!log.rendered.visible) return { visible: false, addressed: false };
  if (log.category === 'user_report' && !viewer.isAdmin) return { visible: false, addressed: false };
  if (log.recipients) {
    const addressed = log.recipients.includes(viewer.userId);
    // Адресні сповіщення приходять лише адресатам і незалежно від матриці ролі.
    return { visible: addressed, addressed };
  }
  if (viewer.isAdmin) return { visible: true, addressed: false };
  const key = notifyPermissionKey(log.rendered.group as NotificationGroupId, log.rendered.level, 'app');
  return { visible: hasPermission(viewer.permissions, key), addressed: false };
}

function toItem(log: PreparedLog, state: LogUserState, viewer: FeedViewer, addressed: boolean): NotificationFeedItem {
  const r = log.rendered;
  return {
    id: log.id,
    ids: [log.id],
    count: 1,
    kind: r.kind,
    group: r.group,
    level: r.level,
    title: r.title,
    message: r.message,
    createdAt: log.createdAt,
    read: isReadBy(state.readBy, viewer.userId),
    archived: archiveState(state.hiddenBy, viewer.userId),
    addressed,
    mine: addressed || (log.actorUserId != null && log.actorUserId === viewer.userId),
    orderNumber: log.orderNumber,
    category: log.category,
    source: resolveSource(log),
    via: resolveVia(log.initiatedBy),
    action: r.actionLink && r.actionLabel ? { label: r.actionLabel, link: r.actionLink } : null,
    ruleId: r.ruleId,
    ruleName: viewer.isAdmin ? r.ruleName : null,
  };
}

function dedupeKey(item: NotificationFeedItem): string {
  return [item.archived ?? '-', item.ruleId ?? '-', item.group, item.title, item.message, item.orderNumber ?? ''].join('\u0001');
}

/** Згортає однакові сповіщення в один рядок (найновіший зверху, лічильник повторів). */
export function collapseRepeats(items: NotificationFeedItem[]): NotificationFeedItem[] {
  const byKey = new Map<string, NotificationFeedItem>();
  const out: NotificationFeedItem[] = [];
  for (const item of items) {
    const key = dedupeKey(item);
    const head = byKey.get(key);
    if (!head) {
      const copy = { ...item, ids: [...item.ids] };
      byKey.set(key, copy);
      out.push(copy);
      continue;
    }
    head.ids.push(...item.ids);
    head.count += item.count;
    head.read = head.read && item.read;
  }
  return out;
}

export function matchesTab(item: NotificationFeedItem, tab: NotificationTab): boolean {
  if (tab === 'archive') return item.archived !== null;
  if (item.archived !== null) return false;
  if (tab === 'mine') return item.mine;
  if (tab === 'errors') return item.level === 'error' || item.level === 'warning';
  return true;
}

export interface BuiltFeed {
  data: NotificationFeedItem[];
  counts: NotificationFeedCounts;
}

/** logs – від нових до старих. */
export function buildFeed(
  logs: PreparedLog[],
  states: Map<number, LogUserState>,
  viewer: FeedViewer,
  tab: NotificationTab,
  limit: number,
): BuiltFeed {
  const items: NotificationFeedItem[] = [];
  for (const log of logs) {
    const { visible, addressed } = canSee(log, viewer);
    if (!visible) continue;
    const state = states.get(log.id) ?? { readBy: {}, hiddenBy: {} };
    items.push(toItem(log, state, viewer, addressed));
  }
  const collapsed = collapseRepeats(items);
  const unread = (t: NotificationTab) => collapsed.filter((i) => matchesTab(i, t) && !i.read).length;
  return {
    data: collapsed.filter((i) => matchesTab(i, tab)).slice(0, limit),
    counts: {
      all: unread('all'),
      mine: unread('mine'),
      errors: unread('errors'),
      archive: collapsed.filter((i) => matchesTab(i, 'archive')).length,
    },
  };
}
