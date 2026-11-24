import { addToVector, vectorSignature, type DeviationVector } from './deviationVector.js';
import type { HypothesisCandidate } from './scoreHypotheses.js';

export type KitComposition = Array<{ sku: string; quantity: number }>;

export interface KitReleaseInput {
  id: number;
  internalDocNumber: string | null;
  setSku: string;
  quantity: number;
  operationType: string;
  at: Date;
  /** Компоненти, списані/оприбутковані документом (sku -> кількість на всю кількість комплектації). */
  componentQty: Map<string, number>;
}

export interface KitSwapInput {
  releases: KitReleaseInput[];
  deviation: DeviationVector;
  /** SKU позицій сесії -> категорія. */
  categoryBySku: Map<string, string | null>;
  /** Склад наборів (sku набору -> компоненти) для наборів сесії. */
  compositions: Map<string, KitComposition>;
  /** Підписи векторів, які вже є серед кандидатів (щоб не дублювати). */
  existingSignatures?: Set<string>;
}

export const COMPONENT_SWAP_PRIOR = 0.8;
export const SET_SWAP_PRIOR = 0.85;

const releaseSign = (r: KitReleaseInput): 1 | -1 => (r.operationType === 'unkit' ? -1 : 1);

const refOf = (r: KitReleaseInput) => ({
  kind: 'release_set' as const,
  id: r.id,
  number: r.internalDocNumber,
  date: r.at.toISOString(),
});

/** Кандидати підміни: не той компонент / не той набір у комплектації (розкомплектації). */
export function buildKitSwapCandidates(input: KitSwapInput): HypothesisCandidate[] {
  const { releases, deviation, categoryBySku, compositions } = input;
  const seen = new Set(input.existingSignatures ?? []);
  const out: HypothesisCandidate[] = [];

  const componentSkusOfSets = new Set<string>();
  for (const comp of compositions.values()) for (const c of comp) componentSkusOfSets.add(c.sku);
  for (const r of releases) for (const sku of r.componentQty.keys()) componentSkusOfSets.add(sku);

  const push = (c: HypothesisCandidate) => {
    const sig = `${c.reference?.id ?? ''}#${vectorSignature(c.vector)}`;
    const plain = vectorSignature(c.vector);
    if (seen.has(sig) || seen.has(plain)) return;
    seen.add(sig);
    out.push(c);
  };

  for (const r of releases) {
    const s = releaseSign(r);
    const at = r.at.getTime();

    // a. Не той компонент: B за документом, фізично A
    for (const [skuB, qtyB] of r.componentQty) {
      const devB = deviation.get(skuB) ?? 0;
      if (s * devB <= 0) continue;
      const catB = categoryBySku.get(skuB) ?? null;
      for (const [skuA, devA] of deviation) {
        if (skuA === skuB || skuA === r.setSku || s * devA >= 0) continue;
        if (r.componentQty.has(skuA)) continue;
        const sameCategory = catB != null && categoryBySku.get(skuA) === catB;
        if (!sameCategory && !componentSkusOfSets.has(skuA)) continue;
        const t = Math.min(Math.abs(devA), Math.abs(devB), qtyB);
        if (t <= 0) continue;
        const vector: DeviationVector = new Map();
        addToVector(vector, skuA, -s * t);
        addToVector(vector, skuB, s * t);
        push({
          id: `kit-swap-comp-${r.id}-${skuB}-${skuA}`,
          type: 'kit_swap',
          vector,
          at,
          prior: COMPONENT_SWAP_PRIOR,
          reference: refOf(r),
          swap: { kind: 'component', expectedSku: skuB, actualSku: skuA },
        });
      }
    }

    // b. Не той набір: проведено S1 x q, фізично S2 x q
    const s1 = r.setSku;
    const dev1 = deviation.get(s1) ?? 0;
    if (s * dev1 >= 0) continue;
    const comp1 = compositions.get(s1) ?? [...r.componentQty].map(([sku, q]) => ({ sku, quantity: q / (r.quantity || 1) }));
    if (comp1.length === 0) continue;
    for (const [s2, dev2] of deviation) {
      if (s2 === s1 || s * dev2 <= 0) continue;
      const comp2 = compositions.get(s2);
      if (!comp2 || comp2.length === 0) continue;
      const q = Math.min(Math.abs(r.quantity) || 0, Math.abs(dev1), Math.abs(dev2));
      if (q <= 0) continue;
      const vector: DeviationVector = new Map();
      addToVector(vector, s2, s * q);
      addToVector(vector, s1, -s * q);
      for (const c of comp2) addToVector(vector, c.sku, -s * q * c.quantity);
      for (const c of comp1) addToVector(vector, c.sku, s * q * c.quantity);
      if (vector.size < 2) continue;
      push({
        id: `kit-swap-set-${r.id}-${s1}-${s2}`,
        type: 'kit_swap',
        vector,
        at,
        prior: SET_SWAP_PRIOR,
        reference: refOf(r),
        swap: { kind: 'set', expectedSku: s1, actualSku: s2 },
      });
    }
  }
  return out;
}

export interface QuantityLinkResult {
  release: KitReleaseInput;
  postedQty: number;
  impliedQty: number;
}

/**
 * Найближча (до кінця вікна) комплектація того ж набору з будь-якою кількістю.
 * `k` – відхилення набору (факт − облік); фізично зібрано = проведено + k (зі знаком операції).
 */
export function linkReleaseByQuantity(releases: KitReleaseInput[], setSku: string, k: number, windowEnd: number): QuantityLinkResult | null {
  const same = releases.filter((r) => r.setSku === setSku);
  if (same.length === 0) return null;
  // Спершу ті, де кількість не менша за відхилення, далі за близькістю до дати інвентаризації
  const sorted = [...same].sort((a, b) => {
    const fitA = Math.abs(a.quantity) >= Math.abs(k) ? 0 : 1;
    const fitB = Math.abs(b.quantity) >= Math.abs(k) ? 0 : 1;
    if (fitA !== fitB) return fitA - fitB;
    return Math.abs(windowEnd - a.at.getTime()) - Math.abs(windowEnd - b.at.getTime());
  });
  const release = sorted[0];
  const signedPosted = releaseSign(release) * Math.abs(release.quantity);
  return { release, postedQty: Math.abs(signedPosted), impliedQty: Math.max(0, Math.abs(signedPosted + k)) };
}
