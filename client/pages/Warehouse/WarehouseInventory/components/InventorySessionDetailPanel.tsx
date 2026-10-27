import { useState, useCallback } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import { StockBadge } from '@/components/StockBadge';
import { ToastService } from '@/services/ToastService';
import type { InventorySession } from '../WarehouseInventoryTypes';
import { totalPortions, totalPortionsGp } from '../WarehouseInventoryUtils';
import { resolveSessionWarehouseScope } from '../inventoryHistoryGroups';
import { computeInventorySessionStats } from '../inventorySessionStats';
import InventoryTableSection from './InventoryTableSection';
import MovementMobProductEditDrawer from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobProductEditDrawer';
import InventoryRefreshReportModal from './InventoryRefreshReportModal';
import useRowHistory from '../useRowHistory';
import useUserNames from '@/hooks/useUserNames';

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation' | 'systemBalanceGp' | 'actualGp' | 'deviationGp';
type SortDirection = 'ascending' | 'descending';

interface InventorySessionDetailPanelProps {
  session: InventorySession;
  historySessions: InventorySession[];
  isAdmin: boolean;
  currentUserId: string | null;
  setCompositionBySku: Record<string, any[]>;
  onEdit: () => Promise<void>;
  onDelete?: (sessionId: string) => Promise<void>;
  onRefreshSessionBalances?: (sessionId: string) => Promise<{ items?: Array<any> } | null>;
  onHistoryRefresh?: () => void | Promise<void>;
  onClose: () => void;
  /** При відкритті за прямим URL — без дубльованого заголовка (є в H1) */
  compactHeader?: boolean;
}

