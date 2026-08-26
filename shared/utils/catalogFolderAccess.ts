import {
  PERMISSIONS,
  actionKey,
  hasPermission,
  normalizePermissionKey,
  type PermissionKey,
} from '../constants/permissions.js';
import { CATALOG_TRASH_ID } from '../types/catalog.js';

export const CATALOG_FOLDER_VIEW_PREFIX = 'action.catalog.view.';
export const CATALOG_FOLDER_EDIT_PREFIX = 'action.catalog.edit.';

export function catalogFolderViewKey(folderId: string): PermissionKey {
  return actionKey('catalog', `view.${folderId}`);
}

export function catalogFolderEditKey(folderId: string): PermissionKey {
  return actionKey('catalog', `edit.${folderId}`);
}

export function isCatalogFolderPermission(key: string): boolean {
  const normalized = normalizePermissionKey(key) ?? key;
  return (
    normalized.startsWith(CATALOG_FOLDER_VIEW_PREFIX) ||
    normalized.startsWith(CATALOG_FOLDER_EDIT_PREFIX)
  );
}

export function parseCatalogFolderPermission(
  key: string
): { mode: 'view' | 'edit'; folderId: string } | null {
  const normalized = normalizePermissionKey(key) ?? key;
  if (normalized.startsWith(CATALOG_FOLDER_VIEW_PREFIX)) {
    const folderId = normalized.slice(CATALOG_FOLDER_VIEW_PREFIX.length);
    return folderId ? { mode: 'view', folderId } : null;
  }
  if (normalized.startsWith(CATALOG_FOLDER_EDIT_PREFIX)) {
    const folderId = normalized.slice(CATALOG_FOLDER_EDIT_PREFIX.length);
    return folderId ? { mode: 'edit', folderId } : null;
  }
  return null;
}

/** `root` / порожній parent Dilovod → null (синтетичний корінь без ключа). */
export function normalizeCatalogFolderId(
  folderId: string | null | undefined
): string | null {
  if (!folderId || folderId === '0' || folderId === '' || folderId === 'root') {
    return null;
  }
  return folderId;
}

export function hasCatalogManage(
  permissions: Iterable<string> | undefined | null
): boolean {
  return hasPermission(permissions, PERMISSIONS.ACTION_CATALOG_MANAGE);
}

export function collectCatalogFolderGrants(
  permissions: Iterable<string> | undefined | null
): { viewIds: Set<string>; editIds: Set<string> } {
  const viewIds = new Set<string>();
  const editIds = new Set<string>();
  if (!permissions) return { viewIds, editIds };
  for (const raw of permissions) {
    const parsed = parseCatalogFolderPermission(raw);
    if (!parsed) continue;
    if (parsed.mode === 'edit') {
      editIds.add(parsed.folderId);
      viewIds.add(parsed.folderId);
    } else {
      viewIds.add(parsed.folderId);
    }
  }
  return { viewIds, editIds };
}

export function hasAnyCatalogFolderPermission(
  permissions: Iterable<string> | undefined | null
): boolean {
  if (!permissions) return false;
  for (const raw of permissions) {
    if (isCatalogFolderPermission(raw)) return true;
  }
  return false;
}

export function canUseCatalogApi(
  permissions: Iterable<string> | undefined | null
): boolean {
  return (
    hasPermission(permissions, PERMISSIONS.PAGE_PRODUCTS) ||
    hasCatalogManage(permissions) ||
    hasAnyCatalogFolderPermission(permissions)
  );
}

export type CatalogParentById = Map<string, string | null> | Record<string, string | null | undefined>;

function parentOf(parentById: CatalogParentById, id: string): string | null {
  if (parentById instanceof Map) {
    return normalizeCatalogFolderId(parentById.get(id) ?? null);
  }
  return normalizeCatalogFolderId(parentById[id] ?? null);
}

/** [self, parent, …] без синтетичного кореня. */
export function walkFolderAncestors(
  folderId: string | null | undefined,
  parentById: CatalogParentById
): string[] {
  const start = normalizeCatalogFolderId(folderId);
  if (!start) return [];
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | null = start;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = parentOf(parentById, current);
  }
  return chain;
}

export function resolveCatalogFolderAccess(
  permissions: Iterable<string> | undefined | null,
  folderId: string | null | undefined,
  parentById: CatalogParentById
): { view: boolean; edit: boolean } {
  if (hasCatalogManage(permissions)) {
    return { view: true, edit: true };
  }
  const id = normalizeCatalogFolderId(folderId);
  if (!id) {
    return { view: false, edit: false };
  }
  const { viewIds, editIds } = collectCatalogFolderGrants(permissions);
  const chain = walkFolderAncestors(id, parentById);
  const edit = chain.some((node) => editIds.has(node));
  const view = edit || chain.some((node) => viewIds.has(node));
  return { view, edit };
}

