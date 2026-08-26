import { useEffect, useRef, useState } from 'react';
import {
  dragAndDropFeature,
  expandAllFeature,
  hotkeysCoreFeature,
  isOrderedDragTarget,
  selectionFeature,
  syncDataLoaderFeature,
  type ItemInstance,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogTreeItemData } from '../ProductsTypes';
import { CATALOG_ROOT_ID, CATALOG_TRASH_ID } from '../ProductsTypes';
import {
  createCatalogDragPreview,
  createCatalogLiveDragPreview,
  moveCatalogDragPreview,
  snapBackCatalogDragPreview,
  dismissCatalogDragPreview,
  catalogDragPreviewOffset,
  setCatalogDndCursor,
  collectCatalogHitRects,
  hitCatalogRect,
  applyCatalogDropAttrs,
  clearCatalogDropAttrs,
  markCatalogDndSources,
  getBlockedMoveTargetIds,
  buildFolderBreadcrumbs,
} from '../ProductsUtils';

interface CatalogTreeProps {
  items: Record<string, CatalogTreeItemData>;
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onMove: (ids: string[], targetParentId: string) => void;
  /** Sibling reorder папок (інтервальний sortOrder) */
  onReorder?: (params: {
    parentId: string | null;
    id: string;
    beforeId?: string | null;
    afterId?: string | null;
  }) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
}

interface TreeNodeProps {
  item: ItemInstance<CatalogTreeItemData>;
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onCollapseFolders?: () => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
  /** Чи показувати vertical line навколо дочірніх вузлів (false для root) */
  showChildGuides?: boolean;
  draggingId?: string | null;
  dropHint?: TreeDropHint | null;
  onFolderPointerDown?: (e: React.PointerEvent<HTMLElement>, folderId: string) => void;
  suppressClickRef?: React.MutableRefObject<boolean>;
}

type TreeDropHint =
  | { kind: 'reorder'; id: string; position: 'before' | 'after' }
  | { kind: 'into'; id: string };

function treeParentKey(parentId: string | null | undefined): string {
  if (!parentId || parentId === '0') return CATALOG_ROOT_ID;
  return parentId;
}

