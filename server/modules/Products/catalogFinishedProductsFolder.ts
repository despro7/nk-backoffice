import { prisma } from '../../lib/utils.js';
import {
  CATALOG_FINISHED_PRODUCTS_FOLDER_ID,
  CATALOG_TRASH_ID,
} from '../../../shared/types/catalog.js';

let cachedFolderIds: Set<string> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 60_000;

/** Усі id папок у піддереві «Готова продукція» (включно з коренем гілки). */
export async function getFinishedProductsFolderIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedFolderIds && now - cacheAt < CACHE_TTL_MS) {
    return cachedFolderIds;
  }

  const folderIds = new Set<string>([CATALOG_FINISHED_PRODUCTS_FOLDER_ID]);
  let frontier = [CATALOG_FINISHED_PRODUCTS_FOLDER_ID];

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

  cachedFolderIds = folderIds;
  cacheAt = now;
  return folderIds;
}

/** Товар у папці гілки «Готова продукція» (порівняння з WooCommerce). */
export async function isCatalogGoodInFinishedProductsBranch(
  parentId: string | null | undefined,
): Promise<boolean> {
  if (!parentId?.trim()) return false;
  const folderIds = await getFinishedProductsFolderIds();
  return folderIds.has(parentId.trim());
}
