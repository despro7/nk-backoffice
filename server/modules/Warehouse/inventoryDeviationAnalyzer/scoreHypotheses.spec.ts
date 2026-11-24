import { describe, expect, it } from 'vitest';
import { scoreHypotheses, type HypothesisCandidate } from './scoreHypotheses.js';

const opts = { names: new Map<string, string>(), windowStart: 0, windowEnd: 1000 };
const vec = (o: Record<string, number>) => new Map(Object.entries(o));
const cand = (id: string, v: Record<string, number>, extra: Partial<HypothesisCandidate> = {}): HypothesisCandidate => ({
  id,
  type: 'kit_unposted',
  vector: vec(v),
  at: 1000,
  ...extra,
});

describe('scoreHypotheses', () => {
  it('exact kit match gives high confidence and explains all units', () => {
    const r = scoreHypotheses(vec({ SET: 2, A: -4, B: -2 }), [cand('k', { SET: 2, A: -4, B: -2 })], opts);
    expect(r.hypotheses).toHaveLength(1);
    expect(r.hypotheses[0].confidence).toBe('high');
    expect(r.explainedUnits).toBe(8);
    expect(r.residual).toHaveLength(0);
  });

  it('partial match keeps residual', () => {
    const r = scoreHypotheses(vec({ SET: 2, A: -4, B: -5 }), [cand('k', { SET: 2, A: -4, B: -2 })], opts);
    expect(r.hypotheses).toHaveLength(1);
    expect(r.hypotheses[0].confidence).not.toBe('high');
    expect(r.explainedUnits).toBe(8);
    expect(r.residual).toEqual([{ sku: 'B', name: 'B', deviation: -3 }]);
  });

  it('sign conflict drops the candidate', () => {
    const r = scoreHypotheses(vec({ A: 3, B: 3 }), [cand('k', { A: 3, B: -3, C: -3 })], opts);
    expect(r.hypotheses).toHaveLength(0);
    expect(r.explainedUnits).toBe(0);
    expect(r.residual).toHaveLength(2);
  });

  it('many identical single-SKU orders collapse with similarCount and low confidence', () => {
    const orders = Array.from({ length: 6 }, (_, i) => cand(`o${i}`, { A: -2 }, { type: 'order_unposted', at: 900 + i }));
    const r = scoreHypotheses(vec({ A: -2 }), orders, opts);
    expect(r.hypotheses).toHaveLength(1);
    expect(r.hypotheses[0].similarCount).toBe(6);
    expect(r.hypotheses[0].confidence).toBe('low');
  });

  it('greedy does not explain the same units twice', () => {
    const r = scoreHypotheses(
      vec({ A: -2, B: -2 }),
      [cand('k1', { A: -2, B: -2 }), cand('k2', { A: -2, B: -2 }, { type: 'movement_mismatch' })],
      opts,
    );
    expect(r.hypotheses).toHaveLength(1);
    expect(r.explainedUnits).toBe(4);
    expect(r.residual).toHaveLength(0);
  });

  it('empty vector and empty candidates yield nothing', () => {
    const r = scoreHypotheses(new Map(), [cand('k', { A: 1 })], opts);
    expect(r.hypotheses).toHaveLength(0);
    expect(r.totalDeviationUnits).toBe(0);
    const r2 = scoreHypotheses(vec({ A: 1 }), [{ id: 'e', type: 'kit_unposted', vector: new Map() }], opts);
    expect(r2.hypotheses).toHaveLength(0);
  });
});
