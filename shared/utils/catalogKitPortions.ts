import { CATALOG_ACC_POLICY_KIT } from '../types/catalog.js';

export function isCatalogKitAccPolicy(accPolicyId: string | null | undefined): boolean {
  return accPolicyId === CATALOG_ACC_POLICY_KIT;
}

export type CatalogKitBomChild = { id: string; qty: number };

/**
 * Повна кількість порцій у наборі: вкладені набори розгортаються рекурсивно.
 * Не-набір (страва / інший товар) = 1 порція. Рецептура продукції не розгортається.
 */
export function computeCatalogKitPortionCount(
  rootId: string,
  accPolicyById: ReadonlyMap<string, string | null | undefined>,
  childrenByParent: ReadonlyMap<string, readonly CatalogKitBomChild[]>,
  cache: Map<string, number> = new Map(),
  visiting: Set<string> = new Set()
): number {
  if (cache.has(rootId)) return cache.get(rootId)!;
  if (visiting.has(rootId)) return 0;

  if (!isCatalogKitAccPolicy(accPolicyById.get(rootId))) {
    cache.set(rootId, 1);
    return 1;
  }

  const children = childrenByParent.get(rootId) ?? [];
  if (children.length === 0) {
    cache.set(rootId, 0);
    return 0;
  }

  const nextVisiting = new Set(visiting).add(rootId);
  let total = 0;
  for (const child of children) {
    const qty = Number(child.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    total +=
      qty *
      computeCatalogKitPortionCount(child.id, accPolicyById, childrenByParent, cache, nextVisiting);
  }
  cache.set(rootId, total);
  return total;
}

/** Пакетний підрахунок порцій для кількох root id на спільному графі BOM. */
export function computeCatalogKitPortionCounts(
  rootIds: readonly string[],
  accPolicyById: ReadonlyMap<string, string | null | undefined>,
  childrenByParent: ReadonlyMap<string, readonly CatalogKitBomChild[]>
): Map<string, number> {
  const cache = new Map<string, number>();
  const result = new Map<string, number>();
  for (const id of rootIds) {
    if (!id) continue;
    result.set(id, computeCatalogKitPortionCount(id, accPolicyById, childrenByParent, cache));
  }
  return result;
}
