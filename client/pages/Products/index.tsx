import { useCallback, useMemo, useState } from 'react';
import { Spinner } from '@heroui/react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { CatalogTree } from './components/CatalogTree';
import { CatalogTable } from './components/CatalogTable';
import { CatalogToolbar } from './components/CatalogToolbar';
import { CatalogBreadcrumbs } from './components/CatalogBreadcrumbs';
import { CatalogContextMenu, type CatalogContextMenuState } from './components/CatalogContextMenu';
import { CatalogConfirmItemsList } from './components/CatalogConfirmItemsList';
import { ProductDrawer } from './components/ProductDrawer';
import { ArchiveConfirmModal } from './components/ArchiveConfirmModal';
import { TrashDrawer } from './components/TrashDrawer';
import { useProductsCatalog } from './useProductsCatalog';
import { CATALOG_ROOT_ID } from './ProductsTypes';
import {
  predictArchiveFolderName,
  resolveCatalogItemLabels,
} from './ProductsUtils';

export default function ProductsPage() {
  const catalog = useProductsCatalog();
  const [contextMenu, setContextMenu] = useState<CatalogContextMenuState | null>(null);

  const busy =
    catalog.createMutation.isPending ||
    catalog.updateMutation.isPending ||
    catalog.moveMutation.isPending ||
    catalog.archiveMutation.isPending ||
    catalog.trashMutation.isPending ||
    catalog.duplicateMutation.isPending ||
    catalog.refreshMutation.isPending;

  const selectedLabels = useMemo(
    () =>
      resolveCatalogItemLabels(catalog.selectedIds, {
        tableRows: catalog.tableRows,
        treeItems: catalog.treeItems,
      }),
    [catalog.selectedIds, catalog.tableRows, catalog.treeItems]
  );

  const moveLabels = useMemo(
    () =>
      resolveCatalogItemLabels(catalog.pendingMove?.ids || [], {
        tableRows: catalog.tableRows,
        treeItems: catalog.treeItems,
      }),
    [catalog.pendingMove?.ids, catalog.tableRows, catalog.treeItems]
  );

  const archiveFolderName = useMemo(
    () => predictArchiveFolderName(selectedLabels, catalog.treeItems),
    [selectedLabels, catalog.treeItems]
  );

  const moveTargetName =
    catalog.pendingMove?.targetParentId === CATALOG_ROOT_ID
      ? 'Каталог'
      : catalog.treeItems[catalog.pendingMove?.targetParentId || '']?.name ||
        'обрану папку';

  const duplicateItem = selectedLabels[0];

  const navigateToFolder = useCallback(
    (id: string) => {
      catalog.setSelectedFolderId(id);
      catalog.setSelectedIds([]);
      catalog.setSearchQuery('');
    },
    [catalog.setSelectedFolderId, catalog.setSelectedIds, catalog.setSearchQuery]
  );

  const openContextMenu = useCallback((e: React.MouseEvent, ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))].filter((id) => id !== CATALOG_ROOT_ID);
    if (unique.length === 0) return;
    setContextMenu({ x: e.clientX, y: e.clientY, ids: unique });
  }, []);

  const requestDuplicate = useCallback(
    (ids: string[]) => {
      if (ids.length !== 1) return;
      catalog.setSelectedIds(ids);
      catalog.setDuplicateConfirmOpen(true);
    },
    [catalog.setSelectedIds, catalog.setDuplicateConfirmOpen]
  );

  const requestArchive = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      catalog.setArchiveConfirmOpen(true);
    },
    [catalog.setSelectedIds, catalog.setArchiveConfirmOpen]
  );

  const requestTrash = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      catalog.setTrashConfirmOpen(true);
    },
    [catalog.setSelectedIds, catalog.setTrashConfirmOpen]
  );

  const catalogSearch = useCallback(async (q: string) => {
    const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`, {
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok || json?.success === false) return [];
    return (json.data || [])
      .filter((r: { isGroup?: boolean }) => !r.isGroup)
      .map((r: { id: string; name: string; sku: string | null }) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
      }));
  }, []);

  const parentForCreate =
    catalog.selectedFolderId === CATALOG_ROOT_ID
      ? CATALOG_ROOT_ID
      : catalog.selectedFolderId;

  return (
    <div className="flex flex-col gap-5 flex-1">
      <CatalogToolbar
        searchQuery={catalog.searchQuery}
        onSearchChange={catalog.setSearchQuery}
        selectedCount={catalog.selectedIds.length}
        refreshing={catalog.refreshMutation.isPending}
        onRefresh={() => catalog.refreshMutation.mutate(undefined)}
        onCreateGood={() => catalog.openCreate(false)}
        onCreateFolder={() => catalog.openCreate(true)}
        onDuplicate={() => requestDuplicate(catalog.selectedIds)}
        onArchive={() => requestArchive(catalog.selectedIds)}
        onTrash={() => requestTrash(catalog.selectedIds)}
        onOpenTrash={() => catalog.setTrashOpen(true)}
        busy={busy}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-[280px_1fr]">
        <aside className="min-h-0 pt-2">
          {catalog.treeLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : (
            <CatalogTree
              key={Object.keys(catalog.treeItems).join(',').slice(0, 200)}
              items={catalog.treeItems}
              selectedFolderId={catalog.selectedFolderId}
              onSelectFolder={navigateToFolder}
              onMove={catalog.requestMove}
              onContextMenu={openContextMenu}
            />
          )}
        </aside>

        <main className="min-h-0 overflow-auto rounded-lg border border-default-200 bg-content1 p-2">
          <CatalogBreadcrumbs
            selectedFolderId={catalog.selectedFolderId}
            treeItems={catalog.treeItems}
            onNavigate={navigateToFolder}
            isSearchMode={catalog.isSearchMode}
            searchQuery={catalog.searchQuery}
          />
          <CatalogTable
            rows={catalog.tableRows}
            loading={catalog.tableLoading}
            selectedIds={catalog.selectedIds}
            onSelectionChange={catalog.setSelectedIds}
            onOpenFolder={navigateToFolder}
            onEdit={catalog.openEdit}
            onContextMenu={openContextMenu}
            isSearchMode={catalog.isSearchMode}
          />
        </main>
      </div>

      <CatalogContextMenu
        state={contextMenu}
        busy={busy}
        onClose={() => setContextMenu(null)}
        onDuplicate={requestDuplicate}
        onArchive={requestArchive}
        onTrash={requestTrash}
      />

      <ProductDrawer
        mode={catalog.drawerMode}
        parentFolderId={parentForCreate}
        detail={catalog.detail}
        detailLoading={catalog.detailLoading}
        units={catalog.units}
        saving={catalog.createMutation.isPending || catalog.updateMutation.isPending}
        onClose={catalog.closeDrawer}
        onCreate={(input) => catalog.createMutation.mutate(input)}
        onUpdate={(id, input) => catalog.updateMutation.mutate({ id, input })}
        catalogSearch={catalogSearch}
      />

      <TrashDrawer
        isOpen={catalog.trashOpen}
        loading={catalog.trashLoading}
        items={catalog.trashItems}
        onClose={() => catalog.setTrashOpen(false)}
        onOpenItem={(id) => {
          catalog.setTrashOpen(false);
          catalog.openEdit(id);
        }}
      />

      <ArchiveConfirmModal
        isOpen={catalog.archiveConfirmOpen}
        items={selectedLabels}
        archiveFolderName={archiveFolderName}
        loading={catalog.archiveMutation.isPending}
        onClose={() => catalog.setArchiveConfirmOpen(false)}
        onConfirm={() => catalog.archiveMutation.mutate(catalog.selectedIds)}
      />

      <ConfirmModal
        isOpen={catalog.trashConfirmOpen}
        title="Перемістити у смітник?"
        message={
          <div className="space-y-1">
            <p>
              Елементи ({selectedLabels.length}) буде позначено як видалені в Dilovod
              і переміщено в смітник. Відновлення з UI поки не підтримується.
            </p>
            <CatalogConfirmItemsList items={selectedLabels} />
          </div>
        }
        confirmText="У смітник"
        confirmColor="danger"
        cancelText="Скасувати"
        confirmLoading={catalog.trashMutation.isPending}
        onCancel={() => catalog.setTrashConfirmOpen(false)}
        onConfirm={() => catalog.trashMutation.mutate(catalog.selectedIds)}
      />

      <ConfirmModal
        isOpen={catalog.duplicateConfirmOpen}
        title="Дублювати елемент?"
        message={
          <div className="space-y-1">
            <p>
              Буде створено копію
              {duplicateItem ? (
                <>
                  {' '}
                  «{duplicateItem.name}»
                  {duplicateItem.sku ? ` (${duplicateItem.sku})` : ''}
                </>
              ) : null}{' '}
              з новим SKU. Штрихкоди скопіюються лише якщо вони вільні.
            </p>
            {duplicateItem && <CatalogConfirmItemsList items={[duplicateItem]} />}
          </div>
        }
        confirmText="Дублювати"
        confirmColor="primary"
        cancelText="Скасувати"
        confirmLoading={catalog.duplicateMutation.isPending}
        onCancel={() => catalog.setDuplicateConfirmOpen(false)}
        onConfirm={() => {
          if (catalog.selectedIds.length === 1) {
            catalog.duplicateMutation.mutate(catalog.selectedIds[0]);
          }
        }}
      />

      <ConfirmModal
        isOpen={Boolean(catalog.pendingMove)}
        title="Перемістити елементи?"
        message={
          <div className="space-y-1">
            <p>
              Перемістити {moveLabels.length} елемент(ів) у папку «{moveTargetName}»?
              Зміниться лише батьківська папка (порядок у дереві не змінюється).
            </p>
            <CatalogConfirmItemsList items={moveLabels} />
          </div>
        }
        confirmText="Перемістити"
        confirmColor="primary"
        cancelText="Скасувати"
        confirmLoading={catalog.moveMutation.isPending}
        onCancel={() => catalog.setPendingMove(null)}
        onConfirm={() => {
          if (catalog.pendingMove) {
            catalog.moveMutation.mutate(catalog.pendingMove);
          }
        }}
      />
    </div>
  );
}
