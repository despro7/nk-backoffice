import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner, Tooltip, type SortDescriptor } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import { ToastService } from '@/services/ToastService';
import { CatalogTree } from './components/CatalogTree';
import { CatalogTreeBubble } from './components/CatalogTreeBubble';
import { CatalogTable } from './components/CatalogTable';
import { CatalogToolbar } from './components/CatalogToolbar';
import { CatalogActionsDropdown } from './components/CatalogActionsMenu';
import { CatalogSyncOverlay, type CatalogSyncOp } from './components/CatalogSyncOverlay';
import { CatalogSyncReportModal, type CatalogSyncReport } from './components/CatalogSyncReportModal';
import { CatalogBreadcrumbs } from './components/CatalogBreadcrumbs';
import { CatalogContextMenu, type CatalogContextMenuState } from './components/CatalogContextMenu';
import { CatalogConfirmItemsList } from './components/CatalogConfirmItemsList';
import { ProductDrawer } from './components/productDrawer/ProductDrawer';
import { ArchiveConfirmModal } from './components/ArchiveConfirmModal';
import { MoveToFolderModal } from './components/MoveToFolderModal';
import { ChangeObjectTypeModal } from './components/ChangeObjectTypeModal';
import { useProductsCatalog } from './useProductsCatalog';
import { CATALOG_ROOT_ID, CATALOG_TRASH_ID, type CatalogGoodDto } from './ProductsTypes';
import {
  estimateBranchRefreshCount,
  isArchiveFolderId,
  isInFinishedProductsBranch,
  predictArchiveFolderName,
  resolveCatalogItemLabels,
  resolveCatalogItemLocation,
} from './ProductsUtils';
import {
  ProductOrdersModal,
  type ProductOrderRow,
} from '@/components/modals/ProductOrdersModal';
import type { CatalogOrdersTabKey } from './components/CatalogTable';
import { pluralize } from '@/lib/formatUtils';
import { useIsMobile } from '@/hooks/use-mobile';

const MANUAL_SORT: SortDescriptor = {
  column: 'sortOrder',
  direction: 'ascending',
};

