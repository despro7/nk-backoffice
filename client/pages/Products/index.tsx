import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Tooltip, type SortDescriptor } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import { ToastService } from '@/services/ToastService';
import { ROLES } from '@shared/constants/roles';
import { CatalogTree } from './components/CatalogTree';
import { CatalogTable } from './components/CatalogTable';
import { CatalogToolbar } from './components/CatalogToolbar';
import { CatalogBreadcrumbs } from './components/CatalogBreadcrumbs';
import { CatalogContextMenu, type CatalogContextMenuState } from './components/CatalogContextMenu';
import { CatalogConfirmItemsList } from './components/CatalogConfirmItemsList';
import { ProductDrawer } from './components/ProductDrawer';
import { ArchiveConfirmModal } from './components/ArchiveConfirmModal';
import { MoveToFolderModal } from './components/MoveToFolderModal';
import { TrashDrawer } from './components/TrashDrawer';
import { useProductsCatalog } from './useProductsCatalog';
import { CATALOG_ROOT_ID } from './ProductsTypes';
import {
  estimateBranchRefreshCount,
  isArchiveFolderId,
  isInFinishedProductsBranch,
  predictArchiveFolderName,
  resolveCatalogItemLabels,
  resolveCatalogItemLocation,
} from './ProductsUtils';

const MANUAL_SORT: SortDescriptor = {
  column: 'sortOrder',
  direction: 'ascending',
};

