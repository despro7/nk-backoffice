import { BreadcrumbItem, Breadcrumbs } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogTreeItemData } from '../ProductsTypes';
import { CATALOG_ROOT_ID, CATALOG_TRASH_ID } from '../ProductsTypes';
import { buildFolderBreadcrumbs } from '../ProductsUtils';

interface CatalogBreadcrumbsProps {
  selectedFolderId: string;
  treeItems: Record<string, CatalogTreeItemData>;
  onNavigate: (folderId: string) => void;
  isSearchMode?: boolean;
  searchQuery?: string;
}

export function CatalogBreadcrumbs({
  selectedFolderId,
  treeItems,
  onNavigate,
  isSearchMode,
  searchQuery,
}: CatalogBreadcrumbsProps) {
  // У пошуку — лише корінь + «Пошук», без шляху поточної папки
  const crumbs = isSearchMode
    ? [
        {
          id: CATALOG_ROOT_ID,
          name: treeItems[CATALOG_ROOT_ID]?.name || 'Каталог',
        },
      ]
    : buildFolderBreadcrumbs(selectedFolderId, treeItems);

  return (
    <Breadcrumbs
      size="sm"
      maxItems={4}
      itemsBeforeCollapse={1}
      itemsAfterCollapse={1}
      classNames={{
        list: 'flex-nowrap',
      }}
      onAction={(key) => {
        const id = String(key);
        if (id && (isSearchMode || id !== selectedFolderId)) {
          onNavigate(id);
        }
      }}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1 && !isSearchMode;
        return (
          <BreadcrumbItem
            key={crumb.id}
            isCurrent={isLast}
            startContent={
              crumb.id === CATALOG_ROOT_ID ? (
                <DynamicIcon name="folder-open-dot" size={12} className="text-default-400" />
              ) : crumb.id === CATALOG_TRASH_ID ? (
                <DynamicIcon name="trash-2" size={12} className="text-danger" />
              ) : undefined
            }
          >
            {crumb.name}
          </BreadcrumbItem>
        );
      })}
      {isSearchMode && (
        <BreadcrumbItem key="search" isCurrent>
          Пошук{searchQuery ? `: «${searchQuery.trim()}»` : ''}
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}
