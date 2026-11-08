/* global AbortSignal */
/**
 * Notification Centre → Telegram: a dedicated bot employees subscribe to.
 *
 * - Settings (bot token) in settings_base `notification_telegram`; linked chats in `notification_telegram_links`.
 * - Linking: user gets a one-time deep link t.me/<bot>?start=<code>; the bot receives
 *   `/start <code>` through getUpdates polling and binds chat_id to the user. `/stop` unlinks.
 * - Dispatch: cursor over meta_logs.id → rule engine → audience (role matrix `.tg`, prefs,
 *   addressed) → notification_outbox (unique per log+user, 30-min anti-spam by fingerprint).
 * - Send: outbox rows are claimed atomically and sent with retries. Old rows are cleaned up
 *   (sent after 7 days, failed after 30).
 *
 * The worker runs outside development (or with NOTIFICATION_TG_WORKER=1), so a local
 * backoffice on the shared DB does not double-send.
 */

import { randomBytes } from 'node:crypto';
import { prisma, logServer } from '../../lib/utils.js';
import { roleService } from '../../services/RoleService.js';
import { notificationFeedService } from './NotificationFeedService.js';
import { notificationPrefsService } from './NotificationPrefsService.js';
import { telegramLinkStore, type StoredTelegramLink } from './notificationStores.js';
import {
  formatTelegramMessage,
  retryDelayMs,
  telegramAudience,
  telegramFingerprint,
  TG_DEDUPE_WINDOW_MS,
  TG_MAX_ATTEMPTS,
  type TelegramRecipient,
} from './telegramDelivery.js';
import type {
  NotificationTelegramAdminState,
  NotificationTelegramSettings,
} from '../../../shared/types/notificationSettings.js';

const SETTINGS_KEY = 'notification_telegram';
const CURSOR_KEY = 'notification_telegram_cursor';
const OFFSET_KEY = 'notification_telegram_update_offset';
const CATEGORY = 'notifications';
const LINK_TTL_MS = 15 * 60 * 1000;
const TICK_MS = 15_000;
const API = 'https://api.telegram.org/bot';
const OUTBOX_CLEANUP_EVERY_MS = 6 * 3600 * 1000;
const OUTBOX_KEEP_SENT_DAYS = 7;
const OUTBOX_KEEP_FAILED_DAYS = 30;

export class NotificationTelegramError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function maskToken(token: string): string {
  if (!token) return '';
  return token.length <= 8 ? '****' : `****…${token.slice(-4)}`;
}

async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.settingsBase.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string, description: string): Promise<void> {
  await prisma.settingsBase.upsert({
    where: { key },
    create: { key, value, category: CATEGORY, description },
    update: { value },
  });
}

async function linkOf(userId: number): Promise<StoredTelegramLink | undefined> {
  return (await telegramLinkStore.read()).find((l) => l.id === userId);
}

async function linkedChats(): Promise<StoredTelegramLink[]> {
  return (await telegramLinkStore.read()).filter((l) => l.chatId);
}

/** Повертає кількість видалених привʼязок. */
async function removeLinks(predicate: (link: StoredTelegramLink) => boolean): Promise<number> {
  return telegramLinkStore.mutate((draft) => {
    const before = draft.items.length;
    draft.items = draft.items.filter((l) => !predicate(l));
    return before - draft.items.length;
  });
}

export function isTelegramWorkerEnabled(): boolean {
  return process.env.NOTIFICATION_TG_WORKER === '1' || process.env.NODE_ENV !== 'development';
}

