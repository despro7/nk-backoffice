import { describe, expect, it } from 'vitest';
import { buildKitSwapCandidates, linkReleaseByQuantity, type KitReleaseInput } from './kitSwapCandidates.js';
import { buildReturnCandidates } from './returnCandidates.js';
import { buildMovementLineCandidates, MOVEMENT_LINE_PRIOR } from './movementLineCandidates.js';
import { detectResidualPatterns, isCountingNoise } from './chronicSkus.js';
import { scoreHypotheses, type HypothesisCandidate } from './scoreHypotheses.js';

const vec = (o: Record<string, number>) => new Map(Object.entries(o));
const opts = { names: new Map<string, string>(), windowStart: 0, windowEnd: 1000 };
const release = (over: Partial<KitReleaseInput> = {}): KitReleaseInput => ({
  id: 1, internalDocNumber: 'K-1', setSku: 'S1', quantity: 2, operationType: 'kit', at: new Date(900),
  componentQty: new Map([['B', 2], ['C', 2]]), ...over,
});

describe('kit swap candidates', () => {
  it('component swap: B written off, A physically used', () => {
    const c = buildKitSwapCandidates({
      releases: [release()],
      deviation: vec({ A: -1, B: 1 }),
      categoryBySku: new Map([['A', 'cat'], ['B', 'cat']]),
      compositions: new Map(),
    });
    expect(c).toHaveLength(1);
    expect(c[0].vector).toEqual(vec({ A: -1, B: 1 }));
    expect(c[0].swap).toEqual({ kind: 'component', expectedSku: 'B', actualSku: 'A' });
    expect(c[0].prior).toBeLessThan(1);
    expect(c[0].reference?.kind).toBe('release_set');
  });

  it('component swap needs shared category or set membership', () => {
    const c = buildKitSwapCandidates({
      releases: [release()],
      deviation: vec({ A: -1, B: 1 }),
      categoryBySku: new Map([['A', 'x'], ['B', 'y']]),
      compositions: new Map(),
    });
    expect(c).toHaveLength(0);
  });

  it('unkit mirrors the component swap', () => {
    const c = buildKitSwapCandidates({
      releases: [release({ operationType: 'unkit' })],
      deviation: vec({ A: 1, B: -1 }),
      categoryBySku: new Map([['A', 'cat'], ['B', 'cat']]),
      compositions: new Map(),
    });
    expect(c[0].vector).toEqual(vec({ A: 1, B: -1 }));
  });

  it('set swap cancels common components', () => {
    const c = buildKitSwapCandidates({
      releases: [release({ componentQty: new Map([['X', 2], ['Y', 2]]) })],
      deviation: vec({ S1: -2, S2: 2 }),
      categoryBySku: new Map(),
      compositions: new Map([
        ['S1', [{ sku: 'X', quantity: 1 }, { sku: 'Y', quantity: 1 }]],
        ['S2', [{ sku: 'X', quantity: 1 }, { sku: 'Z', quantity: 1 }]],
      ]),
    }).filter((x) => x.swap?.kind === 'set');
    expect(c).toHaveLength(1);
    expect(c[0].vector).toEqual(vec({ S2: 2, S1: -2, Z: -2, Y: 2 }));
    expect(c[0].swap).toEqual({ kind: 'set', expectedSku: 'S1', actualSku: 'S2' });
  });

  it('skips duplicates of existing signatures', () => {
    const c = buildKitSwapCandidates({
      releases: [release()],
      deviation: vec({ A: -1, B: 1 }),
      categoryBySku: new Map([['A', 'cat'], ['B', 'cat']]),
      compositions: new Map(),
      existingSignatures: new Set(['A:-1|B:1']),
    });
    expect(c).toHaveLength(0);
  });

  it('quantity link picks nearest release of the same set and implies physical quantity', () => {
    const near = release({ id: 2, quantity: 5, at: new Date(950) });
    const far = release({ id: 3, quantity: 5, at: new Date(100) });
    const link = linkReleaseByQuantity([far, near], 'S1', -2, 1000);
    expect(link?.release.id).toBe(2);
    expect(link?.postedQty).toBe(5);
    expect(link?.impliedQty).toBe(3);
    expect(linkReleaseByQuantity([near], 'OTHER', -2, 1000)).toBeNull();
  });
});

