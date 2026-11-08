/**
 * Notification Centre feed: reads meta_logs, renders them with the rule engine and builds
 * a per-user feed (tabs, counters, collapsed repeats).
 *
 * Rendering does not depend on the viewer, so rendered logs are cached by meta_logs.id and
 * config version. Each poll only reads the light columns (id, status, readBy, hiddenBy).
 */

import { prisma } from '../../lib/utils.js';
import { renderNotification } from '../../../shared/notifications/ruleEngine.js';
import type { NotificationRuleDef } from '../../../shared/types/notificationRules.js';
import type { NotificationTab } from '../../../shared/types/notifications.js';
import { notificationConfigService } from './NotificationConfigService.js';
import {
  buildFeed,
  parseReadBy,
  type BuiltFeed,
  type FeedViewer,
  type LogUserState,
  type PreparedLog,
} from './notificationFeed.js';

export const FEED_WINDOW_DAYS = 30;
const LIGHT_LIMIT = 600;
const CACHE_MAX = 5000;

/** Категорії, success/info-записи яких може показати хоч одне правило; null – будь-які. */
export function categoriesWithVisibleSuccess(rules: NotificationRuleDef[]): string[] | null {
  const out = new Set<string>();
  for (const rule of rules) {
    if (!rule.enabled || rule.output.visibility !== 'show') continue;
    const statuses = rule.match.statuses;
    if (statuses?.length && !statuses.some((s) => s === 'success' || s === 'info')) continue;
    if (!rule.match.categories?.length) return null;
    rule.match.categories.forEach((c) => out.add(c));
  }
  return [...out];
}

function parseRecipients(data: unknown): number[] | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const recipients = (data as { recipients?: unknown }).recipients;
  if (!Array.isArray(recipients)) return null;
  return recipients.map(Number).filter((n) => Number.isFinite(n));
}

/** userId із initiatedBy: "5" або "manual:user:<email>" (старий формат ручного експорту). */
export function parseInitiator(initiatedBy: string | null): { userId?: number; email?: string } {
  if (!initiatedBy) return {};
  if (/^\d+$/.test(initiatedBy)) return { userId: Number(initiatedBy) };
  const m = /^manual:user:(.+@.+)$/.exec(initiatedBy);
  if (m) return { email: m[1] };
  return {};
}

export class NotificationFeedService {
  private cache = new Map<number, { version: number; log: PreparedLog }>();

