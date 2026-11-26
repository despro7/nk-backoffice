import type { Request } from 'express';
import UAParser from 'ua-parser-js';
import { prisma } from '../lib/utils.js';
import type { SessionMeta } from '../types/auth.js';
import type {
  AuthLoginAttemptsResponse,
  AuthSessionDto,
  AuthSessionsResponse,
  LoginAttemptReason,
  SessionDeviceType,
  SessionRevokedReason,
} from '../../shared/types/authSessions.js';

/** Скільки middleware довіряє кешованому стану сесії */
export const SESSION_CACHE_TTL_MS = 30_000;
/** Скільки зберігається історія сесій і спроб входу */
export const AUTH_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** Рядків на сторінку списку сесій і невдалих спроб */
export const AUTH_PAGE_SIZE = 10;

const sessionCache = new Map<string, { active: boolean; checkedAt: number }>();
// Росте при кожному revoke: не кешуємо відповідь, прочитану до відкликання
let cacheGeneration = 0;

export async function isSessionActive(sid: string): Promise<boolean> {
  const cached = sessionCache.get(sid);
  if (cached && Date.now() - cached.checkedAt < SESSION_CACHE_TTL_MS) {
    return cached.active;
  }

  const generation = cacheGeneration;
  const session = await prisma.userSession.findFirst({
    where: { id: sid, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  const active = Boolean(session);
  if (generation === cacheGeneration) {
    sessionCache.set(sid, { active, checkedAt: Date.now() });
  }
  return active;
}

export function clearSessionCache(): void {
  cacheGeneration++;
  sessionCache.clear();
}

/** Не частіше ніж раз на стільки оновлюємо lastUsedAt звичайними запитами */
export const SESSION_TOUCH_INTERVAL_MS = 60_000;
const touchedAt = new Map<string, number>();

/** Fire-and-forget: «Остання активність» без запису в БД на кожен запит */
export function touchSession(sid: string): void {
  const now = Date.now();
  if (now - (touchedAt.get(sid) ?? 0) < SESSION_TOUCH_INTERVAL_MS) return;
  touchedAt.set(sid, now);
  prisma.userSession
    .updateMany({ where: { id: sid, revokedAt: null }, data: { lastUsedAt: new Date(now) } })
    .catch(() => {});
}

export interface RevokeOptions {
  reason: SessionRevokedReason;
  byUserId?: number | null;
  /** Лише ці сесії; без списку всі */
  sessionIds?: string[];
  exceptSid?: string;
}

export async function revokeSessions(userId: number, options: RevokeOptions): Promise<number> {
  const { reason, byUserId = null, sessionIds, exceptSid } = options;
  const idFilter = {
    ...(sessionIds ? { in: sessionIds } : {}),
    ...(exceptSid ? { not: exceptSid } : {}),
  };

  const { count } = await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(Object.keys(idFilter).length ? { id: idFilter } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason, revokedByUserId: byUserId },
  });

  if (count > 0) clearSessionCache();
  return count;
}

export function parseUserAgent(userAgent: string | null | undefined): {
  deviceType: SessionDeviceType;
  browser: string | null;
  os: string | null;
} {
  const result = new UAParser(userAgent || '').getResult();
  // Лише назви, без версій: «Chrome (Mac OS)». Повний userAgent зберігається окремо
  const label = (name?: string) => name?.replace(/^Mobile /, '').slice(0, 64) || null;
  const type = result.device.type;

  return {
    deviceType: type === 'mobile' || type === 'tablet' ? type : 'desktop',
    browser: label(result.browser.name),
    os: label(result.os.name),
  };
}

const PRIVATE_ADDRESS = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:|fe80:)/i;

const isPrivateAddress = (ip: string) => PRIVATE_ADDRESS.test(ip);

