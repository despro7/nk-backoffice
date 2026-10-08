const ACTION_LABELS: Record<string, string> = {
  release_updated: 'Змінено запис',
};

export function formatWarehouseReleaseAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatWarehouseReleaseAuditDetails(action: string, payload: unknown): string | null {
  if (action !== 'release_updated' || !payload || typeof payload !== 'object') return null;
  const changes = (payload as { changes?: Array<{ field: string; from: unknown; to: unknown }> }).changes;
  if (!Array.isArray(changes) || changes.length === 0) return null;

  const fieldLabels: Record<string, string> = {
    operDate: 'Дата операції',
    comment: 'Коментар',
    quantity: 'Кількість',
    setSku: 'SKU набору',
    batches: 'Партії',
    storageId: 'Склад',
    firmId: 'Фірма',
  };

  return changes
    .map((change) => {
      const label = fieldLabels[change.field] ?? change.field;
      const from = change.from == null || change.from === '' ? '—' : String(change.from);
      const to = change.to == null || change.to === '' ? '—' : String(change.to);
      return `${label}: ${from} → ${to}`;
    })
    .join('\n');
}

export function formatWarehouseReleaseAuditHeader(createdAt: string, userName: string | null): string {
  const date = new Date(createdAt);
  const when = Number.isNaN(date.getTime())
    ? createdAt
    : date.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  const who = userName?.trim() || 'Невідомий користувач';
  return `${when} · ${who}`;
}
