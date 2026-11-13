/**
 * Назва партії товару, створеної з картки: YMMDD без префіксів (61113 = 13.11.2026),
 * при зайнятому коді – суфікс YMMDD-N.
 */
import { generateBatchSerialFromDate } from './dilovodBatchId.js';

/** Базова назва партії YMMDD для дня `YYYY-MM-DD`. */
export function formatProductBatchBaseName(isoDay: string): string | null {
  return generateBatchSerialFromDate(isoDay);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Суфікс коду відносно базової назви: 0 для `61113`, N для `61113-N`, -1 якщо код не з цієї серії.
 * Без нормалізації K- префікса: партії комплектів (K-61113) до серії товару не належать.
 */
export function productBatchSuffix(code: string, baseName: string): number {
  const trimmed = String(code ?? '').trim();
  const base = String(baseName ?? '').trim();
  if (!trimmed || !base) return -1;
  if (trimmed === base) return 0;
  const match = new RegExp(`^${escapeRegex(base)}-(\\d+)$`).exec(trimmed);
  return match ? Number(match[1]) : -1;
}

export function isSameDayProductBatch(code: string, baseName: string): boolean {
  return productBatchSuffix(code, baseName) >= 0;
}

/** Перша вільна назва серії: base, якщо вільна, інакше base-(max+1). */
export function nextFreeProductBatchName(baseName: string, occupiedCodes: string[]): string {
  const base = String(baseName ?? '').trim();
  const suffixes = occupiedCodes
    .map((code) => productBatchSuffix(code, base))
    .filter((suffix) => suffix >= 0);
  if (!suffixes.includes(0)) return base;
  return `${base}-${Math.max(...suffixes) + 1}`;
}
