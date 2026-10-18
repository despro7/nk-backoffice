/**
 * human_agent_active може сипатися на кожне повідомлення клієнта → оператору.
 * У журнал пишемо лише перший раз на conversation за TTL (відладка без спаму).
 */

const TTL_MS = 30 * 60 * 1000;
const seen = new Map<number, number>();

/** `true` – слот вільний, варто persist у event log. */
export function claimHumanAgentActivePersistSlot(conversationId: number): boolean {
  if (!Number.isFinite(conversationId) || conversationId <= 0) return true;

  const now = Date.now();
  for (const [id, at] of seen) {
    if (now - at > TTL_MS) seen.delete(id);
  }

  if (seen.has(conversationId)) return false;
  seen.set(conversationId, now);
  return true;
}

/** Після debug-unassign – дозволити знову записати human_agent_active у журнал. */
export function releaseHumanAgentActivePersistSlot(conversationId: number): void {
  seen.delete(conversationId);
}

/** Лише для тестів. */
export function clearHumanAgentActivePersistGateForTests(): void {
  seen.clear();
}
