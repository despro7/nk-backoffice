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
