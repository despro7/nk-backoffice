import { describe, expect, it } from 'vitest';
import {
  activeVerifiedOrderIds,
  bumpVerifyRate,
  decryptPhone,
  emptyConversationState,
  encryptPhone,
  isVerifyRateLimited,
  parseVerifiedOrderIds,
} from './chatwootBotConversationStateUtils.js';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const RATE = { windowMinutes: 15, maxAttempts: 5 };

describe('phone encryption', () => {
  it('round-trips and does not store plain digits', () => {
    const enc = encryptPhone('+380978244639', 'secret');
    expect(enc).not.toContain('978244639');
    expect(decryptPhone(enc, 'secret')).toBe('+380978244639');
  });

  it('returns null for wrong key or garbage', () => {
    const enc = encryptPhone('+380978244639', 'secret');
    expect(decryptPhone(enc, 'other')).toBeNull();
    expect(decryptPhone('plain-text', 'secret')).toBeNull();
  });
});

describe('verify session and rate limit', () => {
  it('returns order ids only while session is active', () => {
    const state = { ...emptyConversationState(1), verifiedOrderIds: [7], verifyExpiresAt: new Date(NOW + 60_000) };
    expect(activeVerifiedOrderIds(state, NOW)).toEqual([7]);
    expect(activeVerifiedOrderIds({ ...state, verifyExpiresAt: new Date(NOW - 1) }, NOW)).toEqual([]);
  });

  it('limits attempts inside the window and resets after it', () => {
    const inWindow = { ...emptyConversationState(1), rateWindowStart: new Date(NOW - 60_000), rateCount: 5 };
    expect(isVerifyRateLimited(inWindow, RATE, NOW)).toBe(true);
    const expired = { ...inWindow, rateWindowStart: new Date(NOW - 16 * 60_000) };
    expect(isVerifyRateLimited(expired, RATE, NOW)).toBe(false);
    expect(bumpVerifyRate(expired, RATE, NOW)).toEqual({ rateWindowStart: new Date(NOW), rateCount: 1 });
    expect(bumpVerifyRate({ ...inWindow, rateCount: 2 }, RATE, NOW).rateCount).toBe(3);
  });

  it('parses stored order ids defensively', () => {
    expect(parseVerifiedOrderIds([1, '2', 'x', -3])).toEqual([1, 2]);
    expect(parseVerifiedOrderIds('[1]')).toEqual([]);
  });
});