  private async lightRows(rules: NotificationRuleDef[]) {
    const since = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 3600 * 1000);
    const successCategories = categoriesWithVisibleSuccess(rules);
    const statusFilter =
      successCategories === null
        ? {}
        : {
            OR: [
              { status: { in: ['error', 'warning'] } },
              ...(successCategories.length
                ? [{ status: { notIn: ['error', 'warning'] }, category: { in: successCategories } }]
                : []),
            ],
          };
    return prisma.meta_logs.findMany({
      where: { datetime: { gte: since }, ...statusFilter },
      orderBy: { datetime: 'desc' },
      take: LIGHT_LIMIT,
      select: { id: true, datetime: true, readBy: true, hiddenBy: true },
    });
  }

  private async prepare(ids: number[], rules: NotificationRuleDef[], glossary: Parameters<typeof renderNotification>[2], version: number) {
    const missing = ids.filter((id) => this.cache.get(id)?.version !== version);
    if (missing.length === 0) return;

    const rows = await prisma.meta_logs.findMany({
      where: { id: { in: missing } },
      select: {
        id: true,
        datetime: true,
        category: true,
        title: true,
        status: true,
        message: true,
        orderNumber: true,
        initiatedBy: true,
        data: true,
      },
    });

    const initiators = rows.map((r) => parseInitiator(r.initiatedBy));
    const userIds = [...new Set(initiators.map((i) => i.userId).filter((v): v is number => v != null))];
    const emails = [...new Set(initiators.map((i) => i.email).filter((v): v is string => Boolean(v)))];
    const users =
      userIds.length || emails.length
        ? await prisma.user.findMany({
            where: { OR: [{ id: { in: userIds } }, { email: { in: emails } }] },
            select: { id: true, email: true, name: true },
          })
        : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const byEmail = new Map(users.map((u) => [u.email, u]));

    rows.forEach((row, index) => {
      const init = initiators[index];
      const user = init.userId != null ? byId.get(init.userId) : init.email ? byEmail.get(init.email) : undefined;
      const actorName = user ? user.name || user.email : null;
      const rendered = renderNotification(
        {
          id: row.id,
          category: row.category,
          status: row.status,
          title: row.title,
          message: row.message,
          orderNumber: row.orderNumber,
          initiatedBy: row.initiatedBy,
          data: row.data,
          actorName,
        },
        rules,
        glossary,
      );
      this.cache.set(row.id, {
        version,
        log: {
          id: row.id,
          createdAt: row.datetime.toISOString(),
          category: row.category,
          orderNumber: row.orderNumber,
          initiatedBy: row.initiatedBy,
          rendered,
          recipients: parseRecipients(row.data),
          actorUserId: user?.id ?? null,
          actorName,
        },
      });
    });

    if (this.cache.size > CACHE_MAX) {
      const drop = [...this.cache.keys()].sort((a, b) => a - b).slice(0, this.cache.size - CACHE_MAX);
      drop.forEach((id) => this.cache.delete(id));
    }
  }

  async getFeed(viewer: FeedViewer, tab: NotificationTab, limit = 100): Promise<BuiltFeed> {
    const config = await notificationConfigService.get();
    const light = await this.lightRows(config.rules);
    await this.prepare(light.map((r) => r.id), config.rules, config.glossary, config.version);

    const logs: PreparedLog[] = [];
    const states = new Map<number, LogUserState>();
    for (const row of light) {
      const cached = this.cache.get(row.id);
      if (!cached) continue;
      logs.push(cached.log);
      states.set(row.id, { readBy: parseReadBy(row.readBy), hiddenBy: parseReadBy(row.hiddenBy) });
    }
    return buildFeed(logs, states, viewer, tab, limit);
  }

  /** Позначити записи для одного користувача (readBy / hiddenBy) одним SQL. */
  async markForUser(field: 'readBy' | 'hiddenBy', ids: number[], userId: number): Promise<number> {
    const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
    if (clean.length === 0) return 0;
    const column = field === 'readBy' ? 'readBy' : 'hiddenBy';
    return prisma.$executeRawUnsafe(
      `UPDATE meta_logs SET ${column} = JSON_SET(COALESCE(${column}, JSON_OBJECT()), ?, ?) WHERE id IN (${clean.map(() => '?').join(',')})`,
      `$."${userId}"`,
      new Date().toISOString(),
      ...clean,
    );
  }

  /** Повернути з особистого архіву (прибирає hiddenBy[userId], «Вирішено» не чіпає). */
  async unarchiveForUser(ids: number[], userId: number): Promise<number> {
    const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
    if (clean.length === 0) return 0;
    return prisma.$executeRawUnsafe(
      `UPDATE meta_logs SET hiddenBy = JSON_REMOVE(hiddenBy, ?) WHERE hiddenBy IS NOT NULL AND JSON_CONTAINS_PATH(hiddenBy, 'one', ?) AND id IN (${clean.map(() => '?').join(',')})`,
      `$."${userId}"`,
      `$."${userId}"`,
      ...clean,
    );
  }

  /** «Вирішено» адміністратором: ховає для всіх (hiddenBy._all). */
  async resolveForAll(ids: number[]): Promise<number> {
    const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
    if (clean.length === 0) return 0;
    return prisma.$executeRawUnsafe(
      `UPDATE meta_logs SET hiddenBy = JSON_SET(COALESCE(hiddenBy, JSON_OBJECT()), '$._all', ?) WHERE id IN (${clean.map(() => '?').join(',')})`,
      new Date().toISOString(),
      ...clean,
    );
  }
}

export const notificationFeedService = new NotificationFeedService();
