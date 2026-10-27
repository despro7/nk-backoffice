/** Склад оприбуткування з payload повернення (Dilovod / send). */
export function resolveReturnHistoryStorageId(record: { payload?: unknown }): string | null {
  let payload: unknown = record.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;

  const root = payload as Record<string, unknown>;
  const header = root.header && typeof root.header === 'object'
    ? (root.header as Record<string, unknown>)
    : null;

  const candidates = [
    header?.storage,
    header?.storageId,
    root.storage,
    root.storageId,
  ];

  for (const value of candidates) {
    const id = String(value ?? '').trim();
    if (id) return id;
  }

  return null;
}
