/**
 * Серіалізація обробки webhook по conversation_id — уникаємо паралельних POST у Chatwoot.
 */

const chains = new Map<number, Promise<unknown>>();

export function runWithConversationLock<T>(
  conversationId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = chains.get(conversationId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => fn());

  chains.set(conversationId, next);

  void next.finally(() => {
    if (chains.get(conversationId) === next) {
      chains.delete(conversationId);
    }
  });

  return next;
}
