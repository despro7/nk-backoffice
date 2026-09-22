import type { CatalogGoodDto, CatalogTreeItemData, CatalogTreeNodeDto } from './ProductsTypes';
import {
  CATALOG_ROOT_ID,
  CATALOG_TRASH_ID,
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
  CATALOG_PRICE_TYPE_RETAIL_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_MILITARY_DISCOUNT_PER_PORTION,
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

const CATALOG_DRAG_PREVIEW_ID = 'catalog-drag-preview';
const CATALOG_DRAG_PREVIEW_MAX = 5;
export const CATALOG_DRAG_PREVIEW_OFFSET = { x: 12, y: 16 };

let liveDragPreviewEl: HTMLElement | null = null;
let lastCatalogDropKey = '';

export type CatalogDropHintDom =
  | { kind: 'into'; id: string }
  | { kind: 'reorder'; id: string; position: 'before' | 'after' };

export type CatalogHitRect = {
  id: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  el: HTMLElement;
};

/** Touch/pen — привид вище пальця, щоб не закривати ціль drop. */
export function catalogDragPreviewOffset(pointerType: string): { x: number; y: number } {
  if (pointerType === 'touch' || pointerType === 'pen') {
    return { x: 18, y: -72 };
  }
  return CATALOG_DRAG_PREVIEW_OFFSET;
}

export function setCatalogDndCursor(active: boolean): void {
  document.documentElement.classList.toggle('catalog-dnd-dragging', active);
}

function catalogDragPreviewNames(labels: string | string[]): string[] {
  const names = (Array.isArray(labels) ? labels : [labels])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  return names.length > 0 ? names : ['Елемент'];
}

function mountCatalogDragPreview(
  labels: string | string[],
  persist: boolean
): HTMLElement {
  removeCatalogDragPreview();

  const names = catalogDragPreviewNames(labels);
  const numbered =
    names.length > 1 ? names.map((name, i) => `${i + 1}. ${name}`) : names;
  const shown = numbered.slice(0, CATALOG_DRAG_PREVIEW_MAX);
  const rest = numbered.length - shown.length;

  const el = document.createElement('div');
  el.id = CATALOG_DRAG_PREVIEW_ID;
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: '99999',
    pointerEvents: 'none',
    padding: '8px 12px',
    overflow: 'hidden',
    fontSize: '13px',
    lineHeight: '1.35',
    color: '#18181b',
    background: '#ffffff',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 28px rgb(0 0 0 / 0.18)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxWidth: '280px',
    willChange: 'transform, opacity',
  } satisfies Partial<CSSStyleDeclaration>);

  for (const line of shown) {
    const row = document.createElement('div');
    row.textContent = line;
    Object.assign(row.style, {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(row);
  }

  if (rest > 0) {
    const more = document.createElement('div');
    more.textContent = `і ще ${rest}…`;
    Object.assign(more.style, {
      color: '#71717a',
      fontSize: '12px',
      marginTop: '2px',
    } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(more);
  }

  document.body.appendChild(el);
  void el.getBoundingClientRect();
  if (!persist) {
    // Browser знімає bitmap одразу після setDragImage
    window.setTimeout(() => el.remove(), 0);
  }
  return el;
}

/** Drag preview для HTML5 setDragImage. */
export function createCatalogDragPreview(labels: string | string[]): HTMLElement {
  return mountCatalogDragPreview(labels, false);
}

/** Живий ghost назв для pointer-DnD. */
export function createCatalogLiveDragPreview(labels: string | string[]): HTMLElement {
  liveDragPreviewEl = mountCatalogDragPreview(labels, true);
  return liveDragPreviewEl;
}

export function removeCatalogDragPreview(): void {
  liveDragPreviewEl = null;
  document.getElementById(CATALOG_DRAG_PREVIEW_ID)?.remove();
}

export function moveCatalogDragPreview(x: number, y: number): void {
  const el = liveDragPreviewEl ?? document.getElementById(CATALOG_DRAG_PREVIEW_ID);
  if (!el) return;
  liveDragPreviewEl = el;
  el.style.transition = 'none';
  el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function isCatalogHitTargetVisible(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"], .pointer-events-none')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;

  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    const oy = style.overflowY;
    const ox = style.overflowX;
    const clips =
      oy === 'hidden' ||
      oy === 'auto' ||
      oy === 'scroll' ||
      ox === 'hidden' ||
      ox === 'auto' ||
      ox === 'scroll';
    if (clips) {
      const pr = parent.getBoundingClientRect();
      if (pr.height < 2 || pr.width < 2) return false;
      const overlapH = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
      const overlapW = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
      if (overlapH < 2 || overlapW < 2) return false;
    }
    parent = parent.parentElement;
  }
  return true;
}

export function collectCatalogHitRects(selector: string): CatalogHitRect[] {
  const byId = new Map<string, CatalogHitRect>();
  document.querySelectorAll(selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!isCatalogHitTargetVisible(node)) return;
    const id =
      node.getAttribute('data-catalog-row-id') ||
      node.getAttribute('data-catalog-folder-id');
    if (!id) return;
    const r = node.getBoundingClientRect();
    const next: CatalogHitRect = {
      id,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      el: node,
    };
    const prev = byId.get(id);
    const nextArea = r.width * r.height;
    const prevArea = prev
      ? (prev.right - prev.left) * (prev.bottom - prev.top)
      : 0;
    // Менший visible rect — точніша ціль (не предок, що перекриває дітей)
    if (!prev || nextArea < prevArea) byId.set(id, next);
  });
  return [...byId.values()];
}

