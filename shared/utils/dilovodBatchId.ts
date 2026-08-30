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
