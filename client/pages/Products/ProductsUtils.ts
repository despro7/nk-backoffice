import type { CatalogGoodDto, CatalogTreeItemData, CatalogTreeNodeDto } from './ProductsTypes';
import {
  CATALOG_ROOT_ID,
  CATALOG_TRASH_ID,
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
} from './ProductsTypes';

export function isArchiveFolderName(name: string): boolean {
  return /^Архів\s*[–-]/i.test(String(name || '').trim());
}

/** Чи поточна папка є архівом («Архів – …»). */
export function isArchiveFolderId(
  folderId: string,
  items: Record<string, CatalogTreeItemData>
): boolean {
  if (!folderId || folderId === CATALOG_ROOT_ID) return false;
  return isArchiveFolderName(items[folderId]?.name || '');
}

/** Розташування елемента: смітник / архів / звичайний каталог. */
export function resolveCatalogItemLocation(
  row: { parentId?: string | null; parentName?: string | null } | null | undefined,
  treeItems: Record<string, CatalogTreeItemData>
): 'trash' | 'archive' | 'normal' {
  if (!row) return 'normal';
  if (row.parentId === CATALOG_TRASH_ID) return 'trash';
  if (
    (row.parentId && isArchiveFolderId(row.parentId, treeItems)) ||
    isArchiveFolderName(row.parentName || '')
  ) {
    return 'archive';
  }
  return 'normal';
}