export const InventorySessionDetailPanel = ({
  session,
  historySessions,
  isAdmin,
  currentUserId,
  setCompositionBySku,
  onEdit,
  onDelete,
  onRefreshSessionBalances,
  onHistoryRefresh,
  onClose,
  compactHeader = false,
}: InventorySessionDetailPanelProps) => {
  const [productEditGoodId, setProductEditGoodId] = useState<string | null>(null);
  const handleOpenProductEdit = useCallback((catalogGoodId: string) => {
    setProductEditGoodId(catalogGoodId);
  }, []);
  const handleCloseProductEdit = useCallback(() => {
    setProductEditGoodId(null);
  }, []);

  const [loadingEdit, setLoadingEdit] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [sortColumnProd, setSortColumnProd] = useState<SortColumn>('name');
  const [sortDirectionProd, setSortDirectionProd] = useState<SortDirection>('ascending');
  const [sortColumnMat, setSortColumnMat] = useState<SortColumn>('sku');
  const [sortDirectionMat, setSortDirectionMat] = useState<SortDirection>('ascending');
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const { rowHistoryCache, loadingSku, fetchHistory } = useRowHistory();
  const namesMap = useUserNames([Number(session.createdBy ?? -1)]);

  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshReportItems, setRefreshReportItems] = useState<any[]>([]);
  const [refreshSessionItems, setRefreshSessionItems] = useState<any[]>([]);
  const [refreshSessionId, setRefreshSessionId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const wh = resolveSessionWarehouseScope(session);
  const sectionTitlePrefix = wh === 'gp' ? 'ГП' : 'МС';

  const canAuthorEditSession = (sess: InventorySession): boolean => {
    if (!currentUserId || String(sess.createdBy) !== currentUserId) return false;
    const scope = resolveSessionWarehouseScope(sess);
    const latestForScope = historySessions.find(
      (s) => String(s.createdBy) === currentUserId && resolveSessionWarehouseScope(s) === scope,
    );
    return latestForScope != null && String(latestForScope.id) === String(sess.id);
  };

  const canEdit = session.status !== 'removed' && (isAdmin || canAuthorEditSession(session));
  const canDelete = isAdmin && onDelete && session.status !== 'removed';

  const st = computeInventorySessionStats(session);
  const { materials: dMat, sets: dSets, products: dProd } = st;

  const sortItems = (items: any[], column: SortColumn, dir: SortDirection) => {
    const list = [...items].map((item) => ({
      item,
      total: totalPortions(item),
      dev: totalPortions(item) !== null ? totalPortions(item)! - item.systemBalance : null,
      totalGp: totalPortionsGp(item),
      devGp: totalPortionsGp(item) !== null ? totalPortionsGp(item)! - item.systemBalanceGp : null,
    }));
    list.sort((a, b) => {
      let cmp = 0;
      switch (column) {
        case 'sku': cmp = a.item.sku.localeCompare(b.item.sku); break;
        case 'name': cmp = a.item.name.localeCompare(b.item.name); break;
        case 'systemBalance': cmp = (a.item.systemBalance ?? 0) - (b.item.systemBalance ?? 0); break;
        case 'actual': cmp = (a.total ?? 0) - (b.total ?? 0); break;
        case 'deviation': cmp = (a.dev ?? 0) - (b.dev ?? 0); break;
        case 'systemBalanceGp': cmp = (a.item.systemBalanceGp ?? 0) - (b.item.systemBalanceGp ?? 0); break;
        case 'actualGp': cmp = (a.totalGp ?? 0) - (b.totalGp ?? 0); break;
        case 'deviationGp': cmp = (a.devGp ?? 0) - (b.devGp ?? 0); break;
        default: cmp = 0;
      }
      return dir === 'ascending' ? cmp : -cmp;
    });
    return list;
  };

  const handleSort = (column: SortColumn, forMaterials = false) => {
    if (forMaterials) {
      if (sortColumnMat === column) setSortDirectionMat(sortDirectionMat === 'ascending' ? 'descending' : 'ascending');
      else {
        setSortColumnMat(column);
        setSortDirectionMat('ascending');
      }
    } else {
      if (sortColumnProd === column) setSortDirectionProd(sortDirectionProd === 'ascending' ? 'descending' : 'ascending');
      else {
        setSortColumnProd(column);
        setSortDirectionProd('ascending');
      }
    }
  };

  const handleRowClick = async (sessionId: string, sku: string) => {
    const key = `${sessionId}-${sku}`;
    if (expandedRowKey === key) {
      setExpandedRowKey(null);
      return;
    }
    setExpandedRowKey(key);
    if (!rowHistoryCache[sku]) {
      try {
        await fetchHistory(sku);
      } catch {
        // ignore
      }
    }
  };

  const openRefreshModal = async () => {
    if (!onRefreshSessionBalances) return;
    setLoadingRefresh(true);
    try {
      const report = await onRefreshSessionBalances(session.id);
      const mergedItems = report?.items ?? [];
      setRefreshReportItems(mergedItems);
      setRefreshSessionItems(session.items as any[]);
      setRefreshSessionId(session.id);
      setIsRefreshModalOpen(true);
    } finally {
      setLoadingRefresh(false);
    }
  };

  const handleApplyRefresh = async () => {
    if (!refreshSessionId) return;
    setIsApplying(true);
    try {
      const res = await fetch(`/api/warehouse/inventory/${refreshSessionId}/refresh-balances?apply=true`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ToastService.show({ title: 'Оновлення застосовано', color: 'success' });
      setIsRefreshModalOpen(false);
      await onHistoryRefresh?.();
    } catch (err) {
      ToastService.show({
        title: 'Помилка застосування',
        description: err instanceof Error ? err.message : 'Не вдалося застосувати оновлення',
        color: 'danger',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const dSetSystem = dSets.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
  const dProductSystem = dProd.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
  const dMaterialSystem = dMat.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
  const dSetActualSum = dSets.reduce((s, it) => s + (totalPortions(it) ?? 0), 0);
  const dProductActualSum = dProd.reduce((s, it) => s + (totalPortions(it) ?? 0), 0);
  const dMaterialActualSum = dMat.reduce((s, it) => s + (totalPortions(it) ?? 0), 0);
  const dSetSystemGp = dSets.reduce((s, it) => s + (it.systemBalanceGp ?? 0), 0);
  const dProductSystemGp = dProd.reduce((s, it) => s + (it.systemBalanceGp ?? 0), 0);
  const dMaterialSystemGp = dMat.reduce((s, it) => s + (it.systemBalanceGp ?? 0), 0);
  const dSetActualSumGp = dSets.reduce((s, it) => s + (totalPortionsGp(it) ?? 0), 0);
  const dProductActualSumGp = dProd.reduce((s, it) => s + (totalPortionsGp(it) ?? 0), 0);
  const dMaterialActualSumGp = dMat.reduce((s, it) => s + (totalPortionsGp(it) ?? 0), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {!compactHeader && (
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
                Деталі інвентаризації #{session.id}
                <StockBadge variant={wh === 'gp' ? 'gp' : 'ms'} size="10px" />
              </h2>
            )}
            <div className={`flex flex-wrap items-center gap-3 text-[13px] text-gray-500 ${compactHeader ? '' : 'mt-2'}`}>
              <span>Автор: <b>{namesMap[Number(session.createdBy ?? -1)] ?? 'N/A'}</b></span>
              <span className="border-l border-gray-300 pl-3">{formatDate(session.createdAt)}</span>
              {compactHeader && (
                <span className="border-l border-gray-300 pl-3 inline-flex items-center gap-1.5">
                  Склад <StockBadge variant={wh === 'gp' ? 'gp' : 'ms'} size="10px" />
                </span>
              )}
              {session.comment && <span className="border-l border-gray-300 pl-3">{session.comment}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="flat" onPress={onClose}>
              Закрити
            </Button>
            {onRefreshSessionBalances && (
              <Button
                size="sm"
                variant="flat"
                color="primary"
                data-btn-tone="primary-blue-flat"
                isDisabled={loadingEdit || loadingDelete}
                startContent={<DynamicIcon name="refresh-cw" className={`w-3 h-3 ${loadingRefresh ? 'animate-spin' : ''}`} />}
                onPress={() => void openRefreshModal()}
              >
                Оновити облікові залишки
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="flat"
                color="primary"
                data-btn-tone="primary-blue-flat"
                isDisabled={loadingDelete}
                startContent={<DynamicIcon name={loadingEdit ? 'loader-circle' : 'pencil'} className={`w-3 h-3 ${loadingEdit ? 'animate-spin' : ''}`} />}
                onPress={async () => {
                  setLoadingEdit(true);
                  try {
                    await onEdit();
                  } finally {
                    setLoadingEdit(false);
                  }
                }}
              >
                Редагувати
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="flat"
                color="danger"
                isDisabled={loadingEdit}
                startContent={<DynamicIcon name={loadingDelete ? 'loader-circle' : 'trash-2'} className={`w-3 h-3 ${loadingDelete ? 'animate-spin' : ''}`} />}
                onPress={async () => {
                  setLoadingDelete(true);
                  try {
                    await onDelete!(session.id);
                    onClose();
                  } finally {
                    setLoadingDelete(false);
                  }
                }}
              >
                Видалити
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {dSets.length > 0 && (
          <InventoryTableSection
            title={`${sectionTitlePrefix}: Комплекти`}
            sessionId={session.id}
            inventoryDate={session.inventoryDate}
            rows={sortItems(dSets, sortColumnProd, sortDirectionProd)}
            sortColumn={sortColumnProd}
            sortDirection={sortDirectionProd}
            onSort={(col) => handleSort(col, false)}
            expandedRowKey={expandedRowKey}
            onRowClick={handleRowClick}
            rowHistoryCache={rowHistoryCache}
            rowHistoryLoading={loadingSku}
            setCompositionBySku={setCompositionBySku}
            onOpenProductEdit={handleOpenProductEdit}
            summary={{
              systemTotal: dSetSystem, actualSum: st.setHasActual ? dSetActualSum : null, hasActual: st.setHasActual,
              devShortfall: st.setDevShortfall, devSurplus: st.setDevSurplus,
              systemTotalGp: dSetSystemGp, actualSumGp: st.setHasActualGp ? dSetActualSumGp : null, hasActualGp: st.setHasActualGp,
              devShortfallGp: st.setDevShortfallGp, devSurplusGp: st.setDevSurplusGp,
            }}
          />
        )}
        {dProd.length > 0 && (
          <InventoryTableSection
            title={`${sectionTitlePrefix}: Товари`}
            sessionId={session.id}
            inventoryDate={session.inventoryDate}
            rows={sortItems(dProd, sortColumnProd, sortDirectionProd)}
            sortColumn={sortColumnProd}
            sortDirection={sortDirectionProd}
            onSort={(col) => handleSort(col, false)}
            expandedRowKey={expandedRowKey}
            onRowClick={handleRowClick}
            rowHistoryCache={rowHistoryCache}
            rowHistoryLoading={loadingSku}
            setCompositionBySku={setCompositionBySku}
            onOpenProductEdit={handleOpenProductEdit}
            summary={{
              systemTotal: dProductSystem, actualSum: st.productHasActual ? dProductActualSum : null, hasActual: st.productHasActual,
              devShortfall: st.productDevShortfall, devSurplus: st.productDevSurplus,
              systemTotalGp: dProductSystemGp, actualSumGp: st.productHasActualGp ? dProductActualSumGp : null, hasActualGp: st.productHasActualGp,
              devShortfallGp: st.productDevShortfallGp, devSurplusGp: st.productDevSurplusGp,
            }}
          />
        )}
        {dMat.length > 0 && (
          <InventoryTableSection
            title={`${sectionTitlePrefix}: Матеріали`}
            sessionId={session.id}
            inventoryDate={session.inventoryDate}
            rows={sortItems(dMat, sortColumnMat, sortDirectionMat)}
            sortColumn={sortColumnMat}
            sortDirection={sortDirectionMat}
            onSort={(col) => handleSort(col, true)}
            expandedRowKey={expandedRowKey}
            onRowClick={handleRowClick}
            rowHistoryCache={rowHistoryCache}
            rowHistoryLoading={loadingSku}
            setCompositionBySku={setCompositionBySku}
            onOpenProductEdit={handleOpenProductEdit}
            summary={{
              systemTotal: dMaterialSystem, actualSum: st.materialHasActual ? dMaterialActualSum : null, hasActual: st.materialHasActual,
              devShortfall: st.materialDevShortfall, devSurplus: st.materialDevSurplus,
              systemTotalGp: dMaterialSystemGp, actualSumGp: st.materialHasActualGp ? dMaterialActualSumGp : null, hasActualGp: st.materialHasActualGp,
              devShortfallGp: st.materialDevShortfallGp, devSurplusGp: st.materialDevSurplusGp,
            }}
            isMaterial
          />
        )}
      </div>

      <MovementMobProductEditDrawer
        catalogGoodId={productEditGoodId}
        open={Boolean(productEditGoodId)}
        onClose={handleCloseProductEdit}
      />

      <InventoryRefreshReportModal
        isOpen={isRefreshModalOpen}
        onClose={() => setIsRefreshModalOpen(false)}
        items={refreshReportItems}
        sessionItems={refreshSessionItems}
        inventoryDate={session.inventoryDate ?? session.createdAt}
        warehouseScope={wh}
        onApply={handleApplyRefresh}
        isApplying={isApplying}
      />
    </div>
  );
};
