import type { CatalogGoodDto, CatalogTreeItemData, CatalogTreeNodeDto } from './ProductsTypes';
import { CATALOG_ROOT_ID, CATALOG_ACC_POLICY_KIT } from './ProductsTypes';

export function isArchiveFolderName(name: string): boolean {
  return /^Архів\s*[–-]/i.test(String(name || '').trim());
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


export function isKitGood(item: { accPolicyId?: string | null; isKit?: boolean; components?: unknown[] }): boolean {
  if (item.isKit) return true;
  if (item.accPolicyId === CATALOG_ACC_POLICY_KIT) return true;
  if (Array.isArray(item.components) && item.components.length > 0) return true;
  return false;
}

export function buildTreeItems(
  nodes: CatalogTreeNodeDto[]
): Record<string, CatalogTreeItemData> {
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

  // Sort children by name
  for (const item of Object.values(map)) {
    item.children.sort((a, b) => {
      const na = map[a]?.name || '';
      const nb = map[b]?.name || '';
      return na.localeCompare(nb, 'uk');
    });
  }

  return map;
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

export function formatStock(main: number, small: number): string {
  return `${main} / ${small}`;
}

export function goodTypeLabel(item: CatalogGoodDto): string {
  if (item.isGroup) {
    return isArchiveFolderName(item.name) ? 'Архів' : 'Папка';
  }
  return isKitGood(item) ? 'Комплект' : 'Товар';
}

export interface CatalogItemLabel {
  id: string;
  name: string;
  sku: string | null;
  isGroup: boolean;
  parentId: string | null;
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
