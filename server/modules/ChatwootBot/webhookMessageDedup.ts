/** Короткочасний dedup однакових message_created (Chatwoot інколи шле дублікати). */

const TTL_MS = 10 * 60 * 1000;
const seen = new Map<number, number>();

export function isDuplicateWebhookMessage(messageId: number | null): boolean {
  if (messageId == null || !Number.isFinite(messageId)) return false;

  const now = Date.now();
  for (const [id, at] of seen) {
    if (now - at > TTL_MS) seen.delete(id);
  }

  if (seen.has(messageId)) return true;
  seen.set(messageId, now);
  return false;
}