export default function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const catalog = useProductsCatalog();
  const { settings: dilovodSettings } = useDilovodSettings({ loadDirectories: false });
  const pinnedHues = dilovodSettings?.accPolicyColorMap;
  const [contextMenu, setContextMenu] = useState<CatalogContextMenuState | null>(null);
  const [movePickerIds, setMovePickerIds] = useState<string[] | null>(null);
  /** Picker відкрито для відновлення зі смітника (дерево без архівів) */
  const [movePickerFromTrash, setMovePickerFromTrash] = useState(false);
  const [fullRefreshConfirmOpen, setFullRefreshConfirmOpen] = useState(false);
  const [branchRefreshConfirmOpen, setBranchRefreshConfirmOpen] = useState(false);
  const [syncConfirmIds, setSyncConfirmIds] = useState<string[] | null>(null);
  const [legacyUpdateConfirmIds, setLegacyUpdateConfirmIds] = useState<string[] | null>(null);
  const [portionsBySku, setPortionsBySku] = useState<
    Map<string, { newQty: number; confirmedQty: number; holdQty: number }>
  >(new Map());
  const [portionsLoading, setPortionsLoading] = useState(false);
  const [tableSort, setTableSort] = useState<SortDescriptor>(MANUAL_SORT);
  const isManualTableSort =
    !tableSort.column ||
    tableSort.column === 'sortOrder' ||
    String(tableSort.column) === 'sortOrder';

  const isFinishedProductsBranch = useMemo(
    () => isInFinishedProductsBranch(catalog.selectedFolderId, catalog.treeItemsFull),
    [catalog.selectedFolderId, catalog.treeItemsFull]
  );

  useEffect(() => {
    if (!isFinishedProductsBranch) return;
    let cancelled = false;
    setPortionsLoading(true);
    void (async () => {
      try {
        const [resNew, resConf, resHold] = await Promise.all([
          fetch('/api/orders/products/stats?status=1', { credentials: 'include' }),
          fetch('/api/orders/products/stats?status=2', { credentials: 'include' }),
          fetch('/api/orders/products/stats?status=9', { credentials: 'include' }),
        ]);
        const [datNew, datConf, datHold] = await Promise.all([
          resNew.json(),
          resConf.json(),
          resHold.json(),
        ]);
        if (cancelled) return;
        const map = new Map<string, { newQty: number; confirmedQty: number; holdQty: number }>();
        const apply = (
          data: { success?: boolean; data?: Array<{ sku?: string; orderedQuantity?: number }> },
          key: 'newQty' | 'confirmedQty' | 'holdQty'
        ) => {
          if (!data.success || !Array.isArray(data.data)) return;
          for (const item of data.data) {
            if (item.sku && (item.orderedQuantity ?? 0) > 0) {
              const skuKey = String(item.sku).trim().toLowerCase();
              const existing = map.get(skuKey) ?? { newQty: 0, confirmedQty: 0, holdQty: 0 };
              map.set(skuKey, { ...existing, [key]: item.orderedQuantity! });
            }
          }
        };
        apply(datNew, 'newQty');
        apply(datConf, 'confirmedQty');
        apply(datHold, 'holdQty');
        setPortionsBySku(map);
      } catch (err) {
        console.error('[Products] portions stats failed', err);
      } finally {
        if (!cancelled) setPortionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFinishedProductsBranch]);

  const busy =
    catalog.createMutation.isPending ||
    catalog.updateMutation.isPending ||
    catalog.moveMutation.isPending ||
    catalog.reorderMutation.isPending ||
    catalog.archiveMutation.isPending ||
    catalog.restoreMutation.isPending ||
    catalog.trashMutation.isPending ||
    catalog.duplicateMutation.isPending ||
    catalog.refreshBranchMutation.isPending ||
    catalog.syncSelectedMutation.isPending ||
    catalog.legacySyncMutation.isPending ||
    catalog.refreshFullMutation.isPending;

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

  const movePickerLabels = useMemo(
    () =>
      resolveCatalogItemLabels(movePickerIds || [], {
        tableRows: [...catalog.tableRows, ...catalog.trashItems, ...(catalog.detail ? [catalog.detail] : [])],
        treeItems: movePickerFromTrash ? catalog.treeItems : catalog.treeItemsFull,
      }),
    [
      movePickerIds,
      movePickerFromTrash,
      catalog.tableRows,
      catalog.trashItems,
      catalog.detail,
      catalog.treeItems,
      catalog.treeItemsFull,
    ]
  );

  const archiveFolderName = useMemo(
    () => predictArchiveFolderName(selectedLabels, catalog.treeItems),
    [selectedLabels, catalog.treeItems]
  );

  const branchEstimate = useMemo(
    () =>
      estimateBranchRefreshCount(
        catalog.selectedFolderId,
        catalog.treeItemsFull,
        catalog.treeNodes
      ),
    [catalog.selectedFolderId, catalog.treeItemsFull, catalog.treeNodes]
  );

  const syncConfirmLabels = useMemo(
    () =>
      resolveCatalogItemLabels(syncConfirmIds || [], {
        tableRows: catalog.tableRows,
        treeItems: catalog.treeItemsFull,
      }),
    [syncConfirmIds, catalog.tableRows, catalog.treeItemsFull]
  );

  const legacyUpdateLabels = useMemo(
    () =>
      resolveCatalogItemLabels(legacyUpdateConfirmIds || [], {
        tableRows: [
          ...catalog.tableRows,
          ...catalog.trashItems,
          ...(catalog.detail ? [catalog.detail] : []),
        ],
        treeItems: catalog.treeItemsFull,
      }),
    [
      legacyUpdateConfirmIds,
      catalog.tableRows,
      catalog.trashItems,
      catalog.detail,
      catalog.treeItemsFull,
    ]
  );

  const legacyUpdateSkus = useMemo(() => {
    const skus: string[] = [];
    const seen = new Set<string>();
    for (const item of legacyUpdateLabels) {
      if (item.isGroup) continue;
      const sku = item.sku?.trim();
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      skus.push(sku);
    }
    return skus;
  }, [legacyUpdateLabels]);

  const fullRefreshEstimate = useMemo(() => {
    const folders = catalog.treeNodes.length;
    const approx =
      catalog.treeNodes.reduce((sum, n) => sum + (n.childrenCount ?? 0), 0) +
      catalog.treeNodes.filter((n) => !n.parentId || n.parentId === '0').length;
    return { folders, approx };
  }, [catalog.treeNodes]);

  const isInsideArchive = useMemo(
    () => isArchiveFolderId(catalog.selectedFolderId, catalog.treeItemsFull),
    [catalog.selectedFolderId, catalog.treeItemsFull]
  );

  /** За обраними рядками (важливо для пошуку: trash/archive не = поточна папка). */
  const selectionLocation = useMemo(() => {
    const ids = catalog.selectedIds;
    if (ids.length === 0) return 'normal' as const;
    const locs = ids.map((id) => {
      const row =
        catalog.tableRows.find((r) => r.id === id) ||
        catalog.trashItems.find((t) => t.id === id) ||
        (catalog.detail?.id === id ? catalog.detail : null);
      return resolveCatalogItemLocation(row, catalog.treeItemsFull);
    });
    if (locs.every((l) => l === 'trash')) return 'trash' as const;
    if (locs.every((l) => l === 'archive')) return 'archive' as const;
    return 'normal' as const;
  }, [
    catalog.selectedIds,
    catalog.tableRows,
    catalog.trashItems,
    catalog.detail,
    catalog.treeItemsFull,
  ]);

  const selectionInArchive = selectionLocation === 'archive' || isInsideArchive;
  const selectionInTrash = selectionLocation === 'trash';

  const moveTargetIsArchive = useMemo(
    () =>
      Boolean(
        catalog.pendingMove &&
          isArchiveFolderId(catalog.pendingMove.targetParentId, catalog.treeItemsFull)
      ),
    [catalog.pendingMove, catalog.treeItemsFull]
  );

  const moveTargetName =
    catalog.pendingMove?.targetParentId === CATALOG_ROOT_ID
      ? 'Каталог'
      : catalog.treeItems[catalog.pendingMove?.targetParentId || '']?.name ||
        catalog.treeItemsFull[catalog.pendingMove?.targetParentId || '']?.name ||
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

  const openContextMenu = useCallback(
    (e: React.MouseEvent, ids: string[], opts?: { fromTrash?: boolean }) => {
      const unique = [...new Set(ids.filter(Boolean))].filter((id) => id !== CATALOG_ROOT_ID);
      if (unique.length === 0) return;

      const locations = unique.map((id) => {
        const row =
          catalog.tableRows.find((r) => r.id === id) ||
          catalog.trashItems.find((t) => t.id === id) ||
          (catalog.detail?.id === id ? catalog.detail : null);
        return resolveCatalogItemLocation(row, catalog.treeItemsFull);
      });

      const fromTrash =
        opts?.fromTrash ?? (locations.length > 0 && locations.every((l) => l === 'trash'));
      const fromArchive =
        !fromTrash && locations.length > 0 && locations.every((l) => l === 'archive');

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        ids: unique,
        fromTrash,
        fromArchive,
      });
    },
    [catalog.trashItems, catalog.tableRows, catalog.detail, catalog.treeItemsFull]
  );

  const requestMoveTo = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      setMovePickerFromTrash(false);
      setMovePickerIds(ids);
    },
    [catalog.setSelectedIds]
  );

  const requestRestoreFromTrash = useCallback(
    (ids: string[] | string) => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (list.length === 0) return;
      catalog.setTrashOpen(false);
      setMovePickerFromTrash(true);
      setMovePickerIds(list);
    },
    [catalog.setTrashOpen]
  );

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

  const requestRestore = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      catalog.setRestoreConfirmOpen(true);
    },
    [catalog.setSelectedIds, catalog.setRestoreConfirmOpen]
  );

  const requestTrash = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      catalog.setTrashConfirmOpen(true);
    },
    [catalog.setSelectedIds, catalog.setTrashConfirmOpen]
  );

  const requestSyncFromDilovod = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      setSyncConfirmIds(ids);
    },
    [catalog.setSelectedIds]
  );

  const requestLegacyUpdate = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      const labels = resolveCatalogItemLabels(ids, {
        tableRows: [
          ...catalog.tableRows,
          ...catalog.trashItems,
          ...(catalog.detail ? [catalog.detail] : []),
        ],
        treeItems: catalog.treeItemsFull,
      });
      const skus = labels
        .filter((l) => !l.isGroup && l.sku?.trim())
        .map((l) => l.sku!.trim());
      if (skus.length === 0) {
        ToastService.show({
          title: 'Немає SKU для Legacy Update',
          description: 'Оберіть товари з артикулом (папки та елементи без SKU пропускаються).',
          color: 'warning',
        });
        return;
      }
      setLegacyUpdateConfirmIds(ids);
    },
    [
      catalog.setSelectedIds,
      catalog.tableRows,
      catalog.trashItems,
      catalog.detail,
      catalog.treeItemsFull,
    ]
  );

  const folderIdForBranch =
    catalog.selectedFolderId === CATALOG_ROOT_ID ? null : catalog.selectedFolderId;

  const catalogSearch = useCallback(
    async (q: string, opts?: { underFolderName?: string }) => {
      const params = new URLSearchParams({ q });
      if (opts?.underFolderName) {
        params.set('underFolderName', opts.underFolderName);
      }
      const res = await fetch(`/api/catalog/search?${params.toString()}`, {
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
    },
    []
  );

  const parentForCreate =
    catalog.selectedFolderId === CATALOG_ROOT_ID
      ? CATALOG_ROOT_ID
      : catalog.selectedFolderId;

  const parentFolderName =
    parentForCreate === CATALOG_ROOT_ID
      ? catalog.treeItems[CATALOG_ROOT_ID]?.name || 'Каталог'
      : catalog.treeItemsFull[parentForCreate]?.name ||
        catalog.treeItems[parentForCreate]?.name ||
        null;

  return (
    <div className="flex flex-col gap-5 flex-1">
      <CatalogToolbar
        searchQuery={catalog.searchQuery}
        onSearchChange={catalog.setSearchQuery}
        selectedCount={catalog.selectedIds.length}
        branchRefreshing={catalog.refreshBranchMutation.isPending}
        syncingSelected={catalog.syncSelectedMutation.isPending}
        fullRefreshing={catalog.refreshFullMutation.isPending}
        onRefreshBranch={() => setBranchRefreshConfirmOpen(true)}
        onSyncSelected={() => requestSyncFromDilovod(catalog.selectedIds)}
        onLegacyUpdate={() => requestLegacyUpdate(catalog.selectedIds)}
        legacyUpdating={catalog.legacySyncMutation.isPending}
        showFullRefresh={isAdmin}
        onFullRefresh={() => setFullRefreshConfirmOpen(true)}
        onCreateGood={() => catalog.openCreate(false)}
        onDuplicate={() => requestDuplicate(catalog.selectedIds)}
        isInsideArchive={selectionInArchive}
        onArchive={() => requestArchive(catalog.selectedIds)}
        onRestore={() => requestRestore(catalog.selectedIds)}
        isInsideTrash={selectionInTrash}
        onTrash={() => requestTrash(catalog.selectedIds)}
        onRestoreFromTrash={() => requestRestoreFromTrash(catalog.selectedIds)}
        onOpenTrash={() => catalog.setTrashOpen(true)}
        busy={busy}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-[280px_1fr]">
        <aside className="min-h-0">
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
              onReorder={catalog.requestReorder}
              onContextMenu={openContextMenu}
            />
          )}
        </aside>

        <main className="min-h-0 overflow-auto rounded-lg border border-default-200 bg-content1 p-2">
          <div className="mb-2 flex min-h-8 items-center justify-between gap-2 px-3.5">
            <CatalogBreadcrumbs
              selectedFolderId={catalog.selectedFolderId}
              treeItems={catalog.treeItems}
              onNavigate={navigateToFolder}
              isSearchMode={catalog.isSearchMode}
              searchQuery={catalog.searchQuery}
            />
            {!isManualTableSort && (
              <Tooltip content="Скинути на ручне сортування" placement="bottom" delay={200}>
                <Button
                  size="sm"
                  variant="flat"
                  className="min-w-0 h-7 px-2 shrink-0"
                  aria-label="Скинути сортування"
                  startContent={<DynamicIcon name="list-ordered" size={14} />}
                  onPress={() => setTableSort(MANUAL_SORT)}
                >
                  Ручний порядок
                </Button>
              </Tooltip>
            )}
          </div>
          <CatalogTable
            rows={catalog.tableRows}
            loading={catalog.tableLoading}
            selectedIds={catalog.selectedIds}
            onSelectionChange={catalog.setSelectedIds}
            onOpenFolder={navigateToFolder}
            onEdit={catalog.openEdit}
            onContextMenu={openContextMenu}
            isSearchMode={catalog.isSearchMode}
            accPolicies={catalog.dictionaries.accPolicies}
            pinnedHues={pinnedHues}
            isFinishedProductsBranch={isFinishedProductsBranch}
            isAdmin={isAdmin}
            portionsBySku={portionsBySku}
            portionsLoading={portionsLoading}
            sortDescriptor={tableSort}
            onSortChange={setTableSort}
            onReorderGood={
              catalog.isSearchMode
                ? undefined
                : (params) => {
                    setTableSort(MANUAL_SORT);
                    catalog.requestReorder({
                      parentId:
                        catalog.selectedFolderId === CATALOG_ROOT_ID
                          ? null
                          : catalog.selectedFolderId,
                      ...params,
                    });
                  }
            }
          />
        </main>
      </div>

      <CatalogContextMenu
        state={contextMenu}
        busy={busy}
        isInsideArchive={isInsideArchive}
        onClose={() => setContextMenu(null)}
        onSyncFromDilovod={requestSyncFromDilovod}
        onLegacyUpdate={requestLegacyUpdate}
        onMoveTo={(ids) => {
          if (contextMenu?.fromTrash) requestRestoreFromTrash(ids);
          else requestMoveTo(ids);
        }}
        onDuplicate={requestDuplicate}
        onArchive={requestArchive}
        onRestore={requestRestore}
        onTrash={requestTrash}
        onRestoreFromTrash={requestRestoreFromTrash}
      />

      <ProductDrawer
        mode={catalog.drawerMode}
        parentFolderId={parentForCreate}
        parentFolderName={parentFolderName}
        detail={catalog.detail}
        detailLoading={catalog.detailLoading}
        dictionaries={catalog.dictionaries}
        saving={catalog.createMutation.isPending || catalog.updateMutation.isPending}
        onClose={catalog.closeDrawer}
        onCreate={(input) => catalog.createMutation.mutateAsync(input)}
        onUpdate={(id, input) => catalog.updateMutation.mutateAsync({ id, input })}
        onRestore={(id) => requestRestoreFromTrash(id)}
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
        onRestore={(id) => requestRestoreFromTrash(id)}
        onContextMenu={(e, ids) => openContextMenu(e, ids, { fromTrash: true })}
      />

      <MoveToFolderModal
        isOpen={Boolean(movePickerIds?.length)}
        items={movePickerLabels}
        treeItems={movePickerFromTrash ? catalog.treeItems : catalog.treeItemsFull}
        loading={catalog.moveMutation.isPending}
        isRestore={movePickerFromTrash}
        onClose={() => {
          setMovePickerIds(null);
          setMovePickerFromTrash(false);
        }}
        onConfirm={(targetParentId) => {
          if (!movePickerIds?.length) return;
          const fromTrash = movePickerFromTrash;
          catalog.moveMutation.mutate(
            { ids: movePickerIds, targetParentId },
            {
              onSuccess: () => {
                setMovePickerIds(null);
                setMovePickerFromTrash(false);
                if (fromTrash) catalog.closeDrawer();
              },
            }
          );
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
        isOpen={branchRefreshConfirmOpen}
        title="Синхронізувати гілку з Dilovod?"
        message={
          <div className="space-y-1">
            <p>
              Буде синхронізовано структуру папки <b>«{branchEstimate.folderName}»</b> та всіх
              вкладених рівнів.
            </p>
            <p className="text-default-400 text-sm mt-2">
              За локальним дзеркалом: ≈{branchEstimate.approxRecords} записів у межах{' '}
              {branchEstimate.folderCount}{' '}
              {branchEstimate.folderCount === 1 ? 'папки' : 'папок'}. Фактична кількість
              може відрізнятися, якщо в Dilovod з’явились нові елементи.
            </p>
          </div>
        }
        confirmText="Синхронізувати гілку"
        confirmColor="primary"
        cancelText="Скасувати"
        confirmLoading={catalog.refreshBranchMutation.isPending}
        onCancel={() => setBranchRefreshConfirmOpen(false)}
        onConfirm={() => {
          setBranchRefreshConfirmOpen(false);
          catalog.refreshBranchMutation.mutate(folderIdForBranch);
        }}
      />

      <ConfirmModal
        isOpen={Boolean(syncConfirmIds?.length)}
        title="Синхронізувати з Діловодом?"
        message={
          <div className="space-y-1">
            <p>
              Буде оновлено {syncConfirmLabels.length} елемент
              {syncConfirmLabels.length === 1 ? '' : 'и'} з Dilovod (header, ціни,
              штрихкоди). Для папок — лише рядок папки, без дітей.
            </p>
            <CatalogConfirmItemsList items={syncConfirmLabels} />
          </div>
        }
        confirmText="Синхронізувати"
        confirmColor="primary"
        cancelText="Скасувати"
        confirmLoading={catalog.syncSelectedMutation.isPending}
        onCancel={() => setSyncConfirmIds(null)}
        onConfirm={() => {
          const ids = syncConfirmIds;
          setSyncConfirmIds(null);
          if (ids?.length) catalog.syncSelectedMutation.mutate(ids);
        }}
      />

      <ConfirmModal
        isOpen={Boolean(legacyUpdateConfirmIds?.length)}
        title="Legacy Update?"
        message={
          <div className="space-y-1">
            <p>
              Обрані товари буде синхронізовано в legacy таблицю{' '}
              <b>products</b> через Dilovod (<code>sync-manual</code>,{' '}
              <b>force</b>): set, ціни, штрихкод, hash, вага (з категорії) —
              навіть якщо хеш не змінився.
            </p>
            <p className="text-default-500 text-sm">
              SKU до оновлення: {legacyUpdateSkus.length}
              {legacyUpdateLabels.length > legacyUpdateSkus.length
                ? ` (пропущено ${legacyUpdateLabels.length - legacyUpdateSkus.length} без SKU / папок)`
                : ''}
              .
            </p>
            <CatalogConfirmItemsList
              items={legacyUpdateLabels.filter((l) => !l.isGroup && l.sku?.trim())}
            />
          </div>
        }
        confirmText="Legacy Update"
        confirmColor="warning"
        cancelText="Скасувати"
        confirmLoading={catalog.legacySyncMutation.isPending}
        onCancel={() => setLegacyUpdateConfirmIds(null)}
        onConfirm={() => {
          const skus = legacyUpdateSkus;
          setLegacyUpdateConfirmIds(null);
          if (skus.length) catalog.legacySyncMutation.mutate(skus);
        }}
      />

      <ConfirmModal
        isOpen={fullRefreshConfirmOpen}
        title="Повний refresh з Dilovod?"
        message={
          <div className="space-y-1">
            <p>
              Буде завантажено весь каталог разом із цінами та штрихкодами. Операція може зайняти кілька хвилин!
            </p>
            {fullRefreshEstimate.folders > 0 && fullRefreshEstimate.approx > 0 && (
              <p className="text-default-500">
                За локальним дзеркалом: {fullRefreshEstimate.folders} папок (≈{fullRefreshEstimate.approx} записів).
              </p>
            )}
          </div>
        }
        confirmText="Запустити"
        confirmColor="danger"
        cancelText="Скасувати"
        confirmLoading={catalog.refreshFullMutation.isPending}
        onCancel={() => setFullRefreshConfirmOpen(false)}
        onConfirm={() => {
          setFullRefreshConfirmOpen(false);
          catalog.refreshFullMutation.mutate();
        }}
      />

      <ConfirmModal
        isOpen={catalog.restoreConfirmOpen}
        title="Відновити з архіву?"
        message={
          <div className="space-y-1">
            <p>
              Елементи ({selectedLabels.length}) буде переміщено в батьківську папку
              архіву.
            </p>
            <CatalogConfirmItemsList items={selectedLabels} />
          </div>
        }
        confirmText="Відновити"
        confirmColor="success"
        cancelText="Скасувати"
        confirmLoading={catalog.restoreMutation.isPending}
        onCancel={() => catalog.setRestoreConfirmOpen(false)}
        onConfirm={() => catalog.restoreMutation.mutate(catalog.selectedIds)}
      />

      <ConfirmModal
        isOpen={catalog.trashConfirmOpen}
        title="Перемістити у смітник?"
        message={
          <div className="space-y-1">
            <p>{selectedLabels.length} елемент(ів) буде переміщено в смітник.</p>
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
              {moveTargetIsArchive ? ' Ціль — архівна папка.' : ''}
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
