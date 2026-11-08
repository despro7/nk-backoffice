/**
 * Pure helpers for Telegram delivery: who receives a notification, anti-spam fingerprint,
 * message formatting. No I/O here.
 */

import { createHash } from 'node:crypto';
import { hasPermission } from '../../../shared/constants/permissions.js';
import {
  notificationGroupLabel,
  notifyPermissionKey,
  type NotificationGroupId,
} from '../../../shared/constants/notifications.js';
import type { NotificationUserPrefsData } from '../../../shared/types/notifications.js';
import type { PreparedLog } from './notificationFeed.js';

export const TG_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export interface TelegramRecipient {
  userId: number;
  role: string;
  chatId: string;
  permissions: ReadonlySet<string>;
  prefs: NotificationUserPrefsData;
}

/** Хто з підключених отримає це сповіщення в Telegram. */
export function telegramAudience(log: PreparedLog, recipients: TelegramRecipient[]): TelegramRecipient[] {
  const r = log.rendered;
  if (!r.visible) return [];
  return recipients.filter((u) => {
    const isAdmin = u.role === 'admin';
    if (log.category === 'user_report' && !isAdmin) return false;
    if (u.prefs.mutedTgGroups.includes(r.group as NotificationGroupId)) return false;
    if (log.recipients) return log.recipients.includes(u.userId);
    if (u.prefs.mutedGroups.includes(r.group as NotificationGroupId)) return false;
    return hasPermission(u.permissions, notifyPermissionKey(r.group as NotificationGroupId, r.level, 'tg'));
  });
}

export function telegramFingerprint(log: PreparedLog): string {
  const r = log.rendered;
  return createHash('sha1')
    .update([r.ruleId ?? '-', r.group, r.title, r.message, log.orderNumber ?? ''].join('\u0001'))
    .digest('hex');
}

const LEVEL_EMOJI: Record<string, string> = {
  error: '🔴',
  warning: '🟠',
  success: '🟢',
  info: '🔵',
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface TelegramMessage {
  text: string;
  /** Посилання на бекофіс (кнопка), якщо є публічна адреса. */
  buttonUrl: string | null;
  buttonLabel: string | null;
}

/** HTML-повідомлення Telegram (parse_mode=HTML), до 4096 символів. */
export function formatTelegramMessage(log: PreparedLog, appUrl: string | null): TelegramMessage {
  const r = log.rendered;
  const emoji = r.kind === 'task' ? '📌' : LEVEL_EMOJI[r.level] ?? '🔔';
  const meta = [notificationGroupLabel(r.group), log.orderNumber ? `№${log.orderNumber}` : null, log.actorName]
    .filter(Boolean)
    .join(' · ');
  const body = r.message ? `\n${escapeHtml(r.message)}` : '';
  let text = `${emoji} <b>${escapeHtml(r.title)}</b>${body}\n\n<i>${escapeHtml(meta)}</i>`;

  const base = appUrl ? appUrl.replace(/\/+$/, '') : null;
  const publicBase = base && /^https:\/\//.test(base) ? base : null;
  const link = r.actionLink && base ? `${base}${r.actionLink}` : null;
  if (link && !publicBase) text += `\n${escapeHtml(link)}`;
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`;

  return {
    text,
    buttonUrl: publicBase && r.actionLink ? `${publicBase}${r.actionLink}` : null,
    buttonLabel: r.actionLabel ?? (r.actionLink ? 'Відкрити' : null),
  };
}

/** Затримка наступної спроби: 30 с, 2 хв, 10 хв, 30 хв. */
export function retryDelayMs(attempts: number): number {
  const steps = [30_000, 120_000, 600_000, 1_800_000];
  return steps[Math.min(attempts - 1, steps.length - 1)] ?? 1_800_000;
}

export const TG_MAX_ATTEMPTS = 5;
