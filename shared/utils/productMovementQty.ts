/** Порог для трактування значення як цілої порції після згортання рядків Dilovod. */
export const PRODUCT_MOVEMENT_PORTION_EPSILON = 1e-6;

/**
 * Нормалізує кількість порцій: цілі після згортання, інакше до 3 знаків.
 */
export function normalizePortionQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) < PRODUCT_MOVEMENT_PORTION_EPSILON) return 0;
  const asInt = Math.round(value);
  if (Math.abs(value - asInt) < PRODUCT_MOVEMENT_PORTION_EPSILON) return asInt;
  return Math.round(value * 1000) / 1000;
}

export function normalizeNullablePortionQty(value: number | null | undefined): number | null {
  if (value == null) return null;
  const normalized = normalizePortionQty(value);
  if (Math.abs(normalized) < PRODUCT_MOVEMENT_PORTION_EPSILON) return null;
  return normalized;
}