function TreeNode({
  item,
  selectedFolderId,
  onSelectFolder,
  onCollapseFolders,
  onContextMenu,
  showChildGuides = true,
  draggingId,
  dropHint,
  onFolderPointerDown,
  suppressClickRef,
}: TreeNodeProps) {
  const data = item.getItemData();
  const isRoot = item.getId() === CATALOG_ROOT_ID;
  const isActive = selectedFolderId === item.getId();
  const archiveChildId = data.archiveChildId || null;
  const isArchiveActive = Boolean(archiveChildId && selectedFolderId === archiveChildId);
  const children = item.getChildren();
  const hasChildFolders = children.length > 0;
  // Root завжди розгорнутий
  const isExpanded = isRoot || item.isExpanded();
  const itemProps = item.getProps();
  // true лише якщо є розгорнута папка з дочірніми групами (leaf у expandedItems не рахуємо)
  const hasExpandedItems = isRoot
    ? (item.getTree().getState().expandedItems ?? []).some((id) => {
        if (id === CATALOG_ROOT_ID) return false;
        const inst = item.getTree().getItemInstance(id);
        return Boolean(inst?.isExpanded() && inst.getChildren().length > 0);
      })
    : false;

  const toggleExpand = () => {
    if (isRoot || !hasChildFolders) return;
    if (item.isExpanded()) {
      item.collapse();
    } else {
      item.expand();
    }
  };

  const isDragging = draggingId === item.getId();
  const showDropInto = dropHint?.kind === 'into' && dropHint.id === item.getId();
  const showDropBefore =
    dropHint?.kind === 'reorder' &&
    dropHint.id === item.getId() &&
    dropHint.position === 'before';
  const showDropAfter =
    dropHint?.kind === 'reorder' &&
    dropHint.id === item.getId() &&
    dropHint.position === 'after';

  return (
    <li className="list-none">
      <div
          className={[
          'flex w-full items-center gap-0.5 rounded-sm my-0.5 transition-colors relative',
          isRoot ? 'bg-primary/5' : '',
          isActive ? 'bg-primary/10 text-primary' : 'hover:bg-primary/5',
          data.delMark ? 'opacity-60' : '',
          item.isUnorderedDragTarget() || showDropInto ? 'bg-amber-400/20' : '',
          showDropBefore ? 'shadow-[inset_0_2px_0_0_#f59e0b]' : '',
          showDropAfter ? 'shadow-[inset_0_-2px_0_0_#f59e0b]' : '',
          isDragging ? 'opacity-35' : '',
        ].join(' ')}
        data-catalog-folder-id={item.getId()}
      >
        <button
          {...itemProps}
          type="button"
          draggable={isRoot ? false : itemProps.draggable}
          onDragStart={isRoot ? undefined : itemProps.onDragStart}
          onPointerDown={(e) => {
            if (isRoot) return;
            if ((e.target as HTMLElement | null)?.closest?.('[data-tree-chevron], [data-tree-archive]')) {
              return;
            }
            onFolderPointerDown?.(e, item.getId());
          }}
          onClick={(e) => {
            if (suppressClickRef?.current) {
              suppressClickRef.current = false;
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Не викликаємо itemProps.onClick — він одразу toggle expand
            e.preventDefault();
            e.stopPropagation();

            const clickedChevron = Boolean(
              (e.target as HTMLElement | null)?.closest?.('[data-tree-chevron]')
            );

            if (isRoot) {
              onSelectFolder(CATALOG_ROOT_ID);
              return;
            }

            if (!data.isGroup) return;

            if (clickedChevron) {
              toggleExpand();
              return;
            }

            // Неактивна папка: лише розгортання (не згортання)
            // Активна папка: повний toggle
            if (hasChildFolders) {
              if (isActive) {
                toggleExpand();
              } else if (!item.isExpanded()) {
                item.expand();
              }
            }

            onSelectFolder(item.getId());
          }}
          onContextMenu={(e) => {
            if (isRoot || !onContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, [item.getId()]);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm p-2 text-left"
        >
          {hasChildFolders && !isRoot ? (
            <span
              data-tree-chevron
              aria-hidden
              className="inline-flex shrink-0 rounded hover:bg-default-200/60"
            >
              <DynamicIcon
                name="chevron-down"
                size={16}
                className={[
                  'pointer-events-none transition-transform duration-200',
                  'text-default-500',
                  isExpanded ? '' : '-rotate-90',
                ].join(' ')}
              />
            </span>
          ) : null}
          {!hasChildFolders && (
            <DynamicIcon
              name={isActive ? 'folder-open' : 'folder'}
              size={16}
              className={`shrink-0 p-[1px] ${isActive ? 'text-primary' : 'text-default-500'}`}
            />
          )}
          {isRoot && (
            <DynamicIcon
              name="folder-open-dot"
              size={16}
              className={`shrink-0`}
            />
          )}
          <span className={`truncate select-none ${isRoot ? 'font-semibold' : ''}`}>{data.name}</span>
          {typeof data.objectCount === 'number' ? (
            <span className="shrink-0 tabular-nums text-[11px] leading-none text-default-400 bg-default-100/50 rounded px-1 py-1">
              {data.objectCount}
            </span>
          ) : null}
        </button>

        {isRoot && hasExpandedItems && (
          <Tooltip content="Згорнути всі групи" placement="right" showArrow classNames={{ base: 'before:bg-slate-600 before:rounded-[2px] before:left-[calc(calc(1.25rem/4-2px)*-0.5)]!', content: 'bg-slate-600 border-0 text-white text-xs' }} delay={300}>
            <button
              type="button"
              aria-label="Згорнути всі групи"
              className={`mr-1.5 inline-flex shrink-0 rounded p-1 text-default-600 transition-colors hover:bg-default-200/60 hover:text-default-700`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCollapseFolders?.();
              }}
            >
              <DynamicIcon name="copy-minus" size={14} className="pointer-events-none" />
            </button>
          </Tooltip>
        )}

        {archiveChildId ? (
          <Tooltip content="Відкрити архів" placement="right" showArrow classNames={{ base: 'before:bg-slate-600 before:rounded-[2px] before:left-[calc(calc(1.25rem/4-2px)*-0.5)]!', content: 'bg-slate-600 border-0 text-white text-xs' }} delay={300}>
            <button
              type="button"
              data-tree-archive
              aria-label={`Архів: ${data.name}`}
              className={[
                'mr-1.5 inline-flex shrink-0 rounded p-1 transition-colors',
                isArchiveActive
                  ? 'bg-warning/20 text-warning'
                  : 'text-gray-400/80 hover:text-warning',
              ].join(' ')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectFolder(archiveChildId);
              }}
              onContextMenu={(e) => {
                if (!onContextMenu) return;
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e, [archiveChildId]);
              }}
            >
              <DynamicIcon name="archive" size={14} className="pointer-events-none" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      {hasChildFolders && (
        <div
          className={[
            'grid transition-[grid-template-rows] duration-200 ease-out',
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] pointer-events-none',
          ].join(' ')}
          aria-hidden={!isExpanded}
        >
          <ul
            role="group"
            className={[
              'relative min-h-0 list-none overflow-hidden',
              showChildGuides
                ? 'border-l-1 border-default-300 ml-4 pl-3.5'
                : 'pl-0',
            ].join(' ')}
          >
            {children.map((child) => (
              <TreeNode
                key={child.getId()}
                item={child}
                selectedFolderId={selectedFolderId}
                onSelectFolder={onSelectFolder}
                onContextMenu={onContextMenu}
                showChildGuides
                draggingId={draggingId}
                dropHint={dropHint}
                onFolderPointerDown={onFolderPointerDown}
                suppressClickRef={suppressClickRef}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function CatalogTree({
  items,
  selectedFolderId,
  onSelectFolder,
  onMove,
  onReorder,
  onContextMenu,
}: CatalogTreeProps) {
  const tree = useTree<CatalogTreeItemData>({
    rootItemId: CATALOG_ROOT_ID,
    indent: 16,
    canReorder: true,
    reorderAreaPercentage: 0.35,
    initialState: { expandedItems: [CATALOG_ROOT_ID] },
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isGroup,
    canDrag: (dragItems) =>
      dragItems.every((i) => i.getId() !== CATALOG_ROOT_ID && i.getItemData().isGroup),
    setDragImage: (draggedItems) => {
      const labels = draggedItems.map((i) => i.getItemName());
      const imgElement = createCatalogDragPreview(labels);
      return { imgElement, xOffset: 12, yOffset: 12 };
    },
    dataLoader: {
      getItem: (itemId: string) =>
        items[itemId] || {
          id: itemId,
          name: itemId,
          isGroup: true,
          delMark: false,
          sku: null,
          isKit: false,
          parentId: null,
          children: [],
          archiveChildId: null,
        },
      getChildren: (itemId: string) => items[itemId]?.children || [],
    },
    canDrop: (dragItems, target) => {
      const targetData = target.item.getItemData();
      if (!targetData.isGroup && target.item.getId() !== CATALOG_ROOT_ID) return false;
      const dragIds = new Set(dragItems.map((i) => i.getId()));
      if (dragIds.has(target.item.getId())) return false;
      // Reorder між siblings — лише папки
      if (isOrderedDragTarget(target)) {
        return dragItems.every((i) => i.getItemData().isGroup);
      }
      return true;
    },
    canDropForeignDragObject: (_dataTransfer, target) => {
      const targetData = target.item.getItemData();
      // Foreign (з таблиці) — лише move в папку, не reorder
      if (isOrderedDragTarget(target)) return false;
      return targetData.isGroup || target.item.getId() === CATALOG_ROOT_ID;
    },
    onDrop: (dragItems, target) => {
      const ids = dragItems.map((i) => i.getId()).filter((id) => id !== CATALOG_ROOT_ID);
      if (ids.length === 0) return;

      if (isOrderedDragTarget(target) && onReorder) {
        const parentTreeId = target.item.getId();
        const parentId = parentTreeId === CATALOG_ROOT_ID ? null : parentTreeId;
        const siblings = (items[parentTreeId]?.children || []).filter((cid) => !ids.includes(cid));
        const insertAt = Math.max(
          0,
          Math.min(target.insertionIndex ?? target.childIndex, siblings.length)
        );
        const afterId = insertAt > 0 ? siblings[insertAt - 1] : null;
        const beforeId = insertAt < siblings.length ? siblings[insertAt] : null;
        // Одну папку за раз (інтервальний API)
        onReorder({ parentId, id: ids[0], afterId, beforeId });
        return;
      }

      onMove(ids, target.item.getId());
    },
    onDropForeignDragObject: (dataTransfer, target) => {
      try {
        const raw = dataTransfer.getData('application/x-catalog-ids');
        const ids = JSON.parse(raw || '[]') as string[];
        if (!Array.isArray(ids) || ids.length === 0) return;
        if (isOrderedDragTarget(target)) return;
        onMove(ids.filter(Boolean), target.item.getId());
      } catch {
        // ignore invalid payload
      }
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      dragAndDropFeature,
      hotkeysCoreFeature,
      expandAllFeature,
    ],
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<TreeDropHint | null>(null);
  const dropHintRef = useRef<TreeDropHint | null>(null);
  dropHintRef.current = dropHint;
  const suppressClickRef = useRef(false);
  const pointerDndRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    sourceId: string;
    pointerType: string;
    captureEl: HTMLElement | null;
    pressTimer: number | null;
  } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // Авто-розкриття шляху до активної папки (таблиця, breadcrumbs, дерево).
  // Архівні папки приховані в дереві — пропускаємо їх у expand.
  useEffect(() => {
    const path = buildFolderBreadcrumbs(selectedFolderId, items);
    for (const crumb of path) {
      const crumbItem = items[crumb.id];
      if (!crumbItem) continue;
      const parentKey =
        !crumbItem.parentId || crumbItem.parentId === '0'
          ? CATALOG_ROOT_ID
          : crumbItem.parentId;
      if (items[parentKey]?.archiveChildId === crumb.id) continue;

      // Не expand папки без дочірніх груп — інакше leaf потрапляє в expandedItems
      if (!crumbItem.children?.length) continue;

      const treeItem = tree.getItemInstance(crumb.id);
      if (treeItem && !treeItem.isExpanded()) {
        treeItem.expand();
      }
    }
    // tree — стабільний інстанс; залежність лише від активної папки / даних
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, items]);

  useEffect(() => {
    const CANCEL_MOVE_PX = 12;
    const EDGE = 0.28;

    const previewPos = (e: PointerEvent, pointerType: string) => {
      const offset = catalogDragPreviewOffset(pointerType);
      return { x: e.clientX + offset.x, y: e.clientY + offset.y };
    };

    const clearPressTimer = () => {
      const session = pointerDndRef.current;
      if (session?.pressTimer != null) {
        window.clearTimeout(session.pressTimer);
        session.pressTimer = null;
      }
    };

    const releaseCapture = () => {
      const session = pointerDndRef.current;
      if (!session?.captureEl) return;
      try {
        if (session.captureEl.hasPointerCapture(session.pointerId)) {
          session.captureEl.releasePointerCapture(session.pointerId);
        }
      } catch {
        // ignore
      }
    };

    const resolveHint = (clientY: number, folderEl: HTMLElement, dragId: string): TreeDropHint | null => {
      const targetId = folderEl.getAttribute('data-catalog-folder-id');
      if (!targetId || targetId === dragId) return null;
      const treeItems = itemsRef.current;
      const blocked = getBlockedMoveTargetIds([dragId], treeItems);
      const rect = folderEl.getBoundingClientRect();
      const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
      const dragParent = treeParentKey(treeItems[dragId]?.parentId);
      const targetParent = treeParentKey(treeItems[targetId]?.parentId);
      const isSibling = dragParent === targetParent && targetId !== CATALOG_ROOT_ID;

      if (isSibling && (ratio <= EDGE || ratio >= 1 - EDGE)) {
        const siblings = (treeItems[dragParent]?.children ?? []).filter((id) => id !== dragId);
        const position: 'before' | 'after' = ratio <= EDGE ? 'before' : 'after';
        const idx = siblings.indexOf(targetId);
        if (idx < 0) return null;
        if (position === 'after' && idx < siblings.length - 1) {
          return { kind: 'reorder', id: siblings[idx + 1], position: 'before' };
        }
        return { kind: 'reorder', id: targetId, position };
      }

      if (blocked.has(targetId)) return null;
      if (treeItems[targetId]?.isGroup || targetId === CATALOG_ROOT_ID) {
        return { kind: 'into', id: targetId };
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      lastPtr = e;
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const ev = lastPtr;
        if (ev) processMove(ev);
      });
    };

    let raf = 0;
    let lastPtr: PointerEvent | null = null;
    let folderRects = collectCatalogHitRects('[data-catalog-folder-id]');

    const processMove = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);

      if (!session.active) {
        if (dist > CANCEL_MOVE_PX) {
          clearPressTimer();
          pointerDndRef.current = null;
        }
        return;
      }

      e.preventDefault();
      const pos = previewPos(e, session.pointerType);
      moveCatalogDragPreview(pos.x, pos.y);
      folderRects = collectCatalogHitRects('[data-catalog-folder-id]');
      const folderHit = hitCatalogRect(folderRects, e.clientX, e.clientY, 'xy');
      if (!folderHit) {
        dropHintRef.current = null;
        applyCatalogDropAttrs(null);
        return;
      }
      const hint = resolveHint(e.clientY, folderHit.el, session.sourceId);
      dropHintRef.current = hint;
      applyCatalogDropAttrs(hint, folderHit.el);
    };

    const onPointerUp = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      if (lastPtr && session.active) processMove(lastPtr);
      lastPtr = null;
      clearPressTimer();
      releaseCapture();
      pointerDndRef.current = null;

      if (!session.active) {
        clearCatalogDropAttrs();
        return;
      }

      const hint = dropHintRef.current;
      let didAction = false;
      if (hint?.kind === 'into') {
        onMoveRef.current([session.sourceId], hint.id);
        didAction = true;
      } else if (hint?.kind === 'reorder' && onReorderRef.current) {
        const treeItems = itemsRef.current;
        const parentKey = treeParentKey(treeItems[hint.id]?.parentId);
        const parentId = parentKey === CATALOG_ROOT_ID ? null : parentKey;
        const siblings = (treeItems[parentKey]?.children ?? []).filter(
          (id) => id !== session.sourceId
        );
        const idx = siblings.indexOf(hint.id);
        if (idx >= 0) {
          const insertAt = hint.position === 'before' ? idx : idx + 1;
          const afterId = insertAt > 0 ? siblings[insertAt - 1] : null;
          const beforeId = insertAt < siblings.length ? siblings[insertAt] : null;
          onReorderRef.current({
            parentId,
            id: session.sourceId,
            afterId,
            beforeId,
          });
          didAction = true;
        }
      }

      setCatalogDndCursor(false);
      dropHintRef.current = null;
      clearCatalogDropAttrs();
      markCatalogDndSources([]);

      const sourceId = session.sourceId;
      void (async () => {
        if (!didAction) {
          const sourceEl = document.querySelector(
            `[data-catalog-folder-id="${CSS.escape(sourceId)}"]`
          );
          await snapBackCatalogDragPreview(
            sourceEl instanceof HTMLElement ? sourceEl : null
          );
        } else {
          await dismissCatalogDragPreview();
        }
        setDraggingId(null);
      })();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pointerDndRef.current?.active) return;
      e.preventDefault();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      clearPressTimer();
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const onFolderPointerDown = (e: React.PointerEvent<HTMLElement>, folderId: string) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (folderId === CATALOG_ROOT_ID) return;
    const captureEl = e.currentTarget;
    const session = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      sourceId: folderId,
      pointerType: e.pointerType,
      captureEl,
      pressTimer: window.setTimeout(() => {
        const current = pointerDndRef.current;
        if (!current || current.pointerId !== e.pointerId || current.active) return;
        startActiveDragFromPress();
      }, 380) as unknown as number,
    };
    pointerDndRef.current = session;

    const startActiveDragFromPress = () => {
      const current = pointerDndRef.current;
      if (!current || current.pointerId !== e.pointerId) return;
      current.active = true;
      current.pressTimer = null;
      suppressClickRef.current = true;
      setDraggingId(current.sourceId);
      markCatalogDndSources([current.sourceId]);
      setCatalogDndCursor(true);
      const name = itemsRef.current[current.sourceId]?.name || 'Папка';
      createCatalogLiveDragPreview(name);
      const offset = catalogDragPreviewOffset(current.pointerType);
      moveCatalogDragPreview(e.clientX + offset.x, e.clientY + offset.y);
      try {
        captureEl.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    };
  };

  const root = tree.getRootItem();
  // Єдина лінія вставки (не дублювати з per-item isDragTargetAbove/Below)
  const dragLineData = tree.getDragLineData();
  const dragLineStyle = dragLineData ? tree.getDragLineStyle(2, 8) : undefined;

  return (
    <div
      {...tree.getContainerProps('Каталог товарів')}
      className="relative h-full overflow-auto text-sm"
    >
      <ul role="tree" className="relative m-0 list-none p-0">
        {root && (
          <TreeNode
            item={root}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onCollapseFolders={() => {
              tree.collapseAll();
              tree.getItemInstance(CATALOG_ROOT_ID)?.expand();
            }}
            onContextMenu={onContextMenu}
            showChildGuides={false}
            draggingId={draggingId}
            dropHint={dropHint}
            onFolderPointerDown={onFolderPointerDown}
            suppressClickRef={suppressClickRef}
          />
        )}
        <li className="list-none">
          <div
            className={[
              'relative my-0.5 flex w-full items-center gap-0.5 rounded-sm text-danger transition-colors',
              selectedFolderId === CATALOG_TRASH_ID
                ? 'bg-danger/10'
                : 'hover:bg-danger/10',
            ].join(' ')}
          >
            <button
              type="button"
              aria-label="Смітник"
              onClick={() => onSelectFolder(CATALOG_TRASH_ID)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm p-2 text-left"
            >
              <DynamicIcon name="trash-2" size={16} className="shrink-0 p-[1px]" />
              <span className="truncate">Смітник</span>
            </button>
          </div>
        </li>
      </ul>
      {dragLineStyle && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 h-[3px] rounded-full bg-amber-500"
          style={dragLineStyle}
        />
      )}
    </div>
  );
}