describe('return candidates', () => {
  const base = {
    reportKey: 'o1', externalId: 'o1', orderNumber: '100', saleDocumentNumber: 'S-1',
    dilovodSaleExportDate: new Date(500), shipped: vec({ A: 2, B: 1 }),
  };
  it('returned status without return doc gives +composition', () => {
    const c = buildReturnCandidates([{ ...base, status: '7', dilovodReturnDate: null, dilovodReturnDocsCount: null }]);
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('return_unposted');
    expect(c[0].vector).toEqual(vec({ A: 2, B: 1 }));
    expect(c[0].reference?.kind).toBe('order');
  });
  it('posted return is not a candidate', () => {
    const c = buildReturnCandidates([{ ...base, status: '7', dilovodReturnDate: new Date(), dilovodReturnDocsCount: 1 }]);
    expect(c).toHaveLength(0);
  });
  it('duplicated return docs give -composition', () => {
    const c = buildReturnCandidates([{ ...base, status: '7', dilovodReturnDate: new Date(), dilovodReturnDocsCount: 2 }]);
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe('return_duplicated');
    expect(c[0].vector).toEqual(vec({ A: -2, B: -1 }));
  });
});

describe('movement line candidates', () => {
  const ref = { kind: 'movement' as const, id: 'm1' };
  it('creates two single-SKU candidates per line with prior below 1', () => {
    const c = buildMovementLineCandidates('m1', vec({ A: 3, B: 2 }), 1, ref);
    expect(c).toHaveLength(4);
    expect(c.every((x) => x.vector.size === 1 && x.prior === MOVEMENT_LINE_PRIOR)).toBe(true);
    expect(c.find((x) => x.id.endsWith('A-notdone'))?.vector).toEqual(vec({ A: -3 }));
  });
  it('single-line document yields nothing extra', () => {
    expect(buildMovementLineCandidates('m1', vec({ A: 3 }), 1, ref)).toHaveLength(0);
  });
});

describe('residual patterns', () => {
  const res = (o: Record<string, number>) => Object.entries(o).map(([sku, deviation]) => ({ sku, name: sku, deviation }));
  const prev = (id: number, o: Record<string, number>) => ({ sessionId: id, deviation: vec(o) });
  it('chronic: same sign in >= 3 previous sessions', () => {
    const out = detectResidualPatterns(res({ A: -1, B: -1 }), [prev(1, { A: -2, B: 1 }), prev(2, { A: -1 }), prev(3, { A: -1, B: 1 }), prev(4, {})]);
    expect(out[0].pattern).toMatchObject({ kind: 'chronic', hits: 3 });
    expect(out[1].pattern).toBeUndefined();
  });
  it('counting noise: scattered +-1 without patterns and hypotheses', () => {
    expect(isCountingNoise(res({ A: 1, B: -1, C: 1 }), 0)).toBe(true);
    expect(isCountingNoise(res({ A: 1, B: -1, C: 1 }), 1)).toBe(false);
    expect(isCountingNoise(res({ A: 5, B: -4, C: 1 }), 0)).toBe(false);
    expect(isCountingNoise([{ sku: 'A', name: 'A', deviation: 1, pattern: { kind: 'chronic', hits: 3, history: [] } }, ...res({ B: 1, C: 1 })], 0)).toBe(false);
  });
});

describe('scoring prior and swap cap', () => {
  const cand = (id: string, prior?: number, extra: Partial<HypothesisCandidate> = {}): HypothesisCandidate => ({
    id, type: 'movement_mismatch', vector: vec({ A: -2, B: -2 }), at: 1000, ...(prior != null ? { prior } : {}), ...extra,
  });
  it('prior multiplies score; whole document beats line prior', () => {
    const r = scoreHypotheses(vec({ A: -2, B: -2 }), [cand('line', 0.9), cand('doc')], opts);
    expect(r.hypotheses[0].id).toBe('doc');
    const low = scoreHypotheses(vec({ A: -2, B: -2 }), [cand('x', 0.3)], opts);
    expect(low.hypotheses).toHaveLength(0);
  });
  it('swap without reference never reaches high confidence', () => {
    const swap = { kind: 'component' as const, expectedSku: 'A', actualSku: 'B' };
    const noRef = scoreHypotheses(vec({ A: -2, B: -2 }), [cand('s', 1, { type: 'kit_swap', swap })], opts);
    expect(noRef.hypotheses[0].confidence).toBe('medium');
    const withRef = scoreHypotheses(vec({ A: -2, B: -2 }), [cand('s', 1, { type: 'kit_swap', swap, reference: { kind: 'release_set', id: 1 } })], opts);
    expect(withRef.hypotheses[0].confidence).toBe('high');
    expect(withRef.hypotheses[0].swap?.actualName).toBe('B');
  });
});
