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

/**
 * Очікувана вага картки, кг:
 * — рядок у кг/г/л/мл → qty (зведена до кг; 1 л = 1 кг);
 * — шт. тощо → qty × вага картки компонента, якщо вона є.
 * У продукції шт. без ваги ігноруються (не попередження).
 * У наборі шт. без ваги порції не входять у суму, але `missingCount` > 0.
 * Для продукції `divideBy` = «Розрахунок на N шт.» (вага порції).
 */
export function expectedBomWeightKg(
  components: Array<{
    qty: number;
    unitId: string;
    componentWeight: number | null;
  }>,
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
    const massFactor = massUnitToKgFactor(unitById.get(row.unitId));
    if (massFactor != null) {
      sum += qty * massFactor;
      used += 1;
      continue;
    }
    const w = row.componentWeight;
    if (w != null && Number.isFinite(w) && w > 0) {
      sum += qty * w;
      used += 1;
    } else if (warnMissing) {
      missingCount += 1;
    }
  }
  if (used === 0 && missingCount === 0) return null;
  const divideBy = options?.divideBy != null && options.divideBy > 0 ? options.divideBy : 1;
  return { kg: Math.round((sum / divideBy) * 100) / 100, missingCount };
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

  s = s.replace(/(\p{L})(\d)/gu, '$1 $2');
  s = s.replace(/(\d)(\p{L})/gu, '$1 $2');
  s = s.replace(/\s*\+\s*/g, ' + ');
  s = s.replace(/\s*\(/g, ' (');
  s = s.replace(/\(\s+/g, '(');
  s = s.replace(/\s+\)/g, ')');
  s = s.replace(/\)(?=[\p{L}\p{N}])/gu, ') ');

  s = s.replace(/\s+([,.;:!?])/g, '$1');
  s = s.replace(/,(?=\p{L})/gu, ', ');
  s = s.replace(/\.(?=\p{L})/gu, '. ');
  s = s.replace(/;(?=\S)/g, '; ');
  s = s.replace(/:(?=\S)/g, ': ');
  s = s.replace(/!(?=\S)/g, '! ');
  s = s.replace(/\?(?=\S)/g, '? ');

  return s.replace(/ {2,}/g, ' ');
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
