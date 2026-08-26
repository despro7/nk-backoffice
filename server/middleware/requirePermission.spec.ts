import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { INSUFFICIENT_ROLE_HEADER } from '../../shared/constants/roles';
import { actionKey, pageKey, resetActionRegistry } from '../../shared/constants/permissions';
import { createRequirePermission, createRequirePermissionKey } from './requirePermission';

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
  beforeEach(() => {
    resetActionRegistry();
  });

  it('returns 401 without user', async () => {
    const mw = createRequirePermission(async () => true)('users', 'manage', 'Керувати користувачами');
    const res = mockRes();
    const next = vi.fn();
    await mw({} as Request, res, next as NextFunction);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets cron userId 0 through', async () => {
    const hasPermission = vi.fn(async () => false);
    const mw = createRequirePermission(hasPermission)('users', 'manage', 'Керувати користувачами');
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 0, role: 'admin' } } as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('returns 403 with INSUFFICIENT_ROLE when the key is missing', async () => {
    const mw = createRequirePermission(async () => false)('users', 'manage', 'Керувати користувачами');
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 1, role: 'storekeeper' } } as Request, res, next as NextFunction);
    expect(res.statusCode).toBe(403);
    expect(res.headers[INSUFFICIENT_ROLE_HEADER]).toBe('1');
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when permission is granted', async () => {
    const mw = createRequirePermission(async () => true)('users', 'manage', 'Керувати користувачами');
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 1, role: 'admin' } } as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('exposes the assembled key and can be reused as a guard', async () => {
    const requirePermission = createRequirePermission(async () => true);
    const usersManage = requirePermission('users', 'manage', 'Керувати користувачами');
    expect(usersManage.key).toBe(actionKey('users', 'manage'));
    const res = mockRes();
    const next = vi.fn();
    await usersManage({ user: { userId: 1, role: 'admin' } } as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requirePermissionKey', () => {
  it('does not register an action and checks the given key', async () => {
    const hasPermission = vi.fn(async (_slug: string, key: string) => key === pageKey('accounting', 'cashIn'));
    const mw = createRequirePermissionKey(hasPermission)(pageKey('accounting', 'cashIn'));
    expect(mw.key).toBe(pageKey('accounting', 'cashIn'));
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 1, role: 'admin' } } as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(hasPermission).toHaveBeenCalledWith('admin', pageKey('accounting', 'cashIn'));
  });

  it('returns 403 when the existing key is missing', async () => {
    const mw = createRequirePermissionKey(async () => false)(pageKey('accounting', 'cashIn'));
    const res = mockRes();
    const next = vi.fn();
    await mw({ user: { userId: 1, role: 'boss' } } as Request, res, next as NextFunction);
    expect(res.statusCode).toBe(403);
    expect(res.headers[INSUFFICIENT_ROLE_HEADER]).toBe('1');
    expect(next).not.toHaveBeenCalled();
  });
});