export class NotificationTelegramService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  // ── Settings ───────────────────────────────────────────────────────────────

  async getSettings(): Promise<NotificationTelegramSettings> {
    const raw = await readSetting(SETTINGS_KEY);
    let parsed: Partial<NotificationTelegramSettings> = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    return {
      botToken: typeof parsed.botToken === 'string' ? parsed.botToken : '',
      botUsername: typeof parsed.botUsername === 'string' ? parsed.botUsername : null,
      enabled: parsed.enabled === true,
    };
  }

  private async call<T = any>(token: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!res.ok || json.ok === false) {
      const err = new NotificationTelegramError(json.description || `Telegram HTTP ${res.status}`, json.error_code ?? res.status);
      throw err;
    }
    return json.result as T;
  }

  /** Зберегти токен / увімкнути. Новий токен перевіряється через getMe. */
  async saveSettings(input: { botToken?: string; enabled?: boolean }): Promise<NotificationTelegramSettings> {
    const current = await this.getSettings();
    const next = { ...current };
    if (typeof input.botToken === 'string' && input.botToken.trim() && input.botToken.trim() !== current.botToken) {
      const token = input.botToken.trim();
      let me: { username?: string };
      try {
        me = await this.call<{ username?: string }>(token, 'getMe');
      } catch (err) {
        throw new NotificationTelegramError(`Telegram не прийняв токен: ${err instanceof Error ? err.message : err}`);
      }
      next.botToken = token;
      next.botUsername = me.username ?? null;
      // Новий бот – старі привʼязки до чатів іншого бота недійсні.
      if (current.botToken) await telegramLinkStore.mutate((draft) => {
        draft.items = [];
      });
      // Без вебхука, бо приймаємо оновлення через getUpdates.
      await this.call(token, 'deleteWebhook').catch(() => undefined);
    }
    if (typeof input.enabled === 'boolean') next.enabled = input.enabled && Boolean(next.botToken);
    await writeSetting(SETTINGS_KEY, JSON.stringify(next), 'Центр сповіщень: Telegram-бот (токен, увімкнено)');
    return next;
  }

  async adminState(): Promise<NotificationTelegramAdminState> {
    const settings = await this.getSettings();
    const links = (await linkedChats()).sort((a, b) => (b.linkedAt ?? '').localeCompare(a.linkedAt ?? ''));
    const users = links.length
      ? await prisma.user.findMany({ where: { id: { in: links.map((l) => l.id) } }, select: { id: true, name: true, email: true, roleName: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const stats = await prisma.notificationOutbox.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } });
    const lastErrors = await prisma.notificationOutbox.findMany({
      where: { status: 'failed', createdAt: { gte: since } },
      orderBy: { id: 'desc' },
      take: 5,
      select: { id: true, userId: true, lastError: true, createdAt: true },
    });
    return {
      configured: Boolean(settings.botToken),
      enabled: settings.enabled,
      botUsername: settings.botUsername,
      botTokenMasked: maskToken(settings.botToken),
      workerActive: isTelegramWorkerEnabled(),
      links: links.map((l) => ({
        userId: l.id,
        name: byId.get(l.id)?.name || byId.get(l.id)?.email || `#${l.id}`,
        roleName: byId.get(l.id)?.roleName ?? null,
        telegramUsername: l.username,
        linkedAt: l.linkedAt,
      })),
      stats: Object.fromEntries(stats.map((s) => [s.status, s._count._all])),
      lastErrors: lastErrors.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    };
  }

  // ── Linking ────────────────────────────────────────────────────────────────

  async linkStatus(userId: number): Promise<{ configured: boolean; linked: boolean; username: string | null }> {
    const settings = await this.getSettings();
    const link = await linkOf(userId);
    return {
      configured: Boolean(settings.botToken && settings.enabled && settings.botUsername),
      linked: Boolean(link?.chatId),
      username: link?.username ?? null,
    };
  }

  async createLink(userId: number): Promise<{ url: string; expiresAt: string }> {
    const settings = await this.getSettings();
    if (!settings.botToken || !settings.enabled || !settings.botUsername) {
      throw new NotificationTelegramError('Telegram-бот сповіщень ще не налаштований');
    }
    const code = randomBytes(12).toString('hex');
    const expires = new Date(Date.now() + LINK_TTL_MS);
    await telegramLinkStore.mutate((draft) => {
      const row = draft.items.find((l) => l.id === userId);
      if (row) Object.assign(row, { linkCode: code, linkCodeExpires: expires.toISOString() });
      else draft.items.push({ id: userId, chatId: null, username: null, firstName: null, linkCode: code, linkCodeExpires: expires.toISOString(), linkedAt: null });
    });
    return { url: `https://t.me/${settings.botUsername}?start=${code}`, expiresAt: expires.toISOString() };
  }

  async unlink(userId: number): Promise<void> {
    await removeLinks((l) => l.id === userId);
  }

  async sendTest(userId: number): Promise<void> {
    const settings = await this.getSettings();
    const link = await linkOf(userId);
    if (!settings.botToken) throw new NotificationTelegramError('Бот не налаштований');
    if (!link?.chatId) throw new NotificationTelegramError('Ваш Telegram не підключено до бота сповіщень');
    await this.call(settings.botToken, 'sendMessage', {
      chat_id: link.chatId,
      text: '✅ Тестове повідомлення Центру сповіщень NK Backoffice. Сюди приходитимуть сповіщення, дозволені вашою роллю.',
    });
  }

  // ── Worker ─────────────────────────────────────────────────────────────────

  start(): void {
    if (this.timer || !isTelegramWorkerEnabled()) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    logServer('[NotificationTelegram] worker started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const settings = await this.getSettings();
      if (!settings.botToken || !settings.enabled) return;
      await this.pollUpdates(settings.botToken).catch((err) => logServer('[NotificationTelegram] getUpdates failed', err));
      await this.dispatch();
      await this.sendPending(settings.botToken);
      await this.cleanupOutbox();
    } catch (err) {
      logServer('[NotificationTelegram] tick failed', err);
    } finally {
      this.ticking = false;
    }
  }

  /** Обробка /start <code> і /stop. */
  async pollUpdates(token: string): Promise<void> {
    const offset = Number(await readSetting(OFFSET_KEY)) || 0;
    const updates = await this.call<Array<{ update_id: number; message?: { chat: { id: number }; text?: string; from?: { username?: string; first_name?: string } } }>>(
      token,
      'getUpdates',
      { offset, timeout: 0, allowed_updates: ['message'] },
    );
    if (!updates.length) return;
    for (const u of updates) {
      const msg = u.message;
      if (!msg?.text) continue;
      const chatId = String(msg.chat.id);
      const [command, arg] = msg.text.trim().split(/\s+/, 2);
      if (command === '/start' && arg) {
        const linked = await telegramLinkStore.mutate((draft) => {
          const link = draft.items.find((l) => l.linkCode === arg);
          if (!link || !link.linkCodeExpires || new Date(link.linkCodeExpires) < new Date()) return false;
          // Один чат – один користувач.
          draft.items = draft.items.filter((l) => l.chatId !== chatId || l.id === link.id);
          Object.assign(link, {
            chatId,
            username: msg.from?.username ?? null,
            firstName: msg.from?.first_name ?? null,
            linkedAt: new Date().toISOString(),
            linkCode: null,
            linkCodeExpires: null,
          });
          return true;
        });
        if (!linked) {
          await this.reply(token, chatId, 'Посилання застаріло. Відкрийте нове в бекофісі: дзвіночок → шестерня → «Підключити Telegram».');
          continue;
        }
        await this.reply(token, chatId, '✅ Підключено. Сюди приходитимуть сповіщення бекофісу, дозволені вашою роллю. Вимкнути: /stop');
      } else if (command === '/start') {
        await this.reply(token, chatId, 'Щоб отримувати сповіщення, відкрийте посилання з бекофісу: дзвіночок → шестерня → «Підключити Telegram».');
      } else if (command === '/stop') {
        const removed = await removeLinks((l) => l.chatId === chatId);
        await this.reply(token, chatId, removed ? 'Сповіщення вимкнено.' : 'Цей чат не підключено.');
      }
    }
    await writeSetting(OFFSET_KEY, String(updates[updates.length - 1].update_id + 1), 'Центр сповіщень: offset getUpdates');
  }

  private async reply(token: string, chatId: string, text: string) {
    await this.call(token, 'sendMessage', { chat_id: chatId, text }).catch(() => undefined);
  }

  private async recipients(): Promise<TelegramRecipient[]> {
    const links = await linkedChats();
    if (!links.length) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: links.map((l) => l.id) }, isActive: true },
      select: { id: true, role: true },
    });
    const prefs = await notificationPrefsService.getMany(users.map((u) => u.id));
    const out: TelegramRecipient[] = [];
    for (const u of users) {
      const link = links.find((l) => l.id === u.id)!;
      out.push({
        userId: u.id,
        role: u.role,
        chatId: link.chatId!,
        permissions: await roleService.getPermissionSet(u.role),
        prefs: prefs.get(u.id)!,
      });
    }
    return out;
  }

  /** Нові записи meta_logs → outbox. */
  async dispatch(): Promise<number> {
    const cursorRaw = await readSetting(CURSOR_KEY);
    if (cursorRaw === null) {
      // Перший запуск: не розсилаємо історію.
      const max = await prisma.meta_logs.aggregate({ _max: { id: true } });
      await writeSetting(CURSOR_KEY, String(max._max.id ?? 0), 'Центр сповіщень: останній meta_logs.id, оброблений для Telegram');
      return 0;
    }
    const cursor = Number(cursorRaw) || 0;
    const rows = await prisma.meta_logs.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 200, select: { id: true } });
    if (!rows.length) return 0;
    const lastId = rows[rows.length - 1].id;

    const recipients = await this.recipients();
    let queued = 0;
    if (recipients.length) {
      const settings = await this.getSettings();
      const logs = await notificationFeedService.prepareLogs(rows.map((r) => r.id));
      const since = new Date(Date.now() - TG_DEDUPE_WINDOW_MS);
      for (const log of logs) {
        const audience = telegramAudience(log, recipients);
        if (!audience.length) continue;
        const fingerprint = telegramFingerprint(log);
        const recent = await prisma.notificationOutbox.findMany({
          where: { fingerprint, userId: { in: audience.map((a) => a.userId) }, createdAt: { gte: since }, status: { in: ['pending', 'sending', 'sent'] } },
          select: { userId: true },
        });
        const skip = new Set(recent.map((r) => r.userId));
        const message = formatTelegramMessage(log, process.env.CLIENT_URL ?? null);
        const data = audience
          .filter((a) => !skip.has(a.userId))
          .map((a) => ({
            metaLogId: log.id,
            userId: a.userId,
            channel: 'telegram',
            status: 'pending',
            fingerprint,
            payload: { chatId: a.chatId, ...message, bot: settings.botUsername } as object,
          }));
        if (data.length) {
          const res = await prisma.notificationOutbox.createMany({ data, skipDuplicates: true });
          queued += res.count;
        }
      }
    }
    await writeSetting(CURSOR_KEY, String(lastId), 'Центр сповіщень: останній meta_logs.id, оброблений для Telegram');
    return queued;
  }

  private lastCleanupAt = 0;

  /** Раз на 6 год: відправлені й пропущені старші за 7 днів, помилки старші за 30 днів. */
  async cleanupOutbox(force = false): Promise<number> {
    if (!force && Date.now() - this.lastCleanupAt < OUTBOX_CLEANUP_EVERY_MS) return 0;
    this.lastCleanupAt = Date.now();
    const day = 24 * 3600 * 1000;
    const res = await prisma.notificationOutbox.deleteMany({
      where: {
        OR: [
          { status: { in: ['sent', 'skipped'] }, createdAt: { lt: new Date(Date.now() - OUTBOX_KEEP_SENT_DAYS * day) } },
          { status: 'failed', createdAt: { lt: new Date(Date.now() - OUTBOX_KEEP_FAILED_DAYS * day) } },
        ],
      },
    });
    if (res.count) logServer(`[NotificationTelegram] outbox cleanup: removed ${res.count}`);
    return res.count;
  }

  async sendPending(token: string): Promise<number> {
    const rows = await prisma.notificationOutbox.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { id: 'asc' },
      take: 25,
    });
    let sent = 0;
    for (const row of rows) {
      const claimed = await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: 'pending' }, data: { status: 'sending' } });
      if (!claimed.count) continue;
      const p = row.payload as { chatId: string; text: string; buttonUrl: string | null; buttonLabel: string | null };
      try {
        await this.call(token, 'sendMessage', {
          chat_id: p.chatId,
          text: p.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(p.buttonUrl ? { reply_markup: { inline_keyboard: [[{ text: p.buttonLabel ?? 'Відкрити', url: p.buttonUrl }]] } } : {}),
        });
        await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), attempts: row.attempts + 1 } });
        sent += 1;
      } catch (err) {
        const attempts = row.attempts + 1;
        const status = err instanceof NotificationTelegramError ? err.status : 0;
        const blocked = status === 403; // користувач заблокував бота
        const final = blocked || attempts >= TG_MAX_ATTEMPTS;
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: {
            status: final ? 'failed' : 'pending',
            attempts,
            lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
            nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
          },
        });
        if (blocked) await removeLinks((l) => l.chatId === p.chatId);
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    return sent;
  }
}

export const notificationTelegramService = new NotificationTelegramService();