/** Drag preview (для setDragImage / dataTransfer.setDragImage). */
export function createCatalogDragPreview(labels: string | string[]): HTMLElement {
  document.getElementById('catalog-drag-preview')?.remove();

  const names = (Array.isArray(labels) ? labels : [labels])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  const uniqueNames = names.length > 0 ? names : ['Елемент'];

  const el = document.createElement('div');
  el.id = 'catalog-drag-preview';
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: '99999',
    pointerEvents: 'none',
    padding: '6px 10px',
    overflow: 'hidden',
    fontSize: '13px',
    lineHeight: '1.25',
    color: '#18181b',
    background: '#ffffff',
    borderRadius: '0.5rem',
    // boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  } satisfies Partial<CSSStyleDeclaration>);

  for (const name of uniqueNames) {
    const row = document.createElement('div');
    row.textContent = name;
    Object.assign(row.style, {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(row);
  }

  document.body.appendChild(el);
  // Browser знімає bitmap одразу після setDragImage
  window.setTimeout(() => el.remove(), 0);
  return el;
}


export function isKitGood(item: { accPolicyId?: string | null; isKit?: boolean }): boolean {
  if (item.accPolicyId === CATALOG_ACC_POLICY_KIT) return true;
  if (item.isKit) return true;
  return false;
}

export function buildTreeItems(
  nodes: CatalogTreeNodeDto[],
  options?: { hideArchives?: boolean }
): Record<string, CatalogTreeItemData> {
  const hideArchives = options?.hideArchives !== false;

  const map: Record<string, CatalogTreeItemData> = {
    [CATALOG_ROOT_ID]: {
      id: CATALOG_ROOT_ID,
      name: 'Каталог',
      isGroup: true,
      delMark: false,
      sku: null,
      isKit: false,
      parentId: null,
      children: [],
      archiveChildId: null,
    },
  };

  for (const n of nodes) {
    map[n.id] = {
      id: n.id,
      name: n.name,
      isGroup: n.isGroup,
      delMark: n.delMark,
      sku: n.sku,
      isKit: n.isKit,
      parentId: n.parentId,
      children: [],
      sortOrder: n.sortOrder ?? 0,
      archiveChildId: null,
    };
  }

  for (const n of nodes) {
    // Dilovod корінь = parent "0" / null / відсутня папка
    const isRootParent =
      !n.parentId || n.parentId === '0' || !map[n.parentId];
    const parentKey = isRootParent ? CATALOG_ROOT_ID : n.parentId!;
    if (!map[parentKey].children.includes(n.id)) {
      map[parentKey].children.push(n.id);
    }
  }

  // Архіви лишаються в map (breadcrumbs / lookup); у sidebar — прибираємо з children
  for (const item of Object.values(map)) {
    const archiveId = item.children.find((id) =>
      isArchiveFolderName(map[id]?.name || '')
    );
    item.archiveChildId = archiveId ?? null;
    if (hideArchives && archiveId) {
      item.children = item.children.filter((id) => id !== archiveId);
    }
    item.children.sort((a, b) => {
      const sa = map[a]?.sortOrder ?? 0;
      const sb = map[b]?.sortOrder ?? 0;
      if (sa !== sb) return sa - sb;
      const na = map[a]?.name || '';
      const nb = map[b]?.name || '';
      return na.localeCompare(nb, 'uk');
    });
  }

  return map;
}

/** Ids, куди не можна перемістити (самі елементи + нащадки обраних папок). */
export function getBlockedMoveTargetIds(
  moveIds: string[],
  items: Record<string, CatalogTreeItemData>
): Set<string> {
  const blocked = new Set(moveIds.filter(Boolean));

  const walk = (nodeId: string) => {
    const node = items[nodeId];
    if (!node) return;
    const childIds = [...node.children];
    if (node.archiveChildId && !childIds.includes(node.archiveChildId)) {
      childIds.push(node.archiveChildId);
    }
    for (const childId of childIds) {
      blocked.add(childId);
      walk(childId);
    }
  };

  for (const id of moveIds) {
    if (items[id]?.isGroup) walk(id);
  }

  return blocked;
}

/** Шлях від root до папки для breadcrumbs. */
export function buildFolderBreadcrumbs(
  folderId: string,
  items: Record<string, CatalogTreeItemData>
): Array<{ id: string; name: string }> {
  const rootName = items[CATALOG_ROOT_ID]?.name || 'Каталог';
  if (!folderId || folderId === CATALOG_ROOT_ID) {
    return [{ id: CATALOG_ROOT_ID, name: rootName }];
  }

  const path: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);

    if (currentId === CATALOG_ROOT_ID) {
      path.unshift({ id: CATALOG_ROOT_ID, name: rootName });
      break;
    }

    const item = items[currentId];
    if (!item) {
      path.unshift({ id: CATALOG_ROOT_ID, name: rootName });
      break;
    }

    path.unshift({ id: item.id, name: item.name });

    const parent = item.parentId;
    if (!parent || parent === '0' || !items[parent]) {
      path.unshift({ id: CATALOG_ROOT_ID, name: rootName });
      break;
    }
    currentId = parent;
  }

  if (path.length === 0 || path[0]?.id !== CATALOG_ROOT_ID) {
    path.unshift({ id: CATALOG_ROOT_ID, name: rootName });
  }

  return path;
}

/** Чи поточна папка лежить у гілці «Готова продукція» (включно з самою папкою). */
export function isInFinishedProductsBranch(
  folderId: string,
  items: Record<string, CatalogTreeItemData>,
  finishedFolderName: string = CATALOG_FINISHED_PRODUCTS_FOLDER_NAME
): boolean {
  const path = buildFolderBreadcrumbs(folderId, items);
  return path.some((p) => p.name === finishedFolderName);
}

export function formatStock(main: number, small: number): string {
  return `${main} / ${small}`;
}

export function goodTypeLabel(
  item: CatalogGoodDto,
  accPolicies?: Array<{ id: string; name: string }>
): string {
  if (item.isGroup) {
    return isArchiveFolderName(item.name) ? 'Архів' : 'Група';
  }

  const policyId = item.accPolicyId;
  if (policyId && accPolicies?.length) {
    const found = accPolicies.find((p) => p.id === policyId);
    if (found?.name) return found.name;
  }

  if (policyId === CATALOG_ACC_POLICY_KIT || isKitGood(item)) {
    return 'Товарні набори';
  }
  if (policyId === CATALOG_ACC_POLICY_GOOD) {
    return 'Продукція';
  }
  return isKitGood(item) ? 'Товарні набори' : 'Товар';
}