const directAddress = (req: Request) => (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');

const firstHeader = (req: Request, name: string) => req.get(name)?.split(',')[0]?.trim();

/**
 * Prod стоїть за Cloudflare і проксі на тому ж сервері, тож req.ip це адреса проксі.
 * Заголовкам віримо лише коли зʼєднання прийшло з локальної адреси.
 */
export function getClientIp(req: Request): string | null {
  const direct = directAddress(req);
  if (direct && !isPrivateAddress(direct)) return direct;

  const forwarded = firstHeader(req, 'cf-connecting-ip')
    || firstHeader(req, 'x-forwarded-for')
    || firstHeader(req, 'x-real-ip');
  return (forwarded || direct).slice(0, 64) || null;
}

/** Геодані з заголовків Cloudflare, без зовнішніх API */
export function getClientGeo(req: Request): Pick<SessionMeta, 'city' | 'region' | 'country'> {
  const direct = directAddress(req);
  const trusted = !direct || isPrivateAddress(direct);
  const read = (name: string) => {
    const raw = trusted ? req.get(name)?.trim() : undefined;
    // Node читає заголовки як latin1, Cloudflare шле UTF-8
    return raw ? Buffer.from(raw, 'latin1').toString('utf8').slice(0, 96) : null;
  };
  const country = read('cf-ipcountry')?.toUpperCase();

  return {
    city: read('cf-ipcity'),
    region: read('cf-region'),
    // XX: невідомо, T1: Tor
    country: country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null,
  };
}

export const getSessionMeta = (req: Request): SessionMeta => ({
  userAgent: req.get('user-agent'),
  ip: getClientIp(req),
  ...getClientGeo(req),
});

type SessionRow = {
  id: string;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  lastIp: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
};

function toSessionDto(row: SessionRow, currentSid: string | undefined, now: number): AuthSessionDto {
  const expired = !row.revokedAt && row.expiresAt.getTime() <= now;
  const endedAt = row.revokedAt ?? (expired ? row.expiresAt : null);

  return {
    id: row.id,
    deviceType: (row.deviceType as SessionDeviceType | null) ?? 'desktop',
    browser: row.browser,
    os: row.os,
    ip: row.ip,
    lastIp: row.lastIp,
    city: row.city,
    region: row.region,
    country: row.country,
    isLocalNetwork: isPrivateAddress(row.lastIp ?? row.ip ?? ''),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    isActive: !endedAt,
    isCurrent: row.id === currentSid,
    revokedAt: endedAt?.toISOString() ?? null,
    revokedReason: expired ? 'expired' : (row.revokedReason as SessionRevokedReason | null),
  };
}

/**
 * Без endedOffset: перша сторінка, тобто всі активні та завершені, що добирають до AUTH_PAGE_SIZE.
 * З endedOffset: лише наступна порція завершених.
 */
export async function listSessions(
  userId: number,
  currentSid: string | undefined,
  endedOffset?: number,
): Promise<AuthSessionsResponse> {
  const now = new Date();
  const since = new Date(now.getTime() - AUTH_HISTORY_RETENTION_MS);

  const [activeRows, endedRows] = await Promise.all([
    prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'desc' },
    }),
    // Час завершення це revokedAt або expiresAt, тому сортуємо тут; обсяг обмежений ретеншном
    prisma.userSession.findMany({
      where: {
        userId,
        OR: [{ revokedAt: { gt: since } }, { revokedAt: null, expiresAt: { gt: since, lte: now } }],
      },
    }),
  ]);

  const toDto = (row: SessionRow) => toSessionDto(row, currentSid, now.getTime());
  const active = activeRows.map(toDto).sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  const ended = endedRows.map(toDto).sort((a, b) => b.revokedAt!.localeCompare(a.revokedAt!));

  const isFirstPage = endedOffset === undefined;
  const start = endedOffset ?? 0;
  const size = isFirstPage ? Math.max(0, AUTH_PAGE_SIZE - active.length) : AUTH_PAGE_SIZE;
  const page = ended.slice(start, start + size);

  return {
    sessions: isFirstPage ? [...active, ...page] : page,
    hasMore: ended.length > start + page.length,
  };
}

export async function recordLoginAttempt(
  email: string,
  meta: SessionMeta,
  outcome: { userId?: number; reason?: LoginAttemptReason },
): Promise<void> {
  try {
    await prisma.authLoginAttempt.create({
      data: {
        email: String(email ?? '').slice(0, 191),
        userId: outcome.userId ?? null,
        ip: meta.ip || null,
        userAgent: meta.userAgent?.slice(0, 255) || null,
        success: !outcome.reason,
        reason: outcome.reason ?? null,
      },
    });
  } catch (error) {
    // Журнал не повинен ламати вхід
    console.error('❌ [Auth] Не вдалося записати спробу входу:', error);
  }
}

/** Невдалі спроби входу, найновіші першими */
export async function listLoginAttempts(userId: number, offset = 0): Promise<AuthLoginAttemptsResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return null;

  const rows = await prisma.authLoginAttempt.findMany({
    where: { success: false, OR: [{ userId }, { email: user.email }] },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    // Один зайвий рядок показує, чи є наступна сторінка
    take: AUTH_PAGE_SIZE + 1,
  });

  const attempts = rows.slice(0, AUTH_PAGE_SIZE).map((row) => ({
    id: row.id,
    email: row.email,
    ip: row.ip,
    userAgent: row.userAgent,
    ...parseUserAgent(row.userAgent),
    success: row.success,
    reason: row.reason as LoginAttemptReason | null,
    createdAt: row.createdAt.toISOString(),
  }));

  return { attempts, hasMore: rows.length > AUTH_PAGE_SIZE };
}

/** Прибирає історію, старшу за термін зберігання */
export async function purgeAuthHistory(userId: number): Promise<void> {
  const before = new Date(Date.now() - AUTH_HISTORY_RETENTION_MS);
  await prisma.userSession.deleteMany({
    where: { userId, OR: [{ revokedAt: { lt: before } }, { expiresAt: { lt: before } }] },
  });
  await prisma.authLoginAttempt.deleteMany({ where: { createdAt: { lt: before } } });
}
