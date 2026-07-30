import { BreadcrumbItem, Breadcrumbs } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogTreeItemData } from '../ProductsTypes';
import { CATALOG_ROOT_ID } from '../ProductsTypes';
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
  const crumbs = buildFolderBreadcrumbs(selectedFolderId, treeItems);

  return (
    <div className="mb-2 flex min-h-8 items-center gap-2 px-3.5">
      <Breadcrumbs
        size="sm"
        maxItems={6}
        itemsBeforeCollapse={1}
        itemsAfterCollapse={2}
        classNames={{
          list: 'flex-wrap gap-y-1',
        }}
        onAction={(key) => {
          const id = String(key);
          if (id && id !== selectedFolderId) {
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
                  <DynamicIcon name="folder-tree" size={12} className="text-default-400" />
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
    </div>
  );
}
