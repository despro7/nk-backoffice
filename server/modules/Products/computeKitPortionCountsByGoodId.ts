import { prisma } from '../../lib/utils.js';
import { computeCatalogKitPortionCounts } from '../../../shared/utils/catalogKitPortions.js';
import { isKitAccPolicy } from './ProductsTypes.js';

/**
 * Повна кількість порцій для наборів (рекурсивно через вкладені набори).
 * Не-набір → 1. Рецептура продукції не розгортається.
 */
export async function computeKitPortionCountsByGoodId(
  goodIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(goodIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();

  const accPolicyById = new Map<string, string | null>();
  const childrenByParent = new Map<string, Array<{ id: string; qty: number }>>();
  const loaded = new Set<string>();
  let frontier = [...unique];

  while (frontier.length > 0) {
    const batch = frontier.filter((id) => !loaded.has(id));
    frontier = [];
    if (batch.length === 0) break;
    for (const id of batch) loaded.add(id);

    const goods = await prisma.catalogGood.findMany({
      where: { id: { in: batch } },
      select: { id: true, accPolicyId: true },
    });
    for (const good of goods) {
      accPolicyById.set(good.id, good.accPolicyId);
    }

    const kitIds = goods.filter((good) => isKitAccPolicy(good.accPolicyId)).map((good) => good.id);
    if (kitIds.length === 0) continue;

    const components = await prisma.catalogGoodComponent.findMany({
      where: { parentGoodId: { in: kitIds } },
      select: { parentGoodId: true, componentGoodId: true, qty: true },
    });

    const nextIds = new Set<string>();
    for (const row of components) {
      const list = childrenByParent.get(row.parentGoodId) ?? [];
      list.push({ id: row.componentGoodId, qty: row.qty });
      childrenByParent.set(row.parentGoodId, list);
      nextIds.add(row.componentGoodId);
    }
    frontier = [...nextIds].filter((id) => !loaded.has(id));
  }

  const missingPolicyIds = [
    ...new Set(
      [...childrenByParent.values()]
        .flat()
        .map((child) => child.id)
        .filter((id) => !accPolicyById.has(id)),
    ),
  ];
  if (missingPolicyIds.length > 0) {
    const goods = await prisma.catalogGood.findMany({
      where: { id: { in: missingPolicyIds } },
      select: { id: true, accPolicyId: true },
    });
    for (const good of goods) {
      accPolicyById.set(good.id, good.accPolicyId);
    }
  }

  return computeCatalogKitPortionCounts(unique, accPolicyById, childrenByParent);
}
