const EDIT_MARKER = 'Редакція →';
const LEGACY_EDIT_PREFIX = 'Редаговано в backoffice';

/** Суфікс редакції для Dilovod remark (без деталей змін). */
export function buildWarehouseReleaseEditRemarkNote(
  editorLabel: string,
  _changes?: Array<{ field: string; from: unknown; to: unknown }>,
): string {
  const who = editorLabel.trim() || 'користувач';
  const when = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  return `${EDIT_MARKER} ${who}, ${when}`;
}

/** Прибирає попередні маркери редакції, залишає оригінальний коментар. */
export function stripWarehouseReleaseEditRemarkSuffixes(remark: string): string {
  let result = String(remark ?? '').trim();
  if (!result) return '';

  // без \b після «→» — стрілка не word-char, boundary не спрацьовує
  const editTail =
    /^(.*?)\s*\|\s*(?:Редакція\s*→|Редаговано в backoffice)[\s\S]*$/i;

  for (;;) {
    const pipeMatch = editTail.exec(result);
    if (pipeMatch) {
      result = String(pipeMatch[1] ?? '').trim();
      continue;
    }
    if (
      result.startsWith(EDIT_MARKER)
      || result.startsWith(LEGACY_EDIT_PREFIX)
    ) {
      return '';
    }
    break;
  }

  return result;
}

/**
 * Дописує короткий маркер редакції до оригінального коментаря:
 * `[ориг] | Редакція → Name, 16.10.2026, 04:03:51`
 * Повторне редагування замінює попередній суфікс редакції.
 */
export function appendWarehouseReleaseDilovodRemark(
  previousRemark: string | null | undefined,
  editNote: string,
): string {
  const base = stripWarehouseReleaseEditRemarkSuffixes(String(previousRemark ?? ''));
  const note = String(editNote ?? '').trim();
  if (!base) return note;
  if (!note) return base;
  return `${base} | ${note}`;
}

export function extractDilovodRemarkFromReleaseItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  if (!first || typeof first !== 'object') return null;
  const raw = (first as { dilovod_remark?: unknown }).dilovod_remark;
  const value = String(raw ?? '').trim();
  return value || null;
}
