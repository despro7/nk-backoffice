import type {
  DeviationHypothesis,
  DeviationHypothesisConfidence,
  DeviationHypothesisKitQuantity,
  DeviationHypothesisReference,
  DeviationHypothesisType,
  DeviationResidualLine,
} from '../../../../shared/types/inventoryDeviationHints.js';
import type { DeviationVector } from './deviationVector.js';

export const MAX_HYPOTHESES = 5;
export const MIN_SCORE = 0.4;
export const HIGH_SCORE = 0.85;
export const MEDIUM_SCORE = 0.6;

export interface HypothesisCandidate {
  id: string;
  type: DeviationHypothesisType;
  /** Очікуваний внесок у відхилення (факт − облік) по SKU, зі знаком. */
  vector: DeviationVector;
  reference?: DeviationHypothesisReference;
  /** Час операції (ms, epoch); використовується для бонусу близькості до дати інвентаризації. */
  at?: number | null;
  /** Апріорна довіра до типу кандидата (множник скору, за замовчуванням 1). */
  prior?: number;
  swap?: { kind: 'component' | 'set'; expectedSku: string; actualSku: string };
  kit?: DeviationHypothesisKitQuantity;
}

export interface ScoreOptions {
  names: Map<string, string>;
  windowStart: number;
  windowEnd: number;
}

export interface ScoreResult {
  hypotheses: DeviationHypothesis[];
  totalDeviationUnits: number;
  explainedUnits: number;
  residual: DeviationResidualLine[];
}

