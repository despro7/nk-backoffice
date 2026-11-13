/**
 * Адресні сповіщення: запис у meta_logs з data.recipients і data.event.
 * Кому – вирішує код події; роль адресата лише вмикає / вимикає канали (див. NOTIFICATION_DIRECT_EVENTS).
 */
import { logServer, prisma } from '../../lib/utils.js';
import type { NotificationDirectEventId } from '../../../shared/constants/notifications.js';

const ADMIN_ROLE_SLUG = 'admin';

/** Активні користувачі, чия роль має право; includeAdmin – плюс усі адміністратори. */
export async function userIdsWithPermission(permissionKey: string, options: { includeAdmin?: boolean } = {}): Promise<number[]> {
  const roles = await prisma.rolePermission.findMany({
    where: { permissionKey },
    select: { role: { select: { slug: true } } },
  });
  const slugs = new Set(roles.map((r) => r.role.slug));
  if (options.includeAdmin) slugs.add(ADMIN_ROLE_SLUG);
  else slugs.delete(ADMIN_ROLE_SLUG);
  if (slugs.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { role: { in: [...slugs] }, isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export interface DirectNotification {
  category: string;
  recipients: number[];
  event: NotificationDirectEventId;
  /** Автор дії: собі сповіщення не надсилається. */
  actorId: number | null;
  status: 'info' | 'warning' | 'success';
  title: string;
  message: string;
  /** Внутрішнє посилання «Відкрити …». */
  link: string;
  /** Додаткові поля в data (goodId, batchId тощо). */
  data?: Record<string, unknown>;
  /** initiatedBy, коли автора немає. */
  systemSource: string;
}

/** Пише адресне сповіщення; помилка лише логуюється і не ламає дію. */
export async function sendDirectNotification(input: DirectNotification): Promise<void> {
  const recipients = [...new Set(input.recipients)].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return;
  try {
    await prisma.meta_logs.create({
      data: {
        category: input.category,
        status: input.status,
        title: input.title,
        message: input.message.slice(0, 2000),
        data: { ...input.data, recipients, event: input.event, link: input.link },
        initiatedBy: input.actorId != null ? String(input.actorId) : input.systemSource,
      },
    });
  } catch (error) {
    logServer('[notify] direct notification failed', { category: input.category, event: input.event, error });
  }
}

export interface DirectNotificationMatch {
  category: string;
  events: NotificationDirectEventId[];
  /** Поля data, за якими шукаємо сповіщення об'єкта (goodId, batchId). */
  match: Record<string, string | number>;
  /** Старі записи без data.event – за точним заголовком. */
  legacyTitles?: string[];
}

const DATA_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;

/** SQL-умова й параметри для пошуку адресних сповіщень об'єкта (без hiddenBy). */
export function directNotificationWhere(input: DirectNotificationMatch): { sql: string; params: Array<string | number> } {
  const params: Array<string | number> = [input.category];
  const eventSql = `JSON_UNQUOTE(JSON_EXTRACT(data, '$.event')) IN (${input.events.map(() => '?').join(',')})`;
  params.push(...input.events);
  let kindSql = eventSql;
  if (input.legacyTitles?.length) {
    kindSql = `(${eventSql} OR (JSON_EXTRACT(data, '$.event') IS NULL AND title IN (${input.legacyTitles.map(() => '?').join(',')})))`;
    params.push(...input.legacyTitles);
  }
  const matchSql = Object.entries(input.match).map(([key, value]) => {
    if (!DATA_KEY.test(key)) throw new Error(`Invalid data key: ${key}`);
    params.push(String(value));
    return `JSON_UNQUOTE(JSON_EXTRACT(data, '$.${key}')) = ?`;
  });
  if (matchSql.length === 0) throw new Error('Direct notification match is empty');
  return { sql: ['category = ?', kindSql, ...matchSql].join(' AND '), params };
}

/**
 * Хтось уже відреагував на задачу (затвердив, видав сировину…): її адресні сповіщення
 * переходять в архів для всіх як «Вирішено» (hiddenBy._all). Помилка лише логуюється.
 */
export async function resolveDirectNotifications(input: DirectNotificationMatch): Promise<number> {
  if (input.events.length === 0) return 0;
  try {
    const where = directNotificationWhere(input);
    return await prisma.$executeRawUnsafe(
      `UPDATE meta_logs SET hiddenBy = JSON_SET(COALESCE(hiddenBy, JSON_OBJECT()), '$._all', ?)
       WHERE ${where.sql} AND (hiddenBy IS NULL OR JSON_EXTRACT(hiddenBy, '$._all') IS NULL)`,
      new Date().toISOString(),
      ...where.params,
    );
  } catch (error) {
    logServer('[notify] resolve direct notifications failed', { category: input.category, events: input.events, error });
    return 0;
  }
}