export interface CatalogItemLabel {
  id: string;
  name: string;
  sku: string | null;
  isGroup: boolean;
  parentId: string | null;
}

/** Оцінка к-сті записів structure-refresh гілки за локальним дзеркалом. */
export function estimateBranchRefreshCount(
  folderId: string,
  treeItems: Record<string, CatalogTreeItemData>,
  treeNodes: CatalogTreeNodeDto[]
): { folderCount: number; approxRecords: number; folderName: string } {
  const startId = !folderId || folderId === CATALOG_ROOT_ID ? CATALOG_ROOT_ID : folderId;
  const folderName =
    startId === CATALOG_ROOT_ID
      ? treeItems[CATALOG_ROOT_ID]?.name || 'Каталог'
      : treeItems[startId]?.name || 'папку';

  const childrenCountById = new Map(
    treeNodes.map((n) => [n.id, n.childrenCount ?? 0])
  );

  const descendantFolderIds: string[] = [];
  const walk = (id: string) => {
    const item = treeItems[id];
    if (!item) return;
    const childIds = [...(item.children || [])];
    if (item.archiveChildId && !childIds.includes(item.archiveChildId)) {
      childIds.push(item.archiveChildId);
    }
    for (const childId of childIds) {
      if (!treeItems[childId]?.isGroup) continue;
      descendantFolderIds.push(childId);
      walk(childId);
    }
  };
  walk(startId);

  // parents, чиїх дітей тягнемо: обрана папка + усі вкладені
  let approxRecords = 0;
  if (startId === CATALOG_ROOT_ID) {
    // прямі діти root (лише папки в дереві) + childrenCount усіх папок
    approxRecords += treeItems[CATALOG_ROOT_ID]?.children.length ?? 0;
    for (const id of descendantFolderIds) {
      approxRecords += childrenCountById.get(id) ?? 0;
    }
  } else {
    approxRecords += childrenCountById.get(startId) ?? 0;
    for (const id of descendantFolderIds) {
      approxRecords += childrenCountById.get(id) ?? 0;
    }
  }

  const folderCount =
    startId === CATALOG_ROOT_ID
      ? descendantFolderIds.length
      : 1 + descendantFolderIds.length;

  return { folderCount, approxRecords, folderName };
}

/** Назви елементів для confirm / context з tableRows + treeItems. */
export function resolveCatalogItemLabels(
  ids: string[],
  sources: {
    tableRows?: Array<{
      id: string;
      name: string;
      sku?: string | null;
      isGroup?: boolean;
      parentId?: string | null;
    }>;
    treeItems?: Record<string, CatalogTreeItemData>;
  }
): CatalogItemLabel[] {
  const { tableRows = [], treeItems = {} } = sources;
  const byId = new Map<string, CatalogItemLabel>();

  for (const row of tableRows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      sku: row.sku ?? null,
      isGroup: Boolean(row.isGroup),
      parentId: row.parentId ?? null,
    });
  }
  for (const item of Object.values(treeItems)) {
    if (byId.has(item.id)) continue;
    byId.set(item.id, {
      id: item.id,
      name: item.name,
      sku: item.sku,
      isGroup: item.isGroup,
      parentId: item.parentId,
    });
  }

  return ids.map((id) => {
    const found = byId.get(id);
    if (found) return found;
    return {
      id,
      name: id,
      sku: null,
      isGroup: false,
      parentId: null,
    };
  });
}

/** Прогноз імені папки архіву (як на бекенді). */
export function predictArchiveFolderName(
  items: CatalogItemLabel[],
  treeItems: Record<string, CatalogTreeItemData>
): string {
  const first = items[0];
  if (!first) return 'Архів – Корінь';

  const parentId = first.parentId;
  if (!parentId || parentId === '0' || parentId === CATALOG_ROOT_ID) {
    return 'Архів – Корінь';
  }
  const parentName = treeItems[parentId]?.name || parentId;
  return `Архів – ${parentName}`;
}
