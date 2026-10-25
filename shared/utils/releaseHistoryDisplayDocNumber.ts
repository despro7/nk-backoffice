/** Короткий номер для UI історії: K-000452 → №452 (повний K-… лишається в БД / Dilovod). */
export function formatReleaseInternalDocDisplayNumber(
  internalDocNumber: string | null | undefined,
): string | null {
  const raw = String(internalDocNumber ?? '').trim();
  if (!raw) return null;

  const prefixed = /^K-0*(\d+)$/i.exec(raw);
  if (prefixed) {
    return `№${Number(prefixed[1])}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits) return `№${Number(digits)}`;
  return raw;
}

export function parseReleaseInternalDocNumericId(
  internalDocNumber: string | null | undefined,
  fallbackId?: number,
): number {
  const raw = String(internalDocNumber ?? '').trim();
  const prefixed = /^K-0*(\d+)$/i.exec(raw);
  if (prefixed) return Number(prefixed[1]);
  const digits = raw.replace(/\D/g, '');
  if (digits) return Number(digits);
  if (Number.isFinite(fallbackId)) return Number(fallbackId);
  return 0;
}
