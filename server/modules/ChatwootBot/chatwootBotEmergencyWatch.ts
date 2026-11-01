/**
 * Екстрені виклики, що чекають на першу публічну відповідь оператора.
 * Таймер у памʼяті процесу: після рестарту сервера він зникає, і розмова далі живе за правилами reclaim.
 */

type Watch = { startedAt: number; deadline: number; timer: ReturnType<typeof setTimeout> };

const watches = new Map<number, Watch>();

/** Поки триває очікування — бот не забирає розмову через «оператор офлайн». */
export function isEmergencyWatchActive(conversationId: number, now = Date.now()): boolean {
  const watch = watches.get(conversationId);
  return Boolean(watch && now < watch.deadline);
}

export function emergencyWatchStartedAt(conversationId: number): number | null {
  return watches.get(conversationId)?.startedAt ?? null;
}

export function startEmergencyWatch(
  conversationId: number,
  timeoutMs: number,
  onTimeout: (startedAt: number) => Promise<void>,
): void {
  clearEmergencyWatch(conversationId);
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    watches.delete(conversationId);
    void onTimeout(startedAt);
  }, timeoutMs);
  // Не тримає процес живим (тести, graceful shutdown).
  timer.unref?.();
  watches.set(conversationId, { startedAt, deadline: startedAt + timeoutMs, timer });
}

export function clearEmergencyWatch(conversationId: number): void {
  const watch = watches.get(conversationId);
  if (watch) clearTimeout(watch.timer);
  watches.delete(conversationId);
}

/** Оператор відповів публічно після старту виклику? `minutesSinceReply` — з `minutesSinceLastAgentPublicReply`. */
export function agentRepliedSince(startedAt: number, minutesSinceReply: number | null, now = Date.now()): boolean {
  if (minutesSinceReply == null) return false;
  return now - minutesSinceReply * 60_000 >= startedAt;
}