export function hitCatalogRect(
  rects: CatalogHitRect[],
  x: number,
  y: number,
  axis: 'y' | 'xy' = 'xy'
): CatalogHitRect | null {
  let best: CatalogHitRect | null = null;
  let bestArea = Infinity;
  for (const item of rects) {
    if (y < item.top || y >= item.bottom) continue;
    if (axis === 'xy' && (x < item.left || x > item.right)) continue;
    const area = (item.right - item.left) * (item.bottom - item.top);
    if (area < bestArea) {
      bestArea = area;
      best = item;
    }
  }
  if (best || axis === 'xy') return best;

  // Лише для вертикального свайпу по checkbox — щілини між рядками
  let nearest: CatalogHitRect | null = null;
  let bestDist = Infinity;
  for (const item of rects) {
    const dist =
      y < item.top ? item.top - y : y >= item.bottom ? y - item.bottom : 0;
    if (dist < bestDist) {
      bestDist = dist;
      nearest = item;
    }
  }
  return nearest && bestDist < 28 ? nearest : null;
}

export function clearCatalogDropAttrs(): void {
  lastCatalogDropKey = '';
  document
    .querySelectorAll(
      '[data-catalog-drop-into], [data-catalog-drop-before], [data-catalog-drop-after]'
    )
    .forEach((el) => {
      el.removeAttribute('data-catalog-drop-into');
      el.removeAttribute('data-catalog-drop-before');
      el.removeAttribute('data-catalog-drop-after');
    });
}

export function applyCatalogDropAttrs(
  hint: CatalogDropHintDom | null,
  target?: HTMLElement | null
): void {
  const targetKey = target
    ? `${target.tagName}:${target.getAttribute('data-catalog-row-id') || target.getAttribute('data-catalog-folder-id') || ''}`
    : '';
  const key =
    hint == null
      ? ''
      : `${hint.kind}:${hint.id}:${hint.kind === 'reorder' ? hint.position : ''}:${targetKey}`;
  if (key === lastCatalogDropKey) return;
  lastCatalogDropKey = key;
  document
    .querySelectorAll(
      '[data-catalog-drop-into], [data-catalog-drop-before], [data-catalog-drop-after]'
    )
    .forEach((el) => {
      el.removeAttribute('data-catalog-drop-into');
      el.removeAttribute('data-catalog-drop-before');
      el.removeAttribute('data-catalog-drop-after');
    });
  if (!hint) return;
  const attr =
    hint.kind === 'into'
      ? 'data-catalog-drop-into'
      : hint.position === 'before'
        ? 'data-catalog-drop-before'
        : 'data-catalog-drop-after';
  const targetId =
    target?.getAttribute('data-catalog-row-id') ||
    target?.getAttribute('data-catalog-folder-id') ||
    '';
  // after A канонізується в before B — малювати на hint.id, не на наведеному A
  const paintOn =
    hint.kind === 'into' && target
      ? target
      : target && targetId === hint.id
        ? target
        : null;
  if (paintOn) {
    paintOn.setAttribute(attr, '');
    return;
  }
  const escaped = CSS.escape(hint.id);
  const preferRow = Boolean(target?.hasAttribute('data-catalog-row-id'));
  const el =
    (preferRow
      ? document.querySelector(`[data-catalog-row-id="${escaped}"]`)
      : document.querySelector(`[data-catalog-folder-id="${escaped}"]`)) ??
    document.querySelector(`[data-catalog-row-id="${escaped}"]`) ??
    document.querySelector(`[data-catalog-folder-id="${escaped}"]`);
  el?.setAttribute(attr, '');
}

