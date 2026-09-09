/**
 * Dilovod `goodPart` = 0 або порожньо означає «партія не привʼязана».
 * Справжні ID — довгі числові рядки (напр. 1112200000001986).
 */
export function isUsableDilovodBatchId(value: unknown): boolean {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return false;
  if (!/^\d{10,}$/.test(raw)) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

/** Чи виглядає значення як людська назва партії (не сирий Dilovod ID). */
export function isHumanBatchLabel(value: unknown): boolean {
  const label = String(value ?? '').trim();
  if (!label || label === '—' || label === 'невідома') return false;
  return !isUsableDilovodBatchId(label);
}

/**
 * Чи потрібно дорезолвити назву партії (порожня / «—» / дорівнює id).
 */
export function batchNumberNeedsResolution(
  batchNumber: unknown,
  batchId: unknown,
): boolean {
  const label = String(batchNumber ?? '').trim();
  const id = String(batchId ?? '').trim();
  if (!label || label === '—' || label === 'невідома') {
    return Boolean(id);
  }
  if (id && label === id) return true;
  if (isUsableDilovodBatchId(label) && (!id || label === id)) return true;
  return false;
}

/**
 * Перший кандидат, що виглядає як людська назва партії (не сирий id).
 * У Dilovod номер партії може лежати в code / name.uk / number / __pr.
 */
export function pickHumanBatchLabel(
  batchId: unknown,
  ...candidates: unknown[]
): string | null {
  const id = String(batchId ?? '').trim();
  for (const candidate of candidates) {
    const label = String(candidate ?? '').trim();
    if (!label) continue;
    if (id && label === id) continue;
    if (!isHumanBatchLabel(label)) continue;
    return label;
  }
  return null;
}

/**
 * Для запису в каталог / UI: null, якщо назва порожня або = сирий goodPart id.
 */
export function sanitizeStoredBatchName(
  name: unknown,
  batchId: unknown,
): string | null {
  return pickHumanBatchLabel(batchId, name);
}

/** Dilovod-дата відсутня або «нульова» (0000-00-00 …). */
export function isMissingDilovodDate(value: unknown): boolean {
  const raw = String(value ?? '').trim();
  return !raw || raw.startsWith('0000-00-00');
}

/**
 * Номер партії YMMDD (5 цифр): [остання цифра року][місяць MM][день DD].
 * Приклад: 2026-09-05 → `60905`.
 */
export function generateBatchSerialFromDate(date: unknown): string | null {
  if (isMissingDilovodDate(date)) return null;
  const day = String(date).trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [, year, month, dayOfMonth] = match;
  return `${year.slice(-1)}${month}${dayOfMonth}`;
}