/** Вузли від гранту вгору (вкл. сам грант) — шлях у дереві. */
export function catalogGrantAncestorIds(
  permissions: Iterable<string> | undefined | null,
  parentById: CatalogParentById
): Set<string> {
  const { viewIds, editIds } = collectCatalogFolderGrants(permissions);
  const granted = new Set<string>([...viewIds, ...editIds]);
  const ancestors = new Set<string>();
  for (const id of granted) {
    for (const node of walkFolderAncestors(id, parentById)) {
      ancestors.add(node);
    }
  }
  return ancestors;
}

export function isCatalogFolderVisibleInTree(
  folderId: string | null | undefined,
  permissions: Iterable<string> | undefined | null,
  parentById: CatalogParentById
): boolean {
  if (hasCatalogManage(permissions)) return true;
  const id = normalizeCatalogFolderId(folderId);
  if (!id) return true;
  if (resolveCatalogFolderAccess(permissions, id, parentById).view) return true;
  return catalogGrantAncestorIds(permissions, parentById).has(id);
}

/** Чи можна віддавати вміст папки (товари + усі діти), а не лише шлях. */
export function canListCatalogFolderContents(
  folderId: string | null | undefined,
  permissions: Iterable<string> | undefined | null,
  parentById: CatalogParentById
): boolean {
  if (hasCatalogManage(permissions)) return true;
  return resolveCatalogFolderAccess(permissions, folderId, parentById).view;
}

/**
 * Прибирає path-only предків з одним видимим нащадком і піднімає грант вище.
 * Предка з кількома гілками лишаємо як групування.
 */
function compactUnaryPathOnlyAncestors<T extends { id: string; parentId: string | null }>(
  nodes: T[],
  permissions: Iterable<string> | undefined | null,
  parentById: CatalogParentById
): T[] {
  let current = nodes;
  for (let step = 0; step < nodes.length + 1; step += 1) {
    const idSet = new Set(current.map((node) => node.id));
    const childCount = new Map<string, number>();
    for (const node of current) {
      const parentId = normalizeCatalogFolderId(node.parentId);
      if (!parentId || !idSet.has(parentId)) continue;
      childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
    }
    const drop = new Set<string>();
    for (const node of current) {
      if (node.id === CATALOG_TRASH_ID) continue;
      if (resolveCatalogFolderAccess(permissions, node.id, parentById).view) continue;
      if ((childCount.get(node.id) ?? 0) !== 1) continue;
      drop.add(node.id);
    }
    if (drop.size === 0) return current;

    const parentOfDropped = new Map(
      current.filter((node) => drop.has(node.id)).map((node) => [node.id, node.parentId])
    );
    current = current
      .filter((node) => !drop.has(node.id))
      .map((node) => {
        let parentId = normalizeCatalogFolderId(node.parentId);
        const seen = new Set<string>();
        while (parentId && drop.has(parentId) && !seen.has(parentId)) {
          seen.add(parentId);
          parentId = normalizeCatalogFolderId(parentOfDropped.get(parentId) ?? null);
        }
        const nextParent = parentId;
        if (nextParent === normalizeCatalogFolderId(node.parentId)) return node;
        return { ...node, parentId: nextParent };
      });
  }
  return current;
}

export function filterCatalogTreeNodes<T extends { id: string; parentId: string | null }>(
  nodes: T[],
  permissions: Iterable<string> | undefined | null
): T[] {
  if (hasCatalogManage(permissions)) return nodes;
  const parentById: Record<string, string | null> = {};
  for (const node of nodes) {
    parentById[node.id] = normalizeCatalogFolderId(node.parentId);
  }
  const visible = nodes.filter((node) =>
    isCatalogFolderVisibleInTree(node.id, permissions, parentById)
  );
  return compactUnaryPathOnlyAncestors(visible, permissions, parentById);
}

/** Єдина видима гілка (без смітника) → її id як візуальний root; інакше null = синтетичний корінь. */
export function resolveCatalogVisualRootFolderId(
  nodes: Array<{ id: string; parentId: string | null }>,
  permissions: Iterable<string> | undefined | null
): string | null {
  if (hasCatalogManage(permissions)) return null;
  const ids = new Set(nodes.map((node) => node.id));
  const tops = nodes.filter((node) => {
    if (node.id === CATALOG_TRASH_ID) return false;
    const parentId = normalizeCatalogFolderId(node.parentId);
    return !parentId || !ids.has(parentId);
  });
  return tops.length === 1 ? tops[0].id : null;
}

export function filterCatalogFolderChildren<T extends { id: string; isGroup: boolean }>(
  folderId: string | null | undefined,
  children: T[],
  permissions: Iterable<string> | undefined | null,
  parentById: CatalogParentById
): T[] {
  if (canListCatalogFolderContents(folderId, permissions, parentById)) {
    return children;
  }
  const pathIds = catalogGrantAncestorIds(permissions, parentById);
  return children.filter((child) => child.isGroup && pathIds.has(child.id));
}

export function canViewCatalogItem(
  item: { id: string; isGroup: boolean; parentId: string | null },
  permissions: Iterable<string> | undefined | null,
  parentById: CatalogParentById
): boolean {
  if (item.isGroup) {
    return resolveCatalogFolderAccess(permissions, item.id, parentById).view;
  }
  return resolveCatalogFolderAccess(permissions, item.parentId, parentById).view;
}