export function markCatalogDndSources(ids: string[]): void {
  document.querySelectorAll('[data-catalog-dnd-source]').forEach((el) => {
    el.removeAttribute('data-catalog-dnd-source');
  });
  for (const id of ids) {
    const escaped = CSS.escape(id);
    document
      .querySelectorAll(
        `[data-catalog-row-id="${escaped}"], [data-catalog-folder-id="${escaped}"]`
      )
      .forEach((el) => el.setAttribute('data-catalog-dnd-source', ''));
  }
}

function waitPreviewTransition(el: HTMLElement, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);
      resolve();
    };
    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== el) return;
      if (ev.propertyName !== 'transform' && ev.propertyName !== 'opacity') return;
      done();
    };
    el.addEventListener('transitionend', onEnd);
    const timer = window.setTimeout(done, ms);
  });
}

/** macOS-подібне повернення привида до рядка-джерела. */
export async function snapBackCatalogDragPreview(
  target: HTMLElement | null
): Promise<void> {
  const el = document.getElementById(CATALOG_DRAG_PREVIEW_ID);
  if (!el) return;
  if (!target) {
    await dismissCatalogDragPreview();
    return;
  }

  const t = target.getBoundingClientRect();
  const ghost = el.getBoundingClientRect();
  const x = t.left + 8;
  const y = t.top + Math.max(0, (t.height - ghost.height) / 2);
  void el.getBoundingClientRect();
  el.style.transition =
    'transform 560ms cubic-bezier(0.22, 0.82, 0.24, 1), opacity 520ms ease-in-out';
  el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  el.style.opacity = '0';
  await waitPreviewTransition(el, 600);
  removeCatalogDragPreview();
}

