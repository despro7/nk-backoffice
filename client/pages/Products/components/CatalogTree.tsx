import { useEffect } from 'react';
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type ItemInstance,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogTreeItemData } from '../ProductsTypes';
import { CATALOG_ROOT_ID } from '../ProductsTypes';
import {
  isArchiveFolderName,
  createCatalogDragPreview,
  buildFolderBreadcrumbs,
} from '../ProductsUtils';

interface CatalogTreeProps {
  items: Record<string, CatalogTreeItemData>;
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onMove: (ids: string[], targetParentId: string) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
}

interface TreeNodeProps {
  item: ItemInstance<CatalogTreeItemData>;
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
  /** Чи показувати vertical line навколо дочірніх вузлів (false для root) */
  showChildGuides?: boolean;
}

function TreeNode({
  item,
  selectedFolderId,
  onSelectFolder,
  onContextMenu,
  showChildGuides = true,
}: TreeNodeProps) {
  const data = item.getItemData();
  const isRoot = item.getId() === CATALOG_ROOT_ID;
  const isActive = selectedFolderId === item.getId();
  const isArchive = isArchiveFolderName(data.name);
  const children = item.getChildren();
  const hasChildFolders = children.length > 0;
  // Root завжди розгорнутий
  const isExpanded = isRoot || item.isExpanded();
  const itemProps = item.getProps();

  const folderIcon = isRoot ? 'folder' : isArchive ? 'archive' : undefined;

  const toggleExpand = () => {
    if (isRoot || !hasChildFolders) return;
    if (item.isExpanded()) {
      item.collapse();
    } else {
      item.expand();
    }
  };

  return (
    <li className="list-none">
      <button
        {...itemProps}
        type="button"
        draggable={isRoot ? false : itemProps.draggable}
        onDragStart={isRoot ? undefined : itemProps.onDragStart}
        onClick={(e) => {
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
        className={[
          'flex w-full items-center gap-1.5 rounded-sm p-2 my-0.5 text-left transition-colors',
          isRoot ? 'bg-primary/5' : '',
          isActive ? 'bg-primary/10 text-primary' : 'hover:bg-primary/5',
          data.delMark ? 'opacity-60' : '',
          item.isDragTarget() ? 'bg-amber-400/20' : '',
        ].join(' ')}
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
                isArchive ? 'text-warning' : 'text-default-500',
                isExpanded ? '' : '-rotate-90',
              ].join(' ')}
            />
          </span>
        ) : !isRoot ? (
          <span className="inline-block w-4 shrink-0" aria-hidden />
        ) : null}
        {folderIcon && (
          <DynamicIcon
            name={folderIcon}
            size={16}
            className={`shrink-0 ${isArchive ? 'text-warning' : isActive ? 'text-primary' : 'text-default-500'}`}
          />
        )}
        <span className={`truncate ${isRoot ? 'font-semibold' : ''}`}>{data.name}</span>
      </button>

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
  onContextMenu,
}: CatalogTreeProps) {
  const tree = useTree<CatalogTreeItemData>({
    rootItemId: CATALOG_ROOT_ID,
    indent: 16,
    canReorder: false,
    initialState: { expandedItems: [CATALOG_ROOT_ID] },
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isGroup,
    canDrag: (dragItems) =>
      dragItems.every((i) => i.getId() !== CATALOG_ROOT_ID),
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
        },
      getChildren: (itemId: string) => items[itemId]?.children || [],
    },
    canDrop: (dragItems, target) => {
      const targetData = target.item.getItemData();
      if (!targetData.isGroup && target.item.getId() !== CATALOG_ROOT_ID) return false;
      const dragIds = new Set(dragItems.map((i) => i.getId()));
      if (dragIds.has(target.item.getId())) return false;
      return true;
    },
    canDropForeignDragObject: (_dataTransfer, target) => {
      const targetData = target.item.getItemData();
      return targetData.isGroup || target.item.getId() === CATALOG_ROOT_ID;
    },
    onDrop: (dragItems, target) => {
      const ids = dragItems.map((i) => i.getId()).filter((id) => id !== CATALOG_ROOT_ID);
      if (ids.length === 0) return;
      onMove(ids, target.item.getId());
    },
    onDropForeignDragObject: (dataTransfer, target) => {
      try {
        const raw = dataTransfer.getData('application/x-catalog-ids');
        const ids = JSON.parse(raw || '[]') as string[];
        if (!Array.isArray(ids) || ids.length === 0) return;
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
    ],
  });

  // Авто-розкриття шляху до активної папки (таблиця, breadcrumbs, дерево)
  useEffect(() => {
    const path = buildFolderBreadcrumbs(selectedFolderId, items);
    for (const crumb of path) {
      const item = tree.getItemInstance(crumb.id);
      if (item && !item.isExpanded()) {
        item.expand();
      }
    }
    // tree — стабільний інстанс; залежність лише від активної папки / даних
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, items]);

  const root = tree.getRootItem();

  return (
    <div
      {...tree.getContainerProps('Каталог товарів')}
      className="h-full overflow-auto text-sm"
    >
      <ul role="tree" className="m-0 list-none p-0">
        {root && (
          <TreeNode
            item={root}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onContextMenu={onContextMenu}
            showChildGuides={false}
          />
        )}
      </ul>
    </div>
  );
}
