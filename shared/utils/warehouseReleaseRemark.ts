const EDIT_PREFIX = 'Редаговано в backoffice';

export function buildWarehouseReleaseEditRemarkNote(
  editorLabel: string,
  changes: Array<{ field: string; from: unknown; to: unknown }>,
): string {
  const fieldLabels: Record<string, string> = {
    operDate: 'дата операції',
    comment: 'коментар',
    quantity: 'кількість',
    setSku: 'SKU набору',
  };

  const details = changes
    .map((change) => {
      const label = fieldLabels[change.field] ?? change.field;
      const from = change.from == null || change.from === '' ? '—' : String(change.from);
      const to = change.to == null || change.to === '' ? '—' : String(change.to);
      return `${label}: ${from} → ${to}`;
    })
    .join('; ');

  const who = editorLabel.trim() || 'користувач';
  const when = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  return `${EDIT_PREFIX} (${who}, ${when}): ${details}`;
}

export function appendWarehouseReleaseDilovodRemark(
  previousRemark: string | null | undefined,
  editNote: string,
): string {
  const parts = [String(previousRemark ?? '').trim(), String(editNote ?? '').trim()].filter(Boolean);
  return parts.join(' | ');
}

export function extractDilovodRemarkFromReleaseItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  if (!first || typeof first !== 'object') return null;
  const raw = (first as { dilovod_remark?: unknown }).dilovod_remark;
  const value = String(raw ?? '').trim();
  return value || null;
}
