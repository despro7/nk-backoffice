import { prisma } from '../../lib/utils.js';
import {
  CATALOG_FINISHED_PRODUCTS_FOLDER_ID,
  CATALOG_INGREDIENTS_FOLDER_ID,
  CATALOG_TRASH_ID,
} from '../../../shared/types/catalog.js';
import type { CatalogStockBranch } from '../../../shared/utils/catalogStock.js';

const CACHE_TTL_MS = 60_000;
const folderCache = new Map<string, { ids: Set<string>; at: number }>();

/** Усі id папок у піддереві `rootId` (включно з коренем), кеш 60 с. */
async function getBranchFolderIds(rootId: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = folderCache.get(rootId);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.ids;
  }

  const folderIds = new Set<string>([rootId]);
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await prisma.catalogGood.findMany({
      where: { isGroup: true, parentId: { in: frontier }, id: { not: CATALOG_TRASH_ID } },
      select: { id: true },
    });
    frontier = [];
    for (const child of children) {
      if (folderIds.has(child.id)) continue;
      folderIds.add(child.id);
      frontier.push(child.id);
    }
  }

  folderCache.set(rootId, { ids: folderIds, at: now });
  return folderIds;
}

/** Усі id папок у піддереві «Готова продукція» (включно з коренем гілки). */
export function getFinishedProductsFolderIds(): Promise<Set<string>> {
  return getBranchFolderIds(CATALOG_FINISHED_PRODUCTS_FOLDER_ID);
}

/** Усі id папок у піддереві «Інгредієнти» (включно з коренем гілки). */
export function getIngredientsFolderIds(): Promise<Set<string>> {
  return getBranchFolderIds(CATALOG_INGREDIENTS_FOLDER_ID);
}

/** Товар у папці гілки «Готова продукція» (порівняння з WooCommerce). */
export async function isCatalogGoodInFinishedProductsBranch(
  parentId: string | null | undefined,
): Promise<boolean> {
  if (!parentId?.trim()) return false;
  const folderIds = await getFinishedProductsFolderIds();
  return folderIds.has(parentId.trim());
}

/** Гілка для набору складів залишків: ГП/МС чи СП/ВП; `null` для решти груп. */
export async function resolveCatalogStockBranch(
  parentId: string | null | undefined,
): Promise<CatalogStockBranch | null> {
  const id = parentId?.trim();
  if (!id) return null;
  if ((await getFinishedProductsFolderIds()).has(id)) return 'finished';
  if ((await getIngredientsFolderIds()).has(id)) return 'ingredient';
  return null;
}
