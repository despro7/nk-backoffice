import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

vi.mock('../services/authService.js', () => ({ AuthService: {} }));
vi.mock('../services/RoleService.js', () => ({ roleService: {} }));
vi.mock('../services/authSessionService.js', () => ({
  isSessionActive: vi.fn(),
  touchSession: vi.fn(),
}));

import { isValidSystemRequest } from './auth.js';

const TOKEN = 'a'.repeat(40);

function makeReq(headers: Record<string, string>, ip = '127.0.0.1'): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ip, get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

describe('isValidSystemRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects the legacy localhost + x-system-request header', () => {
    vi.stubEnv('SYSTEM_REQUEST_TOKEN', TOKEN);
    expect(isValidSystemRequest(makeReq({ 'x-system-request': 'true' }))).toBe(false);
  });

  it('is disabled when SYSTEM_REQUEST_TOKEN is not set', () => {
    vi.stubEnv('SYSTEM_REQUEST_TOKEN', '');
    expect(isValidSystemRequest(makeReq({ 'x-system-token': '' }))).toBe(false);
  });

  it('is disabled when SYSTEM_REQUEST_TOKEN is too short', () => {
    vi.stubEnv('SYSTEM_REQUEST_TOKEN', 'short');
    expect(isValidSystemRequest(makeReq({ 'x-system-token': 'short' }))).toBe(false);
  });

  it('rejects a wrong token', () => {
    vi.stubEnv('SYSTEM_REQUEST_TOKEN', TOKEN);
    expect(isValidSystemRequest(makeReq({ 'x-system-token': 'b'.repeat(40) }))).toBe(false);
  });

  it('accepts the matching token regardless of IP', () => {
    vi.stubEnv('SYSTEM_REQUEST_TOKEN', TOKEN);
    expect(isValidSystemRequest(makeReq({ 'x-system-token': TOKEN }, '203.0.113.7'))).toBe(true);
  });
});
