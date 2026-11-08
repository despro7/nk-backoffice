/**
 * Personal notification preferences (gear in the dropdown): muted groups in the app,
 * Telegram opt-outs per group, sound. A user can only narrow what the role allows.
 */

import { nowIso, userPrefsStore } from './notificationStores.js';
import { hasPermission } from '../../../shared/constants/permissions.js';
import {
  NOTIFICATION_GROUP_IDS,
  NOTIFICATION_LEVEL_IDS,
  isNotificationGroup,
  notifyPermissionKey,
  type NotificationChannel,
  type NotificationGroupId,
} from '../../../shared/constants/notifications.js';
import {
  DEFAULT_NOTIFICATION_USER_PREFS,
  NOTIFICATION_TABS,
  type NotificationTab,
  type NotificationUserPrefsData,
} from '../../../shared/types/notifications.js';

export function sanitizePrefs(raw: unknown): NotificationUserPrefsData {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const groups = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter(isNotificationGroup))] : [];
  return {
    mutedGroups: groups(obj.mutedGroups),
    mutedTgGroups: groups(obj.mutedTgGroups),
    sound: obj.sound === true,
    defaultTab: NOTIFICATION_TABS.includes(obj.defaultTab as NotificationTab)
      ? (obj.defaultTab as NotificationTab)
      : DEFAULT_NOTIFICATION_USER_PREFS.defaultTab,
  };
}

/** Групи, для яких роль має хоч один рівень у каналі. */
export function allowedGroups(permissions: ReadonlySet<string>, channel: NotificationChannel): NotificationGroupId[] {
  return NOTIFICATION_GROUP_IDS.filter((group) =>
    NOTIFICATION_LEVEL_IDS.some((level) => hasPermission(permissions, notifyPermissionKey(group, level, channel))),
  );
}

export class NotificationPrefsService {
  private cache = new Map<number, { at: number; prefs: NotificationUserPrefsData }>();

  async get(userId: number): Promise<NotificationUserPrefsData> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < 60_000) return hit.prefs;
    const row = (await userPrefsStore.read()).find((r) => r.id === userId);
    const prefs = row ? sanitizePrefs(row.prefs) : { ...DEFAULT_NOTIFICATION_USER_PREFS };
    this.cache.set(userId, { at: Date.now(), prefs });
    return prefs;
  }

  async getMany(userIds: number[]): Promise<Map<number, NotificationUserPrefsData>> {
    const wanted = new Set(userIds);
    const rows = userIds.length ? (await userPrefsStore.read()).filter((r) => wanted.has(r.id)) : [];
    const map = new Map<number, NotificationUserPrefsData>();
    for (const id of userIds) map.set(id, { ...DEFAULT_NOTIFICATION_USER_PREFS });
    for (const row of rows) map.set(row.id, sanitizePrefs(row.prefs));
    return map;
  }

  async save(userId: number, raw: unknown): Promise<NotificationUserPrefsData> {
    const prefs = sanitizePrefs(raw);
    await userPrefsStore.mutate((draft) => {
      const row = draft.items.find((r) => r.id === userId);
      if (row) Object.assign(row, { prefs, updatedAt: nowIso() });
      else draft.items.push({ id: userId, prefs, updatedAt: nowIso() });
    });
    this.cache.set(userId, { at: Date.now(), prefs });
    return prefs;
  }
}

export const notificationPrefsService = new NotificationPrefsService();