export default function ProductsPage() {
  const { isAdminView: isAdmin } = useRolePreview();
  const catalog = useProductsCatalog();
  const { settings: dilovodSettings } = useDilovodSettings({ loadDirectories: false });
  const pinnedHues = dilovodSettings?.accPolicyColorMap;
  const [contextMenu, setContextMenu] = useState<CatalogContextMenuState | null>(null);
  const [movePickerIds, setMovePickerIds] = useState<string[] | null>(null);
  /** Picker відкрито для відновлення зі смітника (дерево без архівів) */
  const [movePickerFromTrash, setMovePickerFromTrash] = useState(false);
  const [changeTypeIds, setChangeTypeIds] = useState<string[] | null>(null);
  const [fullRefreshConfirmOpen, setFullRefreshConfirmOpen] = useState(false);
  const [branchRefreshConfirmOpen, setBranchRefreshConfirmOpen] = useState(false);
  const [stockRefreshConfirmOpen, setStockRefreshConfirmOpen] = useState(false);
  const [syncReport, setSyncReport] = useState<CatalogSyncReport | null>(null);
  const syncStartedAtRef = useRef(0);
  const [syncConfirmIds, setSyncConfirmIds] = useState<string[] | null>(null);
  const [legacyUpdateConfirmIds, setLegacyUpdateConfirmIds] = useState<string[] | null>(null);
  const [portionsBySku, setPortionsBySku] = useState<
    Map<string, { newQty: number; confirmedQty: number; holdQty: number }>
  >(new Map());
  const [portionsLoading, setPortionsLoading] = useState(false);
  const [tableSort, setTableSort] = useState<SortDescriptor>(MANUAL_SORT);
  const [listSortEnabled, setListSortEnabled] = useState(false);
  const [ordersModalProduct, setOrdersModalProduct] = useState<{
    name: string;
    sku: string;
  } | null>(null);
  const [ordersModalTab, setOrdersModalTab] = useState<CatalogOrdersTabKey>('all');
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [ordersModalLoading, setOrdersModalLoading] = useState(false);
  const [ordersModalOrders, setOrdersModalOrders] = useState<ProductOrderRow[]>([]);
  const isMobile = useIsMobile();
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const isManualTableSort =
    !tableSort.column ||
    tableSort.column === 'sortOrder' ||
    String(tableSort.column) === 'sortOrder';
  const listSortActive =
    isManualTableSort && (listSortEnabled || catalog.selectedIds.length > 0);

  const activeSyncOp: CatalogSyncOp | null = catalog.refreshBranchMutation.isPending
    ? 'branch'
    : catalog.stockSyncMutation.isPending
      ? 'stock'
      : null;

  const syncDurationSec = () =>
    Math.max(0, Math.round((Date.now() - syncStartedAtRef.current) / 1000));

  const isFinishedProductsBranch = useMemo(
    () => isInFinishedProductsBranch(catalog.selectedFolderId, catalog.treeItemsFull),
    [catalog.selectedFolderId, catalog.treeItemsFull]
  );

  useEffect(() => {
    if (!isFinishedProductsBranch && !catalog.isSearchMode) return;
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
  }, [isFinishedProductsBranch, catalog.isSearchMode]);

  useEffect(() => {
    if (!ordersModalOpen || !ordersModalProduct?.sku) return;
    let cancelled = false;
    setOrdersModalLoading(true);
    setOrdersModalOrders([]);
    void (async () => {
      try {
        const params = new URLSearchParams({
          sku: ordersModalProduct.sku,
          status: '1,2,9',
        });
        const res = await fetch(`/api/orders/products/orders?${params.toString()}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          setOrdersModalOrders(json.data as ProductOrderRow[]);
        } else {
          setOrdersModalOrders([]);
        }
      } catch (err) {
        console.error('[Products] product orders failed', err);
        if (!cancelled) {
          ToastService.show({
            title: 'Помилка',
            description: 'Не вдалося завантажити список замовлень.',
            color: 'danger',
          });
        }
      } finally {
        if (!cancelled) setOrdersModalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ordersModalOpen, ordersModalProduct?.sku]);

  const busy =
    catalog.createMutation.isPending ||
    catalog.updateMutation.isPending ||
    catalog.moveMutation.isPending ||
    catalog.changeTypeMutation.isPending ||
    catalog.reorderMutation.isPending ||
    catalog.archiveMutation.isPending ||
    catalog.restoreMutation.isPending ||
    catalog.trashMutation.isPending ||
    catalog.duplicateMutation.isPending ||
    catalog.refreshBranchMutation.isPending ||
    catalog.syncSelectedMutation.isPending ||
    catalog.legacySyncMutation.isPending ||
    catalog.stockSyncMutation.isPending ||
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
        tableRows: [...catalog.tableRows, ...(catalog.detail ? [catalog.detail] : [])],
        treeItems: movePickerFromTrash ? catalog.treeItems : catalog.treeItemsFull,
      }),
    [
      movePickerIds,
      movePickerFromTrash,
      catalog.tableRows,
      catalog.detail,
      catalog.treeItems,
      catalog.treeItemsFull,
    ]
  );

  const changeTypeLabels = useMemo(
    () =>
      resolveCatalogItemLabels(changeTypeIds || [], {
        tableRows: [...catalog.tableRows, ...(catalog.detail ? [catalog.detail] : [])],
        treeItems: catalog.treeItemsFull,
      }),
    [changeTypeIds, catalog.tableRows, catalog.detail, catalog.treeItemsFull]
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
          ...(catalog.detail ? [catalog.detail] : []),
        ],
        treeItems: catalog.treeItemsFull,
      }),
    [
      legacyUpdateConfirmIds,
      catalog.tableRows,
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
        (catalog.detail?.id === id ? catalog.detail : null);
      return resolveCatalogItemLocation(row, catalog.treeItemsFull);
    });
    if (locs.every((l) => l === 'trash')) return 'trash' as const;
    if (locs.every((l) => l === 'archive')) return 'archive' as const;
    return 'normal' as const;
  }, [
    catalog.selectedIds,
    catalog.tableRows,
    catalog.detail,
    catalog.treeItemsFull,
  ]);

  const selectionInArchive = selectionLocation === 'archive' || isInsideArchive;
  const selectionInTrash =
    selectionLocation === 'trash' || catalog.selectedFolderId === CATALOG_TRASH_ID;

  const selectedGroupsOnly = useMemo(() => {
    const ids = catalog.selectedIds;
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const row =
        catalog.tableRows.find((r) => r.id === id) ||
        (catalog.detail?.id === id ? catalog.detail : null);
      if (row) return Boolean(row.isGroup);
      return Boolean(catalog.treeItemsFull[id]?.isGroup);
    });
  }, [catalog.selectedIds, catalog.tableRows, catalog.detail, catalog.treeItemsFull]);

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
      setMobileTreeOpen(false);
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
          (catalog.detail?.id === id ? catalog.detail : null);
        return resolveCatalogItemLocation(row, catalog.treeItemsFull);
      });

      const fromTrash =
        opts?.fromTrash ?? (locations.length > 0 && locations.every((l) => l === 'trash'));
      const fromArchive =
        !fromTrash && locations.length > 0 && locations.every((l) => l === 'archive');

      const groupsOnly = unique.every((id) => {
        const row =
          catalog.tableRows.find((r) => r.id === id) ||
          (catalog.detail?.id === id ? catalog.detail : null);
        if (row) return Boolean(row.isGroup);
        return Boolean(catalog.treeItemsFull[id]?.isGroup);
      });

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        ids: unique,
        fromTrash,
        fromArchive,
        groupsOnly,
      });
    },
    [catalog.tableRows, catalog.detail, catalog.treeItemsFull]
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

  const requestChangeType = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      catalog.setSelectedIds(ids);
      setChangeTypeIds(ids);
    },
    [catalog.setSelectedIds]
  );

  const requestRestoreFromTrash = useCallback(
    (ids: string[] | string) => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (list.length === 0) return;
      setMovePickerFromTrash(true);
      setMovePickerIds(list);
    },
    []
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
          ...(catalog.detail ? [catalog.detail] : []),
        ],
        treeItems: catalog.treeItemsFull,
      });
      const skus = labels
        .filter((l) => !l.isGroup && l.sku?.trim())
        .map((l) => l.sku!.trim());
      if (skus.length === 0) {
        ToastService.show({
          title: 'Немає SKU для синхронізації товарів',
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
      catalog.detail,
      catalog.treeItemsFull,
    ]
  );

  const openProductOrders = useCallback(
    (row: CatalogGoodDto, tab: CatalogOrdersTabKey) => {
      const sku = row.sku?.trim();
      if (!sku) return;
      setOrdersModalProduct({ name: row.name, sku });
      setOrdersModalTab(tab);
      setOrdersModalOpen(true);
    },
    []
  );

  const navigableOrderProducts = useMemo(
    () =>
      catalog.tableRows
        .filter((row) => !row.isGroup && row.sku?.trim())
        .map((row) => ({ name: row.name, sku: row.sku!.trim() })),
    [catalog.tableRows]
  );

  const ordersByStatus = useCallback(
    (status: string) =>
      ordersModalOrders.filter((order) => String(order.status) === status),
    [ordersModalOrders]
  );

  const productOrdersTabs = useMemo(
    () => [
      {
        key: 'all',
        label: 'Всі',
        icon: 'list' as const,
        orders: ordersModalOrders,
        quantityField: 'productQuantity' as const,
      },
      {
        key: 'new',
        label: 'Нові',
        icon: 'sparkles' as const,
        activeClassName: 'border-blue-600 text-blue-600',
        badgeClassName: 'bg-blue-200/40 text-blue-900/75',
        orders: ordersByStatus('1'),
        quantityField: 'productQuantity' as const,
      },
      {
        key: 'confirmed',
        label: 'Підтверджені',
        icon: 'check' as const,
        activeClassName: 'border-green-600 text-green-600',
        badgeClassName: 'bg-green-200/40 text-green-900/75',
        orders: ordersByStatus('2'),
        quantityField: 'productQuantity' as const,
      },
      {
        key: 'hold',
        label: 'На утриманні',
        icon: 'pause' as const,
        activeClassName: 'border-amber-600 text-amber-600',
        badgeClassName: 'bg-amber-200/40 text-amber-800/80',
        orders: ordersByStatus('9'),
        quantityField: 'productQuantity' as const,
      },
    ],
    [ordersModalOrders, ordersByStatus]
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
        .map((r: { id: string; name: string; sku: string | null; weight?: number | null; accPolicyId?: string | null }) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          weight: r.weight ?? null,
          accPolicyId: r.accPolicyId ?? null,
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
        branchRefreshing={catalog.refreshBranchMutation.isPending}
        stockRefreshing={catalog.stockSyncMutation.isPending}
        fullRefreshing={catalog.refreshFullMutation.isPending}
        onRefreshBranch={() => setBranchRefreshConfirmOpen(true)}
        onRefreshStock={() => setStockRefreshConfirmOpen(true)}
        showFullRefresh={isAdmin}
        onFullRefresh={() => setFullRefreshConfirmOpen(true)}
        onCreateGood={() => catalog.openCreate(false)}
        busy={busy}
        actions={
          <CatalogActionsDropdown
            ids={catalog.selectedIds}
            busy={busy}
            fromTrash={selectionInTrash}
            fromArchive={selectionInArchive}
            groupsOnly={selectedGroupsOnly}
            onEdit={catalog.openEdit}
            onSyncFromDilovod={requestSyncFromDilovod}
            onLegacyUpdate={requestLegacyUpdate}
            onMoveTo={(ids) => {
              if (selectionInTrash) requestRestoreFromTrash(ids);
              else requestMoveTo(ids);
            }}
            onChangeType={requestChangeType}
            onDuplicate={requestDuplicate}
            onArchive={requestArchive}
            onRestore={requestRestore}
            onTrash={requestTrash}
            onRestoreFromTrash={requestRestoreFromTrash}
            onCreateGood={() => catalog.openCreate(false)}
            onRefreshBranch={() => setBranchRefreshConfirmOpen(true)}
            branchRefreshing={catalog.refreshBranchMutation.isPending}
            onRefreshStock={() => setStockRefreshConfirmOpen(true)}
            stockRefreshing={catalog.stockSyncMutation.isPending}
            showFullRefresh={isAdmin}
            onFullRefresh={() => setFullRefreshConfirmOpen(true)}
            fullRefreshing={catalog.refreshFullMutation.isPending}
            listSortEnabled={listSortActive}
            listSortDisabled={!isManualTableSort}
            onListSortToggle={() => setListSortEnabled((v) => !v)}
          />
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-[280px_1fr]">
        {!isMobile && (
          <aside className="min-h-0 hidden md:block">
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
        )}

        <main className="relative min-h-0 self-start overflow-auto rounded-lg border border-default-200 bg-content1 p-2">
          {activeSyncOp ? (
            <div className="sticky top-0 z-20 mb-2">
              <CatalogSyncOverlay op={activeSyncOp} folderName={branchEstimate.folderName} />
            </div>
          ) : null}
          <div className={activeSyncOp ? 'pointer-events-none select-none blur-[2px]' : undefined}>
          <div className="mb-2 flex min-h-8 items-center justify-between gap-2 pl-3.5 pr-1">
            <CatalogBreadcrumbs
              selectedFolderId={catalog.selectedFolderId}
              treeItems={catalog.treeItems}
              onNavigate={navigateToFolder}
              isSearchMode={catalog.isSearchMode}
              searchQuery={catalog.searchQuery}
            />
            {!isManualTableSort && (
              <Tooltip content="Повернутися до ручного сортування" placement="top-end" showArrow classNames={{ base: 'before:bg-gray-700 before:rounded-[2px]', content: 'bg-gray-700 border-0 text-white text-xs' }} delay={200}>
                <Button
                  size="sm"
                  variant="flat"
                  className="min-w-0 h-6 px-2 shrink-0 bg-slate-600 text-slate-100"
                  aria-label="Скинути сортування"
                  startContent={<DynamicIcon name="arrow-up-down" size={14} />}
                  onPress={() => setTableSort(MANUAL_SORT)}
                >
                  Скинути сортування
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
            folderLookup={catalog.treeItemsFull}
            onOpenOrders={openProductOrders}
            sortDescriptor={tableSort}
            onSortChange={setTableSort}
            listSortEnabled={listSortActive}
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
            onMove={catalog.isSearchMode ? undefined : catalog.requestMove}
            treeItems={catalog.treeItemsFull}
            onUpdateWeight={(id, weight) =>
              catalog.updateMutation.mutateAsync({
                id,
                input: { weight },
                keepOpen: true,
              })
            }
          />
          </div>
        </main>
      </div>

      {isMobile && (
        <CatalogTreeBubble isOpen={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
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
        </CatalogTreeBubble>
      )}

      <CatalogContextMenu
        state={contextMenu}
        busy={busy}
        isInsideArchive={isInsideArchive}
        onClose={() => setContextMenu(null)}
        onEdit={catalog.openEdit}
        onSyncFromDilovod={requestSyncFromDilovod}
        onLegacyUpdate={requestLegacyUpdate}
        onMoveTo={(ids) => {
          if (contextMenu?.fromTrash) requestRestoreFromTrash(ids);
          else requestMoveTo(ids);
        }}
        onChangeType={requestChangeType}
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
        treeItems={catalog.treeItemsFull}
        detail={catalog.detail}
        detailLoading={catalog.detailLoading}
        dictionaries={catalog.dictionaries}
        saving={catalog.createMutation.isPending || catalog.updateMutation.isPending}
        onClose={catalog.closeDrawer}
        onCreate={(input) => catalog.createMutation.mutateAsync(input)}
        onUpdate={(id, input, opts) =>
          catalog.updateMutation.mutateAsync({ id, input, keepOpen: opts?.keepOpen })
        }
        onRestore={(id) => requestRestoreFromTrash(id)}
        catalogSearch={catalogSearch}
        onLegacyUpdate={(id) => requestLegacyUpdate([id])}
        legacyUpdating={catalog.legacySyncMutation.isPending}
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

      <ChangeObjectTypeModal
        isOpen={Boolean(changeTypeIds?.length)}
        items={changeTypeLabels}
        accPolicies={catalog.dictionaries.accPolicies}
        loading={catalog.changeTypeMutation.isPending}
        onClose={() => setChangeTypeIds(null)}
        onConfirm={(accPolicyId) => {
          if (!changeTypeIds?.length) return;
          catalog.changeTypeMutation.mutate(
            { ids: changeTypeIds, accPolicyId },
            {
              onSuccess: () => setChangeTypeIds(null),
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

      <ProductOrdersModal
        isOpen={ordersModalOpen}
        onOpenChange={(open) => {
          setOrdersModalOpen(open);
          if (!open) setOrdersModalProduct(null);
        }}
        isLoading={ordersModalLoading}
        product={ordersModalProduct}
        defaultTab={ordersModalTab}
        tabs={productOrdersTabs}
        productItems={navigableOrderProducts}
        onNavigate={
          navigableOrderProducts.length > 1
            ? (next) => {
                setOrdersModalProduct(next);
              }
            : undefined
        }
      />

      <CatalogSyncReportModal report={syncReport} onClose={() => setSyncReport(null)} />

      <ConfirmModal
        isOpen={branchRefreshConfirmOpen}
        title="Синхронізувати гілку з Dilovod?"
        message={
          <div className="space-y-1">
            <p>
              Буде синхронізовано структуру папки <span className="font-medium text-sm px-1.5 py-1 mr-0.5 whitespace-nowrap bg-amber-100 text-orange-800 rounded ring-1 ring-inset ring-amber-800/20"><DynamicIcon name="folder-input" size={16} className="inline-block align-middle relative -top-[1px]" /> {branchEstimate.folderName}</span> та всіх вкладених рівнів.
            </p>
          {!isAdmin && (
            <p className="text-danger text-sm mt-2">
              Після цього тимчасово виконається Legacy Update активних товарів гілки в таблицю{' '}
              <b>products</b> (Dilovod <code>sync-manual</code>, force). Архівні лише
              позначаються <code>isOutdated</code>, без запиту в Dilovod.
            </p>
          )}
            {branchEstimate.approxRecords > 100 ? (
              <p className="text-danger text-sm mt-2">
                Приблизно {branchEstimate.approxRecords} записів у межах{' '}
              {branchEstimate.folderCount}{' '}
              {branchEstimate.folderCount === 1 ? 'папки' : 'папок'}. Це досить велика кількість. Якщо ви впевнені, що хочете продовжити, доведеться зачекати ~{Math.ceil(branchEstimate.approxRecords / 50)} {pluralize(Math.ceil(branchEstimate.approxRecords / 50), 'хвилину', 'хвилини', 'хвилин')}, поки синхронізація завершиться.
              </p>
            ) : (
              <p className="text-default-400 text-sm mt-2">
                Приблизно {branchEstimate.approxRecords} записів у межах{' '}
                {branchEstimate.folderCount}{' '}
                {branchEstimate.folderCount === 1 ? 'папки' : 'папок'}. Фактична кількість може відрізнятися, якщо в Діловоді з’явились нові товари.
              </p>
            )}
          </div>
        }
        confirmText="Синхронізувати гілку"
        confirmColor="primary"
        cancelText="Скасувати"
        confirmLoading={catalog.refreshBranchMutation.isPending}
        onCancel={() => setBranchRefreshConfirmOpen(false)}
        onConfirm={() => {
          setBranchRefreshConfirmOpen(false);
          syncStartedAtRef.current = Date.now();
          catalog.refreshBranchMutation.mutate(folderIdForBranch, {
            onSuccess: (data) =>
              setSyncReport({
                op: 'branch',
                ok: true,
                folderName: branchEstimate.folderName,
                durationSec: syncDurationSec(),
                branch: data,
              }),
            onError: (err: Error) =>
              setSyncReport({
                op: 'branch',
                ok: false,
                folderName: branchEstimate.folderName,
                durationSec: syncDurationSec(),
                error: err.message,
              }),
          });
        }}
      />

      <ConfirmModal
        isOpen={stockRefreshConfirmOpen}
        title="Оновити залишки?"
        message={
          <div className="space-y-1">
            <p>
              Буде виконано оновлення залишків всіх товарів:{' '}
              <b>Dilovod → Backoffice → SalesDrive → WooCommerce (вітрина)</b>.
            </p>
            <p className="text-default-400 text-sm mt-2">
              Операція зазвичай займає не більше 10 секунд...
            </p>
          </div>
        }
        confirmText="Оновити залишки"
        confirmColor="warning"
        cancelText="Скасувати"
        confirmLoading={catalog.stockSyncMutation.isPending}
        onCancel={() => setStockRefreshConfirmOpen(false)}
        onConfirm={() => {
          setStockRefreshConfirmOpen(false);
          syncStartedAtRef.current = Date.now();
          catalog.stockSyncMutation.mutate(undefined, {
            onSuccess: (data) => {
              const failed = data.success === false || Boolean(data.alreadyRunning);
              setSyncReport({
                op: 'stock',
                ok: !failed,
                durationSec: syncDurationSec(),
                stock: data,
                error: failed ? data.error || data.stockMessage : undefined,
              });
            },
            onError: (err: Error) =>
              setSyncReport({
                op: 'stock',
                ok: false,
                durationSec: syncDurationSec(),
                error: err.message,
              }),
          });
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
        title={`Синхронізувати ${legacyUpdateSkus.length} ${pluralize(legacyUpdateSkus.length, 'товар', 'товари', 'товарів')} в старій таблиці товарів?`}
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
        confirmText="Синхронізувати"
        confirmColor="primary"
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
        title="Переміщення обʼєктів"
        message={
          <div className="space-y-1">
            <p>Ви впевнені, що хочете перемістити <b>{moveLabels.length} {pluralize(moveLabels.length, 'позицію', 'позиції', 'позицій')}</b> в папку <span className="font-medium text-sm px-1.5 py-1 mr-0.5 whitespace-nowrap bg-amber-100 text-orange-800 rounded ring-1 ring-inset ring-amber-800/20"><DynamicIcon name="folder-input" size={16} className="inline-block align-middle relative -top-[1px]" /> {moveTargetName}</span>?</p>
            <CatalogConfirmItemsList items={moveLabels} />
          </div>
        }
        confirmText="Так, перемістити"
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
