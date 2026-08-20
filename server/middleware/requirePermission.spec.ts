import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { INSUFFICIENT_ROLE_HEADER } from '../../shared/constants/roles';
import { createRequirePermission } from './requirePermission';

function mockRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    setHeader: (key: string, value: string) => {
      headers[key] = value;
      return res;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      res.body = body;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: { code?: string }; headers: Record<string, string> };
}

describe('requirePermission', () => {
  it('returns 401 without user', async () => {
    const mw = createRequirePermission(async () => true)('action.users.manage');
    const res = mockRes();
    const next = vi.fn();
    await mw({} as Request, res, next as NextFunction);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets cron userId 0 through', async () => {
    const hasPermission = vi.fn(async () => false);
    const mw = createRequirePermission(hasPermission)('action.users.manage');
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 0, role: 'admin' } } as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('returns 403 with INSUFFICIENT_ROLE when the key is missing', async () => {
    const mw = createRequirePermission(async () => false)('action.users.manage');
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 1, role: 'storekeeper' } } as Request, res, next as NextFunction);
    expect(res.statusCode).toBe(403);
    expect(res.headers[INSUFFICIENT_ROLE_HEADER]).toBe('1');
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when permission is granted', async () => {
    const mw = createRequirePermission(async () => true)('action.users.manage');
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 1, role: 'admin' } } as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});
