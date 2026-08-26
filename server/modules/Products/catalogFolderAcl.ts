import type { Request, Response } from 'express';
import { prisma } from '../../lib/utils.js';
import { sendInsufficientRole } from '../../middleware/requirePermission.js';
import { roleService } from '../../services/RoleService.js';
import {
  canListCatalogFolderContents,
  canUseCatalogApi,
  canViewCatalogItem,
  collectCatalogFolderGrants,
  filterCatalogFolderChildren,
  filterCatalogTreeNodes,
  hasCatalogManage,
  normalizeCatalogFolderId,
  resolveCatalogFolderAccess,
  type CatalogParentById,
} from '../../../shared/utils/catalogFolderAccess.js';
import type { CatalogGoodDto, CatalogTreeNodeDto } from '../../../shared/types/catalog.js';

export type CatalogAclIndex = {
  parentById: Map<string, string | null>;
  isGroup: Set<string>;
};

let indexCache: { at: number; index: CatalogAclIndex } | null = null;
const INDEX_TTL_MS = 4000;

export function invalidateCatalogAclIndex(): void {
  indexCache = null;
}

export async function loadCatalogAclIndex(): Promise<CatalogAclIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) {
    return indexCache.index;
  }
  const rows = await prisma.catalogGood.findMany({
    select: { id: true, parentId: true, isGroup: true },
  });
  const parentById = new Map<string, string | null>();
  const isGroup = new Set<string>();
  for (const row of rows) {
    parentById.set(row.id, normalizeCatalogFolderId(row.parentId));
    if (row.isGroup) isGroup.add(row.id);
  }
  const index = { parentById, isGroup };
  indexCache = { at: Date.now(), index };
  return index;
}

export function accessFolderId(itemId: string, index: CatalogAclIndex): string | null {
  if (index.isGroup.has(itemId)) return itemId;
  return index.parentById.get(itemId) ?? null;
}

export async function catalogPermissions(req: Request): Promise<Set<string>> {
  if (!req.user) return new Set();
  return roleService.getPermissionSet(req.user.role);
}

export function denyCatalogAcl(res: Response, message = 'Немає доступу до цього розділу каталогу') {
  return sendInsufficientRole(res, message);
}

export async function assertCanUseCatalogApi(req: Request, res: Response): Promise<Set<string> | null> {
  const perms = await catalogPermissions(req);
  if (!canUseCatalogApi(perms)) {
    denyCatalogAcl(res, 'Немає доступу до каталогу');
    return null;
  }
  return perms;
}

export function assertFolderView(
  res: Response,
  permissions: Iterable<string>,
  folderId: string | null,
  parentById: CatalogParentById
): boolean {
  if (canListCatalogFolderContents(folderId, permissions, parentById)) return true;
  denyCatalogAcl(res);
  return false;
}

export function assertFolderEdit(
  res: Response,
  permissions: Iterable<string>,
  folderId: string | null,
  parentById: CatalogParentById
): boolean {
  if (resolveCatalogFolderAccess(permissions, folderId, parentById).edit) return true;
  denyCatalogAcl(res, 'Немає права редагувати цей розділ каталогу');
  return false;
}

export function assertRootEdit(res: Response, permissions: Iterable<string>): boolean {
  if (hasCatalogManage(permissions)) return true;
  denyCatalogAcl(res, 'Переміщення в корінь каталогу потребує повного доступу');
  return false;
}

export function assertItemsEdit(
  res: Response,
  permissions: Iterable<string>,
  ids: string[],
  index: CatalogAclIndex
): boolean {
  for (const id of ids) {
    const folderId = accessFolderId(id, index);
    if (!resolveCatalogFolderAccess(permissions, folderId, index.parentById).edit) {
      denyCatalogAcl(res, 'Немає права редагувати вибрані обʼєкти');
      return false;
    }
  }
  return true;
}

export function assertHasAnyFolderEdit(res: Response, permissions: Iterable<string>): boolean {
  if (hasCatalogManage(permissions)) return true;
  const { editIds } = collectCatalogFolderGrants(permissions);
  if (editIds.size > 0) return true;
  denyCatalogAcl(res, 'Немає права редагувати каталог');
  return false;
}

export function filterTreeForAcl(
  nodes: CatalogTreeNodeDto[],
  permissions: Iterable<string>
): CatalogTreeNodeDto[] {
  return filterCatalogTreeNodes(nodes, permissions);
}

export function filterChildrenForAcl(
  folderId: string | null,
  children: CatalogGoodDto[],
  permissions: Iterable<string>,
  parentById: CatalogParentById
): CatalogGoodDto[] {
  if (canListCatalogFolderContents(folderId, permissions, parentById)) {
    return children;
  }
  return filterCatalogFolderChildren(folderId, children, permissions, parentById);
}

export function filterSearchForAcl(
  rows: CatalogGoodDto[],
  permissions: Iterable<string>,
  parentById: CatalogParentById
): CatalogGoodDto[] {
  return rows.filter((row) => canViewCatalogItem(row, permissions, parentById));
}
