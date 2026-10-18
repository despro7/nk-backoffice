import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { handoverAssignmentCredentials, hasHandoverUserPat } from './chatwootCredentials.js';
import { sanitizeChatwootApiToken } from './chatwootHttp.js';

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  byId: Map<number, string>;
};

let cache: CacheEntry | null = null;

async function loadAgentsMap(settings: ChatwootBotSettings): Promise<Map<number, string>> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.byId;
  }

  if (
    !settings.baseUrl.trim() ||
    (!hasHandoverUserPat(settings) && !sanitizeChatwootApiToken(settings.apiAccessToken))
  ) {
    return new Map();
  }

  const client = createChatwootApiClient(handoverAssignmentCredentials(settings));
  const agents = await client.listAgents();
  const byId = new Map<number, string>();
  for (const agent of agents) {
    byId.set(agent.id, String(agent.availabilityStatus ?? 'offline').toLowerCase());
  }
  cache = { expiresAt: now + CACHE_TTL_MS, byId };
  return byId;
}

/** `true` лише якщо агент у списку й статус offline. */
export async function isAssigneeOffline(
  settings: ChatwootBotSettings,
  assigneeId: number | null,
): Promise<boolean> {
  if (!assigneeId || assigneeId <= 0) return false;
  const map = await loadAgentsMap(settings);
  const status = map.get(assigneeId);
  if (!status) return false;
  return status === 'offline';
}

export function clearAgentsAvailabilityCacheForTests(): void {
  cache = null;
}
