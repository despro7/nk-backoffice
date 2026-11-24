import type { InventoryWarehouseScope } from '../../../../shared/types/inventoryWarehouse.js';
import { deviationForScope, type InventoryDeviationItemLike } from '../../../../shared/utils/inventoryDeviation.js';

export type DeviationVector = Map<string, number>;

export type DeviationSessionItem = InventoryDeviationItemLike & {
  sku?: string;
  name?: string;
  componentsSnapshot?: unknown;
};

/** Вектор відхилень сесії: sku -> (факт − облік), лише ненульові значення і лише позиції з внесеним фактом. */
export function buildDeviationVector(
  items: DeviationSessionItem[],
  scope: InventoryWarehouseScope,
): DeviationVector {
  const vector: DeviationVector = new Map();
  for (const item of items) {
    const sku = String(item?.sku ?? '').trim();
    if (!sku) continue;
    const dev = deviationForScope(item, scope);
    if (dev === null || dev === 0) continue;
    vector.set(sku, (vector.get(sku) ?? 0) + dev);
  }
  return vector;
}

export function vectorAbsSum(vector: DeviationVector): number {
  let sum = 0;
  for (const v of vector.values()) sum += Math.abs(v);
  return sum;
}

/** Додає `delta` (зі знаком) до вектора; нулі прибирає. */
export function addToVector(target: DeviationVector, sku: string, delta: number): void {
  if (!sku || !delta) return;
  const next = (target.get(sku) ?? 0) + delta;
  if (next === 0) target.delete(sku);
  else target.set(sku, next);
}

export const negateVector = (v: DeviationVector): DeviationVector => new Map([...v].map(([k, n]) => [k, -n]));

/** Стабільний підпис вектора (для усунення дублікатів кандидатів). */
export function vectorSignature(v: DeviationVector): string {
  return [...v.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}:${n}`).join('|');
}
