import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  users: [] as any[],
  sessions: [] as any[],
  attempts: [] as any[],
}));

vi.mock('../lib/utils.js', () => {
  const operators: Record<string, (value: any, arg: any) => boolean> = {
    gt: (value, arg) => value != null && value > arg,
    gte: (value, arg) => value != null && value >= arg,
    lt: (value, arg) => value != null && value < arg,
    lte: (value, arg) => value != null && value <= arg,
    in: (value, arg) => arg.includes(value),
    not: (value, arg) => value !== arg,
  };
  const matches = (row: any, where: Record<string, any>): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as any[]).some((part) => matches(row, part));
      const value = row[key];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        return Object.entries(cond).every(([operator, arg]) => operators[operator](value, arg));
      }
      return value === cond;
    });
  const findUser = (where: any) => db.users.find((u) => matches(u, where)) ?? null;

  return {
    prisma: {
      user: {
        findUnique: async ({ where }: any) => findUser(where),
        update: async ({ where, data }: any) => Object.assign(findUser(where), data),
      },
      userSession: {
        findMany: async ({ where }: any) => db.sessions.filter((s) => matches(s, where)),
        create: async ({ data }: any) => {
          const row = { prevTokenHash: null, rotatedAt: null, revokedAt: null, createdAt: new Date(), ...data };
          db.sessions.push(row);
          return row;
        },
        findFirst: async ({ where }: any) => {
          const row = db.sessions.find((s) => matches(s, where));
          return row ? { ...row, user: findUser({ id: row.userId }) } : null;
        },
        updateMany: async ({ where, data }: any) => {
          const rows = db.sessions.filter((s) => matches(s, where));
          rows.forEach((row) => Object.assign(row, data));
          return { count: rows.length };
        },
        deleteMany: async ({ where }: any) => {
          const before = db.sessions.length;
          db.sessions = db.sessions.filter((s) => !matches(s, where));
          return { count: before - db.sessions.length };
        },
      },
      authLoginAttempt: {
        create: async ({ data }: any) => db.attempts.push({ id: db.attempts.length + 1, createdAt: new Date(), ...data }),
        findMany: async ({ where, skip = 0, take }: any) =>
          db.attempts
            .filter((a) => matches(a, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(skip, skip + take),
        deleteMany: async () => ({ count: 0 }),
      },
    },
  };
});

vi.mock('./authSettingsService.js', () => ({
  AuthSettingsService: {
    getAuthSettings: async () => ({
      accessTokenExpiresIn: '1h',
      refreshTokenExpiresIn: '30d',
      userActivityThresholdDays: 30,
    }),
    parseExpiryTime: () => 3600,
    parseExpiryTimeMs: (value: string) => (value === '30d' ? 30 * 86_400_000 : 3_600_000),
  },
}));

vi.mock('bcryptjs', () => ({
  default: { compare: async (value: string) => value !== 'wrong', hash: async (value: string) => value },
}));

import { authenticateToken } from '../middleware/auth.js';
import { AuthService, REFRESH_ROTATION_GRACE_MS } from './authService.js';
import {
  SESSION_TOUCH_INTERVAL_MS,
  clearSessionCache,
  getClientGeo,
  getClientIp,
  listLoginAttempts,
  listSessions,
  parseUserAgent,
  revokeSessions,
} from './authSessionService.js';

const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const login = () => AuthService.login({ email: 'a@example.test', password: 'x' }, { userAgent: 'u'.repeat(300), ip: '1.1.1.1' });
const refresh = (token: string) => AuthService.refreshToken({ refreshToken: token });
const sidOf = (token: string) => (jwt.decode(token) as { sid: string }).sid;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-26T10:00:00Z') });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  db.users = [{
    id: 1,
    email: 'a@example.test',
    password: 'hash',
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    lastLoginAt: null,
  }];
  db.sessions = [];
  db.attempts = [];
  clearSessionCache();
});

