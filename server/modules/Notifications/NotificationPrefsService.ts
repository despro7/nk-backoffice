/**
 * Personal notification preferences (gear in the dropdown): muted groups in the app,
 * Telegram opt-outs per group, sound. A user can only narrow what the role allows.
 */

import { prisma } from '../../lib/utils.js';
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
    const row = await prisma.notificationUserPrefs.findUnique({ where: { userId } });
    const prefs = row ? sanitizePrefs(row.prefs) : { ...DEFAULT_NOTIFICATION_USER_PREFS };
    this.cache.set(userId, { at: Date.now(), prefs });
    return prefs;
  }

  async getMany(userIds: number[]): Promise<Map<number, NotificationUserPrefsData>> {
    const rows = userIds.length
      ? await prisma.notificationUserPrefs.findMany({ where: { userId: { in: userIds } } })
      : [];
    const map = new Map<number, NotificationUserPrefsData>();
    for (const id of userIds) map.set(id, { ...DEFAULT_NOTIFICATION_USER_PREFS });
    for (const row of rows) map.set(row.userId, sanitizePrefs(row.prefs));
    return map;
  }

  async save(userId: number, raw: unknown): Promise<NotificationUserPrefsData> {
    const prefs = sanitizePrefs(raw);
    await prisma.notificationUserPrefs.upsert({
      where: { userId },
      create: { userId, prefs: prefs as object },
      update: { prefs: prefs as object },
    });
    this.cache.set(userId, { at: Date.now(), prefs });
    return prefs;
  }
}

export const notificationPrefsService = new NotificationPrefsService();
