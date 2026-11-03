import { describe, it, expect, vi, afterEach } from 'vitest';
import { payloadCacheService } from '../PayloadCacheService.js';

describe('PayloadCacheService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should save and get payload', () => {
    const payload = { x: 1 };
    const token = payloadCacheService.save({ payload }, 60);
    expect(typeof token).toBe('string');
    const fetched = payloadCacheService.get(token);
    expect(fetched).not.toBeNull();
    expect(fetched.payload).toEqual(payload);
  });

  it('should remove token on single-use', () => {
    const payload = { y: 2 };
    const token = payloadCacheService.save({ payload }, 60);
    const first = payloadCacheService.get(token);
    expect(first).not.toBeNull();
    const second = payloadCacheService.get(token);
    expect(second).toBeNull();
  });

  it('should keep token until ttl and expire after it', () => {
    vi.useFakeTimers();
    const token = payloadCacheService.save({ payload: { z: 3 } }, 1);
    vi.advanceTimersByTime(999);
    expect(payloadCacheService.get(token, false)).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(payloadCacheService.get(token)).toBeNull();
  });
});
