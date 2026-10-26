/** Чи є товар комплектом (набором) за полем set у каталозі. */
export function productIsSet(rawSet: unknown): boolean {
  if (Array.isArray(rawSet)) return rawSet.length > 0;
  if (typeof rawSet !== 'string' || !rawSet.trim()) return false;
  try {
    const parsed = JSON.parse(rawSet);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
