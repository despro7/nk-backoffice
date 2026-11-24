import { negateVector, type DeviationVector } from './deviationVector.js';
import type { HypothesisCandidate } from './scoreHypotheses.js';

/** Рядок переміщення слабший за документ цілком: при рівному збігу виграє документ. */
export const MOVEMENT_LINE_PRIOR = 0.9;

/**
 * Одно-SKU кандидати по рядках переміщення: рядок не переміщено фізично (`-`)
 * або переміщено без документа (`+`). `posted` – вектор документа з поправкою на напрям складу.
 */
export function buildMovementLineCandidates(
  movementId: string | number,
  posted: DeviationVector,
  at: number,
  reference: NonNullable<HypothesisCandidate['reference']>,
): HypothesisCandidate[] {
  // Документ з одним рядком уже покритий кандидатами цілого документа
  if (posted.size < 2) return [];
  const out: HypothesisCandidate[] = [];
  for (const [sku, qty] of posted) {
    const single: DeviationVector = new Map([[sku, qty]]);
    out.push({ id: `mv-${movementId}-line-${sku}-notdone`, type: 'movement_mismatch', vector: negateVector(single), at, reference, prior: MOVEMENT_LINE_PRIOR });
    out.push({ id: `mv-${movementId}-line-${sku}-unposted`, type: 'movement_mismatch', vector: single, at, reference, prior: MOVEMENT_LINE_PRIOR });
  }
  return out;
}
