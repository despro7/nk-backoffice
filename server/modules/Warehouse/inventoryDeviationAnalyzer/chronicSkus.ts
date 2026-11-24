import type { DeviationResidualLine, DeviationResidualPattern } from '../../../../shared/types/inventoryDeviationHints.js';
import type { DeviationVector } from './deviationVector.js';

export const HISTORY_SESSIONS = 6;
export const CHRONIC_MIN_HITS = 3;

export interface PreviousSessionDeviation {
  sessionId: number;
  deviation: DeviationVector;
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * Закономірності залишку: `chronic` – відхилення того ж знака у >= 3 попередніх сесіях.
 * `reversal` (протилежне попередньому) не шукаємо: завершення інвентаризації не коригує облік,
 * тож протилежний знак не є ознакою помилки підрахунку.
 */
export function detectResidualPatterns(
  residual: DeviationResidualLine[],
  previous: PreviousSessionDeviation[],
): DeviationResidualLine[] {
  return residual.map((line) => {
    const history = previous
      .map((p) => ({ sessionId: p.sessionId, deviation: p.deviation.get(line.sku) ?? 0 }))
      .filter((h) => h.deviation !== 0);
    const hits = history.filter((h) => sign(h.deviation) === sign(line.deviation)).length;
    if (hits < CHRONIC_MIN_HITS) return line;
    const pattern: DeviationResidualPattern = { kind: 'chronic', hits, history };
    return { ...line, pattern };
  });
}

/** Розсіяні ±1 без закономірностей: схоже на помилки підрахунку. */
export function isCountingNoise(residual: DeviationResidualLine[], hypothesesCount: number): boolean {
  if (hypothesesCount > 0 || residual.length < 3) return false;
  if (residual.some((r) => r.pattern)) return false;
  const ones = residual.filter((r) => Math.abs(r.deviation) === 1).length;
  return ones / residual.length >= 0.7;
}