export async function dismissCatalogDragPreview(): Promise<void> {
  const el = document.getElementById(CATALOG_DRAG_PREVIEW_ID);
  if (!el) return;
  const current = el.style.transform || 'translate(0px, 0px)';
  void el.getBoundingClientRect();
  el.style.transition = 'opacity 280ms ease-in-out, transform 280ms ease-in-out';
  el.style.opacity = '0';
  el.style.transform = `${current} scale(0.96)`;
  await waitPreviewTransition(el, 340);
  removeCatalogDragPreview();
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
      name: 'Товари та послуги',
      isGroup: true,
      delMark: false,
      sku: null,
      isKit: false,
      parentId: null,
      children: [],
      archiveChildId: null,
    },
    [CATALOG_TRASH_ID]: {
      id: CATALOG_TRASH_ID,
      name: 'Смітник',
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
      objectCount: n.childrenCount ?? 0,
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
    const groupKids =
      item.children.length +
      (item.archiveChildId && !item.children.includes(item.archiveChildId) ? 1 : 0);
    if (typeof item.objectCount === 'number') {
      item.objectCount = Math.max(0, item.objectCount - groupKids);
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

  const OBJECT_COUNT_MAX_DEPTH = 5;
  const directCount: Record<string, number> = {};
  for (const item of Object.values(map)) {
    directCount[item.id] = item.objectCount ?? 0;
  }

  const nestedCount = (id: string, depth: number, visiting: Set<string>): number => {
    if (depth > OBJECT_COUNT_MAX_DEPTH) return 0;
    if (visiting.has(id)) return 0;
    const item = map[id];
    if (!item) return 0;
    visiting.add(id);
    let total = directCount[id] ?? 0;
    for (const childId of item.children) {
      if (!map[childId]?.isGroup) continue;
      total += nestedCount(childId, depth + 1, visiting);
    }
    visiting.delete(id);
    return total;
  };

  for (const item of Object.values(map)) {
    item.objectCount = nestedCount(item.id, 1, new Set());
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

/** Шлях від visual root до папки для breadcrumbs. */
export function buildFolderBreadcrumbs(
  folderId: string,
  items: Record<string, CatalogTreeItemData>,
  options?: { visualRootId?: string }
): Array<{ id: string; name: string }> {
  const visualRootId = options?.visualRootId || CATALOG_ROOT_ID;
  const rootName =
    items[visualRootId]?.name || items[CATALOG_ROOT_ID]?.name || 'Каталог';
  if (!folderId || folderId === CATALOG_ROOT_ID || folderId === visualRootId) {
    return [{ id: visualRootId, name: rootName }];
  }

  const path: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);

    if (currentId === visualRootId || currentId === CATALOG_ROOT_ID) {
      path.unshift({ id: visualRootId, name: rootName });
      break;
    }

    const item = items[currentId];
    if (!item) {
      path.unshift({ id: visualRootId, name: rootName });
      break;
    }

    path.unshift({ id: item.id, name: item.name });

    const parent = item.parentId;
    if (!parent || parent === '0' || parent === visualRootId || !items[parent]) {
      if (path[0]?.id !== visualRootId) {
        path.unshift({ id: visualRootId, name: rootName });
      }
      break;
    }
    currentId = parent;
  }

  if (path.length === 0 || path[0]?.id !== visualRootId) {
    path.unshift({ id: visualRootId, name: rootName });
  }

  return path;
}

export interface CatalogFolderOption {
  id: string;
  name: string;
  path: string;
  depth: number;
}

/** Плоский список груп для селекта (DFS, без смітника й архівів). */
export function listCatalogFolderOptions(
  items: Record<string, CatalogTreeItemData>
): CatalogFolderOption[] {
  const rootName = items[CATALOG_ROOT_ID]?.name || 'Каталог';
  const result: CatalogFolderOption[] = [
    { id: CATALOG_ROOT_ID, name: rootName, path: rootName, depth: 0 },
  ];
  const visited = new Set<string>([CATALOG_ROOT_ID, CATALOG_TRASH_ID]);

  const walk = (parentId: string, depth: number, parentPath: string) => {
    const parent = items[parentId];
    if (!parent) return;
    for (const childId of parent.children || []) {
      if (visited.has(childId) || childId === CATALOG_TRASH_ID) continue;
      visited.add(childId);
      const child = items[childId];
      if (!child?.isGroup || child.delMark || isArchiveFolderName(child.name)) continue;
      const path = `${parentPath} / ${child.name}`;
      result.push({ id: child.id, name: child.name, path, depth });
      walk(child.id, depth + 1, path);
    }
  };

  walk(CATALOG_ROOT_ID, 1, rootName);
  return result;
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
  treeNodes: CatalogTreeNodeDto[],
  maxDepth?: number
): { folderCount: number; approxRecords: number; folderName: string; maxDepthAvailable: number } {
  const startId = !folderId || folderId === CATALOG_ROOT_ID ? CATALOG_ROOT_ID : folderId;
  const folderName =
    startId === CATALOG_ROOT_ID
      ? treeItems[CATALOG_ROOT_ID]?.name || 'Каталог'
      : treeItems[startId]?.name || 'папку';

  const childrenCountById = new Map(
    treeNodes.map((n) => [n.id, n.childrenCount ?? 0])
  );

  const maxDepthAvailable = getBranchMaxDepth(startId, treeItems);
  const depthLimit =
    maxDepth === undefined || maxDepth === null
      ? maxDepthAvailable
      : Math.max(0, Math.min(Math.floor(maxDepth), maxDepthAvailable));

  /** Папки, які потрапляють у refresh при обраній глибині (відносна depth ≤ depthLimit). */
  const foldersInScope: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  const walk = (id: string, depth: number) => {
    if (depth >= depthLimit) return;
    const item = treeItems[id];
    if (!item) return;
    const childIds = [...(item.children || [])];
    if (item.archiveChildId && !childIds.includes(item.archiveChildId)) {
      childIds.push(item.archiveChildId);
    }
    for (const childId of childIds) {
      if (!treeItems[childId]?.isGroup) continue;
      foldersInScope.push({ id: childId, depth: depth + 1 });
      walk(childId, depth + 1);
    }
  };
  walk(startId, 0);

  let approxRecords = 0;
  for (const folder of foldersInScope) {
    if (folder.id === CATALOG_ROOT_ID) {
      approxRecords += treeItems[CATALOG_ROOT_ID]?.children.length ?? 0;
    } else {
      approxRecords += childrenCountById.get(folder.id) ?? 0;
    }
  }

  const folderCount =
    startId === CATALOG_ROOT_ID
      ? foldersInScope.filter((f) => f.id !== CATALOG_ROOT_ID).length
      : foldersInScope.length;

  return { folderCount, approxRecords, folderName, maxDepthAvailable };
}

/**
 * Макс. відносна глибина вкладених папок від обраної (0 = немає вкладених груп).
 * Узгоджено з server `refreshFolderFromDilovod` (depth стартової папки = 0).
 */
export function getBranchMaxDepth(
  folderId: string,
  treeItems: Record<string, CatalogTreeItemData>
): number {
  const startId = !folderId || folderId === CATALOG_ROOT_ID ? CATALOG_ROOT_ID : folderId;
  let max = 0;
  const walk = (id: string, depth: number) => {
    max = Math.max(max, depth);
    const item = treeItems[id];
    if (!item) return;
    const childIds = [...(item.children || [])];
    if (item.archiveChildId && !childIds.includes(item.archiveChildId)) {
      childIds.push(item.archiveChildId);
    }
    for (const childId of childIds) {
      if (!treeItems[childId]?.isGroup) continue;
      walk(childId, depth + 1);
    }
  };
  walk(startId, 0);
  return max;
}

/** Підпис опції глибини в ConfirmModal синхронізації гілки. */
export function formatBranchDepthOptionLabel(depth: number, maxAvailable: number): string {
  if (depth === 0) return '0 — лише поточна папка';
  if (depth === maxAvailable) return `${depth} — усі рівні`;
  const levelWord =
    depth % 10 === 1 && depth % 100 !== 11
      ? 'рівень'
      : depth % 10 >= 2 && depth % 10 <= 4 && (depth % 100 < 10 || depth % 100 >= 20)
        ? 'рівні'
        : 'рівнів';
  return `${depth} — поточна + ${depth} ${levelWord}`;
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

export function catalogKitPortionCount(components: Array<{ qty: number }>): number {
  return components.reduce((sum, c) => {
    const q = Number(c.qty);
    return sum + (Number.isFinite(q) ? q : 0);
  }, 0);
}

export function pricesAlmostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** Порівняння ваги в кг після спільного округлення до 0,01. */
export function weightsAlmostEqual(a: number, b: number): boolean {
  const round01 = (n: number) => Math.round(n * 100) / 100;
  return Math.abs(round01(a) - round01(b)) < 0.005;
}

export function massUnitToKgFactor(
  unit: { name: string; code?: string | null } | undefined
): number | null {
  if (!unit) return null;
  const name = unit.name.trim().toLowerCase().replace(/\./g, '');
  const code = (unit.code || '').trim().toLowerCase().replace(/\./g, '');
  const token = `${name} ${code}`;
  if (/^(кг|kg|кілограм)/.test(name) || /^(кг|kg)$/.test(code)) return 1;
  if (/(^| )(л|l|літр|литр|lt|liter)/.test(token) && !/(мл|ml|мілілітр|миллилитр)/.test(token)) {
    return 1;
  }
  if (/^(г|гр|грам|g)/.test(name) && !/кілограм/.test(name)) return 0.001;
  if (/^(мл|ml|мілілітр|миллилитр)/.test(name) || /^(мл|ml)$/.test(code)) return 0.001;
  return null;
}

export type ExpectedBomWeight = {
  kg: number;
  missingCount: number;
};

export type BomWeightComponent = {
  qty: number;
  unitId: string;
  componentWeight: number | null;
  cookingLossPercent?: number | null;
};

export type TechCardRow = {
  name: string;
  nameDisplay: string;
  recipeDisplay: string;
  lossDisplay: string;
  netDisplay: string;
  grossDisplay: string;
  massKgRecipe: number | null;
  massKgNetTotal: number | null;
  massKgGrossTotal: number | null;
};

export type TechCardMassPrecision = 'auto' | 0 | 1 | 2 | 3;

export type TechCardResult = {
  rows: TechCardRow[];
  totalRecipeMassKg: number | null;
  totalNetMassKg: number | null;
  totalGrossMassKg: number | null;
  nonMassCount: number;
  massPrecision: TechCardMassPrecision;
};

/** Обмежує % втрат діапазоном 0–100. */
export function clampCookingLossPercent(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Формат кількості з одиницею виміру, напр. «58 г». */
export function formatBomQtyDisplay(qty: number, unitName: string): string {
  const rounded = Math.round(qty * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
  const unit = unitName.trim();
  return unit ? `${text} ${unit}` : text;
}

/** % втрат для техкарти; 0 — порожній рядок. */
export function formatTechCardLossPercent(value: number | null | undefined): string {
  const loss = clampCookingLossPercent(value);
  if (loss <= 0) return '';
  const rounded = Math.round(loss * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('uk-UA', { maximumFractionDigits: 1 });
  return `${text} %`;
}

/** Текст у першій парі дужок у назві інгредієнта → примітка; дужки прибираються з назви. */
export function extractParenthesizedTextFromName(name: string): {
  cleanName: string;
  extracted: string | null;
} {
  const match = name.match(/\(([^)]+)\)/);
  if (!match) return { cleanName: name, extracted: null };
  const extracted = match[1].trim();
  if (!extracted) return { cleanName: name, extracted: null };
  const cleanName = name.replace(/\s*\([^)]+\)\s*/, ' ').replace(/\s+/g, ' ').trim();
  return { cleanName, extracted };
}

export function hasParenthesizedTextInName(name: string): boolean {
  return /\([^)]+\)/.test(name);
}

/** Назва інгредієнта з приміткою рядка специфікації. */
export function formatTechCardIngredientName(name: string, note?: string | null): string {
  const trimmedName = name.trim();
  const trimmedNote = note?.trim() ?? '';
  if (!trimmedNote) return trimmedName;
  return trimmedName ? `${trimmedName} (${trimmedNote})` : `(${trimmedNote})`;
}

/** Маса в кг для техкарти; без маси — «—». */
export function formatTechCardMassKg(
  kg: number | null,
  precision: TechCardMassPrecision = 'auto'
): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  if (precision === 'auto') {
    const rounded = Math.round(kg * 1000) / 1000;
    const text = rounded.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
    return `${text} кг`;
  }
  const factor = 10 ** precision;
  const rounded = Math.round(kg * factor) / factor;
  const text = rounded.toLocaleString('uk-UA', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return `${text} кг`;
}

function bomRowGrossKg(
  row: BomWeightComponent,
  unitById: Map<string, { id: string; name: string; code?: string | null }>
): number | null {
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const massFactor = massUnitToKgFactor(unitById.get(row.unitId));
  if (massFactor != null) return qty * massFactor;
  const w = row.componentWeight;
  if (w != null && Number.isFinite(w) && w > 0) return qty * w;
  return null;
}

/**
 * Очікувана вага картки, кг:
 * — рядок у кг/г/л/мл → qty (зведена до кг; 1 л = 1 кг);
 * — шт. тощо → qty × вага картки компонента, якщо вона є;
 * — qty у специфікації — маса нетто (без перерахунку на % втрат).
 * У продукції шт. без ваги ігноруються (не попередження).
 * У наборі шт. без ваги порції не входять у суму, але `missingCount` > 0.
 * Для продукції `divideBy` = «Розрахунок на N шт.» (вага порції).
 */
export function expectedBomWeightKg(
  components: BomWeightComponent[],
  units: Array<{ id: string; name: string; code?: string | null }>,
  options?: { divideBy?: number; warnMissingPieceWeight?: boolean }
): ExpectedBomWeight | null {
  if (components.length === 0) return null;
  const unitById = new Map(units.map((u) => [u.id, u]));
  let sum = 0;
  let used = 0;
  let missingCount = 0;
  const warnMissing = Boolean(options?.warnMissingPieceWeight);
  for (let i = 0; i < components.length; i += 1) {
    const row = components[i];
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const netKg = bomRowGrossKg(row, unitById);
    if (netKg != null && netKg > 0) {
      sum += netKg;
      used += 1;
      continue;
    }
    const massFactor = massUnitToKgFactor(unitById.get(row.unitId));
    if (massFactor == null && warnMissing) {
      missingCount += 1;
    }
  }
  if (used === 0 && missingCount === 0) return null;
  const divideBy = options?.divideBy != null && options.divideBy > 0 ? options.divideBy : 1;
  return { kg: Math.round((sum / divideBy) * 100) / 100, missingCount };
}

/** Ймовірно неправильний «Розрахунок на» — вага порції стає нереалістично малою. */
export function isSuspiciousSpecQty(
  components: BomWeightComponent[],
  units: Array<{ id: string; name: string; code?: string | null }>,
  specQty: number
): boolean {
  if (!Number.isFinite(specQty) || specQty <= 1) return false;
  const undivided = expectedBomWeightKg(components, units, { divideBy: 1 });
  const divided = expectedBomWeightKg(components, units, { divideBy: specQty });
  if (!undivided || undivided.kg < 0.05) return false;
  return divided == null || divided.kg < 0.05;
}

/** Поріг підозріло малої маси інгредієнта (0.01 г). */
const SUSPICIOUS_INGREDIENT_MASS_KG = 0.00001;

/**
 * Ймовірно неправильна кількість інгредієнта — маса нетто менше 0.01 г
 * (типова помилка: 70 → 0,07 або пропущена цифра).
 */
export function isSuspiciousBomIngredientQty(
  row: BomWeightComponent,
  units: Array<{ id: string; name: string; code?: string | null }>
): boolean {
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty <= 0) return false;

  const unitById = new Map(units.map((u) => [u.id, u]));
  const grossKg = bomRowGrossKg(row, unitById);
  if (grossKg != null) {
    return grossKg < SUSPICIOUS_INGREDIENT_MASS_KG;
  }

  const pieceWeightKg = row.componentWeight;
  if (pieceWeightKg != null && Number.isFinite(pieceWeightKg) && pieceWeightKg > 0) {
    return qty * pieceWeightKg < SUSPICIOUS_INGREDIENT_MASS_KG;
  }

  return false;
}

/** Рядки техкарти для N порцій: нетто з урахуванням % втрат, брутто = нетто / (1 − loss%). */
export function buildTechCardRows(
  components: Array<{
    componentName: string;
    qty: number;
    unitId: string;
    componentWeight: number | null;
    note?: string | null;
    cookingLossPercent?: number | null;
  }>,
  units: Array<{ id: string; name: string; code?: string | null }>,
  specQty: number,
  portions: number,
  massPrecision: TechCardMassPrecision = 'auto'
): TechCardResult {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const safeSpecQty = Number.isFinite(specQty) && specQty > 0 ? specQty : 1;
  const safePortions = Number.isFinite(portions) && portions > 0 ? portions : 1;
  const scale = safePortions / safeSpecQty;

  let totalRecipeMassKg = 0;
  let totalNetMassKg = 0;
  let totalGrossMassKg = 0;
  let hasRecipeMass = false;
  let hasNetMass = false;
  let hasGrossMass = false;
  let nonMassCount = 0;

  const rows: TechCardRow[] = components
    .filter((c) => Number(c.qty) > 0)
    .map((c) => {
      const unit = unitById.get(c.unitId);
      const unitName = unit?.name?.trim() || '';
      const recipeQty = c.qty;
      const loss = clampCookingLossPercent(c.cookingLossPercent);
      const netRecipe = bomRowGrossKg(
        { qty: recipeQty, unitId: c.unitId, componentWeight: c.componentWeight },
        unitById
      );
      const netTotal = netRecipe != null ? netRecipe * scale : null;
      const grossTotal =
        netTotal != null && loss < 100 ? netTotal / (1 - loss / 100) : netTotal;

      if (netRecipe != null) {
        totalRecipeMassKg += netRecipe;
        hasRecipeMass = true;
      } else {
        nonMassCount += 1;
      }
      if (netTotal != null) {
        totalNetMassKg += netTotal;
        hasNetMass = true;
      }
      if (grossTotal != null) {
        totalGrossMassKg += grossTotal;
        hasGrossMass = true;
      }

      return {
        name: c.componentName,
        nameDisplay: formatTechCardIngredientName(c.componentName, c.note),
        recipeDisplay: formatBomQtyDisplay(recipeQty, unitName),
        lossDisplay: formatTechCardLossPercent(loss),
        netDisplay: formatTechCardMassKg(netTotal, massPrecision),
        grossDisplay: formatTechCardMassKg(grossTotal, massPrecision),
        massKgRecipe: netRecipe,
        massKgNetTotal: netTotal,
        massKgGrossTotal: grossTotal,
      };
    });

  const roundKg = (value: number) => Math.round(value * 1000) / 1000;

  return {
    rows,
    totalRecipeMassKg: hasRecipeMass ? roundKg(totalRecipeMassKg) : null,
    totalNetMassKg: hasNetMass ? roundKg(totalNetMassKg) : null,
    totalGrossMassKg: hasGrossMass ? roundKg(totalGrossMassKg) : null,
    nonMassCount,
    massPrecision,
  };
}

/** Військові: основа − 5 грн × порції набору; звичайний товар — основа − 5 грн. */
export function expectedMilitaryPrice(
  mainPrice: number,
  isKit: boolean,
  kitPortionCount: number
): number {
  const portions = isKit ? kitPortionCount : 1;
  const next = mainPrice - portions * CATALOG_MILITARY_DISCOUNT_PER_PORTION;
  return Math.round(Math.max(0, next) * 100) / 100;
}

export function catalogMainPrice(
  prices: Array<{ priceType: string; price: number }>
): number | null {
  const retail = prices.find((p) => p.priceType === CATALOG_PRICE_TYPE_RETAIL_ID);
  if (retail) return retail.price;
  const regular = prices.find((p) => p.priceType === CATALOG_PRICE_TYPE_REGULAR_ID);
  if (regular) return regular.price;
  return null;
}

/**
 * Синхронізує похідні ціни: «Звичайна» = «Роздріб» (якщо syncRegularFromRetail),
 * «Військові» за формулою від основи (Роздріб, інакше Звичайна).
 */
export function withSyncedDerivedPrices<T extends { priceType: string; price: number }>(
  prices: T[],
  isKit: boolean,
  kitPortionCount: number,
  syncRegularFromRetail: boolean
): T[] {
  const retail = prices.find((p) => p.priceType === CATALOG_PRICE_TYPE_RETAIL_ID);
  const main = catalogMainPrice(prices);
  if (main == null || !Number.isFinite(main)) return prices;
  const military = expectedMilitaryPrice(main, isKit, kitPortionCount);
  return prices.map((row) => {
    if (syncRegularFromRetail && retail && row.priceType === CATALOG_PRICE_TYPE_REGULAR_ID) {
      return { ...row, price: retail.price };
    }
    if (row.priceType === CATALOG_PRICE_TYPE_MILITARY_ID) {
      return { ...row, price: military };
    }
    return row;
  });
}

export {
  areRequiredCatalogPricesFilled,
  catalogMissingNameLabels,
  getMissingRequiredCatalogFields,
} from '@shared/utils/catalogRequiredFields';

/** Нормалізує пунктуацію в назві: пробіли біля дужок, +, після крапки/коми тощо. */
export function formatCatalogName(raw: string): string {
  if (!raw) return raw;
  let s = raw.replace(/\u00a0/g, ' ');

  // s = s.replace(/(\p{L})(\d)/gu, '$1 $2'); // між буквою і цифрою
  // s = s.replace(/(\d)(\p{L})/gu, '$1 $2'); // між цифрою і буквою
  s = s.replace(/\s*\+\s*/g, ' + '); // між знаком +
  s = s.replace(/\s*\(/g, ' ('); // перед дужкою
  s = s.replace(/\(\s+/g, '('); // перед дужкою
  s = s.replace(/\s+\)/g, ')'); // після дужки
  s = s.replace(/\)(?=[\p{L}\p{N}])/gu, ') '); // після дужки і перед буквою або цифрою

  s = s.replace(/\s+([,.;:!?])/g, '$1'); // після знака пунктуації
  s = s.replace(/,(?=\p{L})/gu, ', '); // після коми і перед буквою
  s = s.replace(/\.(?=\p{L})/gu, '. '); // після крапки і перед буквою
  s = s.replace(/;(?=\S)/g, '; '); // після крапки і перед буквою
  s = s.replace(/:(?=\S)/g, ': '); // після коми і перед буквою
  s = s.replace(/!(?=\S)/g, '! '); // після крапки і перед буквою
  s = s.replace(/\?(?=\S)/g, '? '); // після крапки і перед буквою

  return s.replace(/ {2,}/g, ' '); // два і більше пробілів
}

/** Чи в назві є вага з одиницею (кг/г) — для неї є окреме поле. */
export function catalogNameContainsWeight(name: string): boolean {
  return /\d+(?:[.,]\d+)?\s*(?:кг|кілограм(?:а|и|ів)?|грам(?:а|и|ів)?|гр|г|kg|g)(?=$|[^\p{L}])/iu.test(
    name
  );
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
