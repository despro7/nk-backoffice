import { logServer } from '../../lib/utils.js';
import type { ChatwootBotSettings, ChatwootInboxSchedule } from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { isWithinHandoverHours } from './ChatwootBotHandoverUtils.js';
import { isWithinChatwootInboxSchedule } from './ChatwootBotInboxHours.js';

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = {
  schedule: ChatwootInboxSchedule;
  expiresAt: number;
};

function resolveInboxApiToken(settings: ChatwootBotSettings): string {
  return settings.inboxApiAccessToken.trim() || settings.apiAccessToken;
}

export class ChatwootBotInboxHoursService {
  private cache = new Map<number, CacheEntry>();

  invalidateCache(inboxId?: number): void {
    if (inboxId != null) {
      this.cache.delete(inboxId);
      return;
    }
    this.cache.clear();
  }

  async getSchedule(settings: ChatwootBotSettings, inboxId: number): Promise<ChatwootInboxSchedule | null> {
    const now = Date.now();
    const cached = this.cache.get(inboxId);
    if (cached && cached.expiresAt > now) {
      return cached.schedule;
    }

    const token = resolveInboxApiToken(settings);
    if (!token || !settings.baseUrl) return null;

    try {
      const client = createChatwootApiClient({
        baseUrl: settings.baseUrl,
        accountId: settings.accountId,
        apiAccessToken: token,
      });
      const schedule = await client.getInboxSchedule(inboxId);
      this.cache.set(inboxId, { schedule, expiresAt: now + CACHE_TTL_MS });
      return schedule;
    } catch (err) {
      logServer(`[ChatwootBot] getInboxSchedule failed inbox=${inboxId}`, err);
      return null;
    }
  }

  async isWithinBusinessHours(
    settings: ChatwootBotSettings,
    inboxId: number | null,
    now = new Date(),
    options?: { skipCache?: boolean },
  ): Promise<{ inHours: boolean; source: 'chatwoot_inbox' | 'settings_fallback' | 'always_open' }> {
    if (options?.skipCache && inboxId != null) {
      this.invalidateCache(inboxId);
    }

    if (!inboxId) {
      return {
        inHours: isWithinHandoverHours(settings, now),
        source: 'settings_fallback',
      };
    }

    const schedule = await this.getSchedule(settings, inboxId);
    if (!schedule) {
      return {
        inHours: isWithinHandoverHours(settings, now),
        source: 'settings_fallback',
      };
    }

    if (!schedule.workingHoursEnabled) {
      return { inHours: true, source: 'always_open' };
    }

    return {
      inHours: isWithinChatwootInboxSchedule(schedule, now),
      source: 'chatwoot_inbox',
    };
  }
}

export const chatwootBotInboxHoursService = new ChatwootBotInboxHoursService();
