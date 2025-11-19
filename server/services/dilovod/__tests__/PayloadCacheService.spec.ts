import { describe, it, expect } from 'vitest';
import { payloadCacheService } from '../PayloadCacheService.js';

describe('PayloadCacheService', () => {
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

  it('should expire token after ttl', async () => {
    const payload = { z: 3 };
    const token = payloadCacheService.save({ payload }, 1); // 1 sec
    await new Promise(r => setTimeout(r, 1200));
    const fetched = payloadCacheService.get(token);
    expect(fetched).toBeNull();
  });

  it('should save sale token with baseDoc and person id', () => {
    const baseDoc = 'BASE123';
    const personId = 'P-999';
    const token = payloadCacheService.save({ baseDocId: baseDoc, personId }, 60);
    const fetched = payloadCacheService.get(token);
    expect(fetched).not.toBeNull();
    expect(fetched.baseDocId).toBe(baseDoc);
    expect(fetched.personId).toBe(personId);
  });
});