const callMiddleware = async (accessToken: string) => {
  const req: any = { ip: '10.0.0.1', headers: {}, cookies: { accessToken, refreshToken: 'x' }, get: () => undefined };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  const next = vi.fn();
  await authenticateToken(req, res, next);
  return { res, next };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('login', () => {
  it('creates a session per device and puts sid into both tokens', async () => {
    const first = await login();
    const second = await login();

    expect(db.sessions).toHaveLength(2);
    expect(db.sessions[0].tokenHash).toBe(sha(first.refreshToken));
    expect(db.sessions[0].userAgent).toHaveLength(255);
    expect(sidOf(first.token)).toBe(db.sessions[0].id);
    expect(sidOf(second.refreshToken)).toBe(db.sessions[1].id);
  });

  it('keeps recently ended sessions as history and purges those older than 90 days', async () => {
    await login();
    await login();
    db.sessions[0].expiresAt = new Date(Date.now() - 91 * 86_400_000);
    db.sessions[1].expiresAt = new Date(Date.now() - 1);
    await login();

    expect(db.sessions).toHaveLength(2);
  });

  it('records successful and failed attempts', async () => {
    await login();
    await expect(AuthService.login({ email: 'a@example.test', password: 'wrong' })).rejects.toThrow();
    await expect(AuthService.login({ email: 'b@example.test', password: 'x' })).rejects.toThrow();

    expect(db.attempts.map((a) => [a.success, a.reason])).toEqual([
      [true, null],
      [false, 'bad_password'],
      [false, 'unknown_email'],
    ]);
  });
});

describe('refreshToken', () => {
  it('rotates the refresh token', async () => {
    const { refreshToken: old } = await login();
    const result = await refresh(old);

    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(old);
    expect(db.sessions[0].tokenHash).toBe(sha(result.refreshToken!));
    expect(db.sessions[0].prevTokenHash).toBe(sha(old));
  });

  it('issues only an access token for the previous token within the grace period', async () => {
    const { refreshToken: old } = await login();
    const winner = await refresh(old);
    vi.advanceTimersByTime(REFRESH_ROTATION_GRACE_MS - 1000);
    const replay = await refresh(old);

    expect(replay.token).toBeTruthy();
    expect(replay.refreshToken).toBeNull();
    expect(db.sessions[0].tokenHash).toBe(sha(winner.refreshToken!));
  });

  it('rejects the previous token after the grace period', async () => {
    const { refreshToken: old } = await login();
    await refresh(old);
    vi.advanceTimersByTime(REFRESH_ROTATION_GRACE_MS + 1000);

    await expect(refresh(old)).rejects.toMatchObject({ code: 'REFRESH_INVALID' });
  });

  it('rotates only once for two parallel requests', async () => {
    const { refreshToken: old } = await login();
    const results = await Promise.all([refresh(old), refresh(old)]);
    const rotated = results.filter((r) => r.refreshToken !== null);

    expect(rotated).toHaveLength(1);
    expect(results.every((r) => r.token)).toBe(true);
    expect(db.sessions[0].tokenHash).toBe(sha(rotated[0].refreshToken!));
  });

  it('rejects a deactivated user', async () => {
    const { refreshToken } = await login();
    db.users[0].isActive = false;

    await expect(refresh(refreshToken)).rejects.toMatchObject({ code: 'USER_BLOCKED' });
  });

  it('blocks an inactive user and revokes all sessions', async () => {
    const { refreshToken } = await login();
    await login();
    db.users[0].lastActivityAt = new Date(Date.now() - 31 * 86_400_000);

    await expect(refresh(refreshToken)).rejects.toMatchObject({ code: 'USER_BLOCKED' });
    expect(db.users[0].isActive).toBe(false);
    expect(db.sessions.map((s) => s.revokedReason)).toEqual(['inactivity', 'inactivity']);
  });
});

describe('logout', () => {
  it('revokes only the session with the given sid', async () => {
    const first = await login();
    await login();
    await AuthService.logout(1, sidOf(first.token));

    expect(db.sessions.map((s) => s.revokedReason ?? null)).toEqual(['logout', null]);
  });

  it('keeps new sessions when a legacy token without sid logs out', async () => {
    await login();
    await login();
    await AuthService.logout(1);

    expect(db.sessions.every((s) => !s.revokedAt)).toBe(true);
  });
});

describe('revoke', () => {
  it('does not refresh a revoked session, even within the grace period', async () => {
    const first = await login();
    const rotated = await refresh(first.refreshToken);
    await revokeSessions(1, { reason: 'admin_revoke', byUserId: 2, sessionIds: [sidOf(first.token)] });

    await expect(refresh(rotated.refreshToken!)).rejects.toMatchObject({ code: 'REFRESH_INVALID' });
    await expect(refresh(first.refreshToken)).rejects.toMatchObject({ code: 'REFRESH_INVALID' });
  });

  it('makes the middleware answer SESSION_REVOKED right after revoke', async () => {
    const { token } = await login();
    const before = await callMiddleware(token);
    expect(before.next).toHaveBeenCalled();

    await revokeSessions(1, { reason: 'self_revoke', sessionIds: [sidOf(token)] });
    const after = await callMiddleware(token);

    expect(after.next).not.toHaveBeenCalled();
    expect(after.res.status).toHaveBeenCalledWith(401);
    expect(after.res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });

  it('keeps the current session when revoking others', async () => {
    const current = await login();
    await login();
    await login();
    const count = await revokeSessions(1, { reason: 'self_revoke', exceptSid: sidOf(current.token) });

    expect(count).toBe(2);
    expect(db.sessions.filter((s) => !s.revokedAt).map((s) => s.id)).toEqual([sidOf(current.token)]);
  });
});

describe('session activity and client data', () => {
  it('updates lastUsedAt on requests at most once per interval', async () => {
    const { token } = await login();
    const created = db.sessions[0].lastUsedAt.getTime();

    vi.advanceTimersByTime(1000);
    await callMiddleware(token);
    const first = db.sessions[0].lastUsedAt.getTime();
    expect(first).toBe(created + 1000);

    vi.advanceTimersByTime(SESSION_TOUCH_INTERVAL_MS - 1);
    await callMiddleware(token);
    expect(db.sessions[0].lastUsedAt.getTime()).toBe(first);

    vi.advanceTimersByTime(1);
    await callMiddleware(token);
    expect(db.sessions[0].lastUsedAt.getTime()).toBe(first + SESSION_TOUCH_INTERVAL_MS);
  });

  it('rewrites location on refresh only when the IP changes', async () => {
    const { refreshToken } = await AuthService.login(
      { email: 'a@example.test', password: 'x' },
      { ip: '203.0.113.1', city: 'Київ', country: 'UA' },
    );
    const same = await AuthService.refreshToken({ refreshToken }, { ip: '203.0.113.1', city: null });
    expect(db.sessions[0].city).toBe('Київ');

    await AuthService.refreshToken({ refreshToken: same.refreshToken! }, { ip: '203.0.113.2', city: 'Львів' });
    expect(db.sessions[0]).toMatchObject({ ip: '203.0.113.1', lastIp: '203.0.113.2', city: 'Львів', country: null });
  });

  it('trusts proxy headers only for connections from a private address', () => {
    const headers: Record<string, string> = {
      'cf-connecting-ip': '203.0.113.7',
      'cf-ipcity': Buffer.from('Київ', 'utf8').toString('latin1'),
      'cf-ipcountry': 'UA',
    };
    const request = (ip: string) => ({ ip, get: (name: string) => headers[name] }) as any;

    expect(getClientIp(request('127.0.0.1'))).toBe('203.0.113.7');
    expect(getClientGeo(request('127.0.0.1'))).toEqual({ city: 'Київ', region: null, country: 'UA' });
    expect(getClientIp(request('198.51.100.1'))).toBe('198.51.100.1');
    expect(getClientGeo(request('198.51.100.1'))).toEqual({ city: null, region: null, country: null });
  });

  it('stores browser and OS names without versions', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

    expect(parseUserAgent(iphone)).toEqual({ deviceType: 'mobile', browser: 'Safari', os: 'iOS' });
  });
});

describe('pagination', () => {
  /** active активних сесій і ended завершених; ended-0 найновіша */
  const seed = (active: number, ended: number) => {
    const now = Date.now();
    const row = (id: string, extra: object) => ({
      id,
      userId: 1,
      createdAt: new Date(now - 86_400_000),
      lastUsedAt: new Date(now),
      expiresAt: new Date(now + 86_400_000),
      revokedAt: null,
      revokedReason: null,
      ...extra,
    });
    db.sessions = [
      ...Array.from({ length: active }, (_, i) => row(`active-${i}`, {})),
      ...Array.from({ length: ended }, (_, i) => {
        const endedAt = new Date(now - (i + 1) * 1000);
        // Парні відкликані, непарні прострочені: сортуються разом за часом завершення
        return row(`ended-${i}`, i % 2 ? { expiresAt: endedAt } : { revokedAt: endedAt, revokedReason: 'logout' });
      }),
    ];
  };
  const endedIds = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `ended-${from + i}`);

  it('fills the first page with ended sessions up to the limit', async () => {
    seed(3, 20);
    const page = await listSessions(1, 'active-2');

    expect(page.sessions).toHaveLength(10);
    expect(page.sessions[0].id).toBe('active-2');
    expect(page.sessions.slice(3).map((s) => s.id)).toEqual(endedIds(0, 7));
    expect(page.hasMore).toBe(true);
  });

  it('returns every active session even above the limit', async () => {
    seed(12, 2);
    const page = await listSessions(1, undefined);

    expect(page.sessions).toHaveLength(12);
    expect(page.sessions.every((s) => s.isActive)).toBe(true);
    expect(page.hasMore).toBe(true);
  });

  it('pages through the remaining ended sessions', async () => {
    seed(3, 20);
    const second = await listSessions(1, undefined, 7);
    const third = await listSessions(1, undefined, 17);

    expect(second.sessions.map((s) => s.id)).toEqual(endedIds(7, 17));
    expect(second.hasMore).toBe(true);
    expect(third.sessions.map((s) => s.id)).toEqual(endedIds(17, 20));
    expect(third.hasMore).toBe(false);
  });

  it('pages failed login attempts only', async () => {
    await login();
    for (let i = 0; i < 12; i++) {
      await expect(AuthService.login({ email: 'a@example.test', password: 'wrong' })).rejects.toThrow();
    }
    const first = await listLoginAttempts(1);
    const rest = await listLoginAttempts(1, 10);

    expect(first!.attempts).toHaveLength(10);
    expect(first!.hasMore).toBe(true);
    expect(rest!.attempts).toHaveLength(2);
    expect(rest!.hasMore).toBe(false);
  });
});
