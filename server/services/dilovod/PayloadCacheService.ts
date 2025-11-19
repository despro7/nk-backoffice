import { randomUUID } from 'crypto';

type CacheEntry = {
  token: string;
  data: any;
  expiresAt: number;
  createdAt: number;
};

class PayloadCacheService {
  private cache = new Map<string, CacheEntry>();

  constructor() {
    // Garbage collector to cleanup expired tokens every minute
    setInterval(() => this.cleanupExpired(), 60 * 1000);
  }

  save(data: any, ttlSeconds = 600): string {
    const token = randomUUID();
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    this.cache.set(token, { token, data, expiresAt, createdAt: now });

    return token;
  }

  get(token: string, singleUse = true): any | null {
    if (!token) return null;
    const entry = this.cache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(token);
      return null;
    }
    const data = entry.data;
    if (singleUse) this.cache.delete(token);
    return data;
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [token, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) this.cache.delete(token);
    }
  }
}

export const payloadCacheService = new PayloadCacheService();