interface VectorFit {
  explained: number;
  conflict: number;
  total: number;
  matchedSkus: number;
  exact: boolean;
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function fitVector(residual: DeviationVector, vector: DeviationVector): VectorFit {
  let explained = 0;
  let conflict = 0;
  let total = 0;
  let matchedSkus = 0;
  let exact = vector.size > 0;
  for (const [sku, v] of vector) {
    if (v === 0) continue;
    const d = residual.get(sku) ?? 0;
    total += Math.abs(v);
    if (d !== 0 && sign(d) === sign(v)) {
      const part = Math.min(Math.abs(d), Math.abs(v));
      explained += part;
      matchedSkus += 1;
      if (d !== v) exact = false;
    } else {
      conflict += Math.abs(v);
      exact = false;
    }
  }
  return { explained, conflict, total, matchedSkus, exact };
}

function proximityFactor(at: number | null | undefined, opts: ScoreOptions): number {
  if (at == null) return 1;
  const span = Math.max(1, opts.windowEnd - opts.windowStart);
  const dist = Math.min(span, Math.abs(opts.windowEnd - at));
  // 1.0 біля дати інвентаризації, до 0.9 на краю вікна
  return 1 - 0.1 * (dist / span);
}

export function scoreCandidate(residual: DeviationVector, candidate: HypothesisCandidate, opts: ScoreOptions): { score: number; fit: VectorFit } {
  const fit = fitVector(residual, candidate.vector);
  if (fit.total === 0 || fit.explained === 0) return { score: 0, fit };
  const base = (fit.explained - 0.5 * fit.conflict) / fit.total;
  const distinctBonus = 1 + 0.05 * Math.min(fit.matchedSkus - 1, 4);
  const prior = candidate.prior ?? 1;
  const score = Math.max(0, Math.min(1, base * distinctBonus * proximityFactor(candidate.at, opts) * prior));
  return { score, fit };
}

interface PreparedCandidate extends HypothesisCandidate {
  similarCount: number;
}

/** Одно-SKU кандидати з однаковим типом, SKU і кількістю схлопуються в один (найближчий до дати інвентаризації). */
function collapseSingleSku(candidates: HypothesisCandidate[], opts: ScoreOptions): PreparedCandidate[] {
  const groups = new Map<string, HypothesisCandidate[]>();
  const result: PreparedCandidate[] = [];
  for (const c of candidates) {
    if (c.vector.size === 1) {
      const [[sku, qty]] = [...c.vector.entries()];
      const key = `${c.type}|${sku}|${qty}`;
      const list = groups.get(key);
      if (list) list.push(c);
      else groups.set(key, [c]);
    } else if (c.vector.size > 1) {
      result.push({ ...c, similarCount: 1 });
    }
  }
  for (const list of groups.values()) {
    const best = [...list].sort(
      (a, b) => Math.abs(opts.windowEnd - (a.at ?? opts.windowEnd)) - Math.abs(opts.windowEnd - (b.at ?? opts.windowEnd)),
    )[0];
    result.push({ ...best, similarCount: list.length });
  }
  return result;
}

function confidenceFor(
  score: number,
  exact: boolean,
  similarCount: number,
  candidate?: HypothesisCandidate,
): DeviationHypothesisConfidence {
  if (similarCount > 1) return 'low';
  // Підміна без документа-посилання лишається припущенням
  const swapWithoutDoc = candidate?.swap != null && candidate.reference == null;
  if (score >= HIGH_SCORE && exact && !swapWithoutDoc) return 'high';
  if (score >= MEDIUM_SCORE) return 'medium';
  return 'low';
}

export function scoreHypotheses(
  deviation: DeviationVector,
  candidates: HypothesisCandidate[],
  opts: ScoreOptions,
): ScoreResult {
  const original = new Map(deviation);
  const residual = new Map(deviation);
  let totalDeviationUnits = 0;
  for (const v of original.values()) totalDeviationUnits += Math.abs(v);

  const pool = collapseSingleSku(candidates, opts);
  const hypotheses: DeviationHypothesis[] = [];
  let explainedUnits = 0;

  while (hypotheses.length < MAX_HYPOTHESES && residual.size > 0 && pool.length > 0) {
    let bestIdx = -1;
    let best: { score: number; fit: VectorFit } | null = null;
    for (let i = 0; i < pool.length; i++) {
      const scored = scoreCandidate(residual, pool[i], opts);
      if (!best || scored.score > best.score) {
        best = scored;
        bestIdx = i;
      }
    }
    if (!best || bestIdx < 0 || best.score < MIN_SCORE) break;

    const [picked] = pool.splice(bestIdx, 1);
    const lines = [...picked.vector.entries()].map(([sku, expected]) => ({
      sku,
      name: opts.names.get(sku) ?? sku,
      expected,
      actual: original.get(sku) ?? 0,
    }));
    hypotheses.push({
      id: picked.id,
      type: picked.type,
      confidence: confidenceFor(best.score, best.fit.exact, picked.similarCount, picked),
      score: Math.round(best.score * 100) / 100,
      lines,
      explainedUnits: best.fit.explained,
      ...(picked.reference ? { reference: picked.reference } : {}),
      ...(picked.swap
        ? {
            swap: {
              ...picked.swap,
              expectedName: opts.names.get(picked.swap.expectedSku) ?? picked.swap.expectedSku,
              actualName: opts.names.get(picked.swap.actualSku) ?? picked.swap.actualSku,
            },
          }
        : {}),
      ...(picked.kit ? { kit: picked.kit } : {}),
      ...(picked.similarCount > 1 ? { similarCount: picked.similarCount } : {}),
    });
    explainedUnits += best.fit.explained;

    for (const [sku, v] of picked.vector) {
      const d = residual.get(sku) ?? 0;
      if (d === 0 || sign(d) !== sign(v)) continue;
      const next = sign(d) * (Math.abs(d) - Math.min(Math.abs(d), Math.abs(v)));
      if (next === 0) residual.delete(sku);
      else residual.set(sku, next);
    }
  }

  const residualLines: DeviationResidualLine[] = [...residual.entries()]
    .map(([sku, dev]) => ({ sku, name: opts.names.get(sku) ?? sku, deviation: dev }))
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  return { hypotheses, totalDeviationUnits, explainedUnits, residual: residualLines };
}
