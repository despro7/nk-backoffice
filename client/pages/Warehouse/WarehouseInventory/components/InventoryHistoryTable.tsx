import { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Chip, Pagination, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/auth-context';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import type { InventorySession, InventoryWarehouseScope } from '../WarehouseInventoryTypes';
import { statusLabel, statusColor, statusClass, totalPortions, totalPortionsGp } from '../WarehouseInventoryUtils';
import useRowHistory from '../useRowHistory';
import { ToastService } from '@/services/ToastService';
import { StockBadge } from '@/components/StockBadge';
import InventoryRefreshReportModal from './InventoryRefreshReportModal';
import InventoryTableSection from './InventoryTableSection';
import useUserNames from '@/hooks/useUserNames';
import { buildInventoryHistoryDisplayEntries, resolveSessionWarehouseScope } from '../inventoryHistoryGroups';
import { computeInventorySessionStats } from '../inventorySessionStats';

const PAGE_SIZE_OPTIONS = [6, 12, 24];

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation' | 'systemBalanceGp' | 'actualGp' | 'deviationGp';
type SortDirection = 'ascending' | 'descending';

interface HistoryTableProps {
  sessions: InventorySession[];
  onLoadSession?: (session: InventorySession) => Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  onRestoreSession?: (sessionId: string) => Promise<void>;
  onRefreshSessionBalances?: (sessionId: string) => Promise<{ items?: Array<any> } | null>;
  onRefresh?: (() => Promise<void>) | (() => void);
  setCompositionBySku: Record<string, any[]>;
}

const HistoryTable = ({ sessions, onLoadSession, onDeleteSession, onRestoreSession, onRefreshSessionBalances, onRefresh, setCompositionBySku }: HistoryTableProps) => {
  const { user } = useAuth();
  const { hasPermission } = useRoleAccess();
  const isAdmin = hasPermission(PERMISSIONS.ACTION_WAREHOUSE_HISTORY_DELETE);
  const currentUserId = user?.id ? String(user.id) : null;
  const canAuthorEditSession = (sess: InventorySession): boolean => {
    if (!currentUserId || String(sess.createdBy) !== currentUserId) return false;
    const scope = resolveSessionWarehouseScope(sess);
    const latestForScope = sessions.find(
      (s) => String(s.createdBy) === currentUserId && resolveSessionWarehouseScope(s) === scope,
    );
    return latestForScope != null && String(latestForScope.id) === String(sess.id);
  };

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [loadingLoadId, setLoadingLoadId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [loadingRefreshId, setLoadingRefreshId] = useState<string | null>(null);
  const [sortColumnProd, setSortColumnProd] = useState<SortColumn>('name');
  const [sortDirectionProd, setSortDirectionProd] = useState<SortDirection>('ascending');
  const [sortColumnMat, setSortColumnMat] = useState<SortColumn>('sku');
  const [sortDirectionMat, setSortDirectionMat] = useState<SortDirection>('ascending');
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(6);

  const userIds = sessions.map((s) => Number(s.createdBy ?? null));
  const namesMap = useUserNames(userIds);

  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshReportItems, setRefreshReportItems] = useState<any[]>([]);
  const [refreshInventoryDate, setRefreshInventoryDate] = useState<string | null>(null);
  const [refreshSessionItems, setRefreshSessionItems] = useState<any[]>([]);
  const [refreshSessionId, setRefreshSessionId] = useState<string | null>(null);
  const [refreshSessionIds, setRefreshSessionIds] = useState<string[]>([]);
  const [refreshWarehouseScope, setRefreshWarehouseScope] = useState<InventoryWarehouseScope | 'multi'>('small');
  const [isApplying, setIsApplying] = useState(false);

  const displayEntries = useMemo(() => buildInventoryHistoryDisplayEntries(sessions), [sessions]);

  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const { rowHistoryCache, loadingSku, fetchHistory } = useRowHistory();

  const total = displayEntries.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const rangeEnd = Math.min(safePage * limit, total);
  const pagedEntries = displayEntries.slice((safePage - 1) * limit, safePage * limit);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  useEffect(() => {
    if (expandedSessionId && contentRefs.current[expandedSessionId]) {
      const h = contentRefs.current[expandedSessionId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedSessionId]: h }));
    }
  }, [expandedSessionId, sortColumnProd, sortDirectionProd, sortColumnMat, sortDirectionMat, expandedRowKey, rowHistoryCache]);

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-list" className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>Немає завершених інвентаризацій</p>
      </div>
    );
  }

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
      }
      return dir === 'ascending' ? cmp : -cmp;
    });
    return list;
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
        // swallow
      }
    }
  };

  const handleApplyRefresh = async () => {
    const idsToApply = refreshSessionIds.length > 0 ? refreshSessionIds : (refreshSessionId ? [refreshSessionId] : []);
    if (idsToApply.length === 0) return;
    setIsApplying(true);
    try {
      for (const id of idsToApply) {
        const res = await fetch(`/api/warehouse/inventory/${id}/refresh-balances?apply=true`, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      ToastService.show({ title: 'Оновлення застосовано', color: 'success' });
      try {
        const maybe: any = onRefresh?.();
        if (maybe && typeof maybe.then === 'function') await maybe;
      } catch {
        // swallow
      }
      setIsRefreshModalOpen(false);
    } catch (err) {
      ToastService.show({ title: 'Помилка застосування', description: err instanceof Error ? err.message : 'Не вдалося застосувати оновлення', color: 'danger' });
    } finally {
      setIsApplying(false);
    }
  };

  const openRefreshModal = async (
    sessionIds: string[],
    sessionItems: any[],
    inventoryDateLabel: string,
    entryKey: string,
    warehouseScope: InventoryWarehouseScope | 'multi',
  ) => {
    if (!onRefreshSessionBalances) return;
    setLoadingRefreshId(entryKey);
    try {
      const mergedItems: any[] = [];
      for (const sid of sessionIds) {
        const report = await onRefreshSessionBalances(sid);
        if (report?.items) mergedItems.push(...report.items);
      }
      const mergedBySku = new Map<string, any>();
      for (const it of mergedItems) {
        if (!it?.sku) continue;
        const prev = mergedBySku.get(String(it.sku)) ?? {};
        mergedBySku.set(String(it.sku), { ...prev, ...it });
      }
      setRefreshReportItems(Array.from(mergedBySku.values()));
      setRefreshSessionItems(sessionItems);
      setRefreshSessionId(sessionIds[0] ?? null);
      setRefreshSessionIds(sessionIds);
      setRefreshInventoryDate(inventoryDateLabel);
      setRefreshWarehouseScope(warehouseScope);
      setIsRefreshModalOpen(true);
    } finally {
      setLoadingRefreshId(null);
    }
  };

  return (
    <div className="space-y-2">
      {pagedEntries.map((entry) => {
        const isGroup = entry.kind === 'group';
        const msSession = isGroup ? entry.msSession : entry.session;
        const gpSession = isGroup ? entry.gpSession : entry.session;
        const session = entry.kind === 'single' ? entry.session : entry.msSession;
        const entryKey = isGroup ? `group-${entry.msSession.id}-${entry.gpSession.id}` : session.id;

        const msStats = computeInventorySessionStats(msSession);
        const gpStats = isGroup ? computeInventorySessionStats(gpSession) : msStats;

        const {
          materials, sets, products,
          productDevShortfall, productDevSurplus,
          materialDevShortfall, materialDevSurplus,
          setDevShortfall, setDevSurplus,
          productHasActual, materialHasActual, setHasActual,
          productDevShortfallGp, productDevSurplusGp, productHasActualGp,
        } = {
          ...msStats,
          productDevShortfallGp: isGroup ? gpStats.productDevShortfallGp : msStats.productDevShortfallGp,
          productDevSurplusGp: isGroup ? gpStats.productDevSurplusGp : msStats.productDevSurplusGp,
          productHasActualGp: isGroup ? gpStats.productHasActualGp : msStats.productHasActualGp,
        };

        const canAuthorEditThisSession = !isAdmin && canAuthorEditSession(session);

        const headerDateLabel = isGroup
          ? `${formatDate(msSession.inventoryDate)} – ${formatDate(gpSession.inventoryDate)}`
          : formatDate(session.inventoryDate);

        const sessionsInEntry = isGroup ? [msSession, gpSession] : [session];
        const mergedItemsForRefresh = sessionsInEntry.flatMap((s) => s.items as any[]);

        return (
          <div key={entryKey} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button className="w-full px-4 pt-3 pb-2.5 flex items-center justify-between bg-neutral-100 transition-colors" onClick={() => setExpandedSessionId(expandedSessionId === entryKey ? null : entryKey)}>
              <div className="flex items-center gap-2 flex-1">
                <DynamicIcon name="chevron-right" className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expandedSessionId === entryKey ? 'rotate-90' : ''}`} />
                <div className="text-left pr-2"><p className="text-sm font-medium text-gray-700 tabular-nums">{headerDateLabel}</p></div>
                {isGroup ? (
                  <Chip size="sm" variant="flat" className="bg-default-100">МС + ГП</Chip>
                ) : (
                  <Chip size="sm" color={statusColor[session.status]} className={statusClass[session.status]} variant="flat">{statusLabel[session.status]}</Chip>
                )}
              </div>

              <div className="grid grid-cols-[120px_120px_120px_100px] gap-6 ml-2 text-xs text-gray-500">
                <div className="text-right flex flex-col gap-1">
                  {setHasActual ? (
                    <div className="text-medium font-semibold leading-none"><span className="text-red-500">{setDevShortfall > 0 ? `-${setDevShortfall}` : '0'}</span><span> / </span><span className="text-blue-600">{setDevSurplus > 0 ? `+${setDevSurplus}` : '+0'}</span></div>
                  ) : '–'}
                  <p className="flex items-center justify-end gap-1 leading-tight"><StockBadge variant="ms" size="9px" /> набори</p>
                </div>
                <div className="text-right flex flex-col gap-1">
                  {productHasActual ? (
                    <div className="text-medium font-semibold leading-none"><span className="text-red-500">{productDevShortfall > 0 ? `-${productDevShortfall}` : '0'}</span><span> / </span><span className="text-blue-600">{productDevSurplus > 0 ? `+${productDevSurplus}` : '+0'}</span></div>
                  ) : '–'}
                  <p className="flex items-center justify-end gap-1 leading-tight"><StockBadge variant="ms" size="9px" /> товари</p>
                </div>
                <div className="text-right flex flex-col gap-1">
                  {materialHasActual ? (
                    <div className="text-medium font-semibold leading-none"><span className="text-red-500">{materialDevShortfall > 0 ? `-${materialDevShortfall}` : '0'}</span><span> / </span><span className="text-blue-600">{materialDevSurplus > 0 ? `+${materialDevSurplus}` : '+0'}</span></div>
                  ) : '–'}
                  <p className="flex items-center justify-end gap-1 leading-tight"><StockBadge variant="ms" size="9px" /> матеріали</p>
                </div>
                {/* <div className="text-right flex flex-col gap-1">
                  {setHasActualGp ? (
                    <div className="text-medium font-semibold leading-none"><span className="text-red-500">{setDevShortfallGp > 0 ? `-${setDevShortfallGp}` : '0'}</span><span> / </span><span className="text-blue-600">{setDevSurplusGp > 0 ? `+${setDevSurplusGp}` : '+0'}</span></div>
                  ) : '–'}
                  <p className="flex items-center justify-end gap-1 leading-tight"><StockBadge variant="gp" size="9px" /> набори</p>
                </div> */}
                <div className="text-right flex flex-col gap-1">
                  {productHasActualGp ? (
                    <div className="text-medium font-semibold leading-none"><span className="text-red-500">{productDevShortfallGp > 0 ? `-${productDevShortfallGp}` : '0'}</span><span> / </span><span className="text-blue-600">{productDevSurplusGp > 0 ? `+${productDevSurplusGp}` : '+0'}</span></div>
                  ) : '–'}
                  <p className="flex items-center justify-end gap-1 leading-tight"><StockBadge variant="gp" size="9px" /> товари</p>
                </div>
              </div>
            </button>

            <div style={{ maxHeight: expandedSessionId === entryKey ? `${contentHeights[entryKey] || 0}px` : '0', opacity: expandedSessionId === entryKey ? 1 : 0, overflow: 'hidden', transition: 'all 300ms ease-in-out' }} className="bg-gray-50 border-t border-gray-200">
              <div ref={(el) => { if (el) contentRefs.current[entryKey] = el; }} className="p-4">
                <div className="mb-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">
                      {isGroup ? `Інвентаризація МС #${msSession.id} + ГП #${gpSession.id}` : `Деталі інвентаризації #${session.id}`}
                    </h3>
                    <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                      {onRefreshSessionBalances && (
                        <Button size="sm" variant="flat" color="primary" data-btn-tone="primary-blue-flat" className="h-auto px-3 py-1.5 gap-1 min-w-0" isDisabled={!!loadingLoadId || !!loadingDeleteId} startContent={<DynamicIcon name="refresh-cw" className={`w-3 h-3 ${loadingRefreshId !== entryKey ? '' : 'animate-spin'}`} />} onPress={() => openRefreshModal(sessionsInEntry.map((s) => s.id), mergedItemsForRefresh, headerDateLabel, entryKey, isGroup ? 'multi' : resolveSessionWarehouseScope(session))}>Оновити облікові залишки</Button>
                      )}

                      {!isGroup && session.status !== 'removed' && (isAdmin || canAuthorEditThisSession) && onLoadSession && (
                        <Button size="sm" variant="flat" color="primary" data-btn-tone="primary-blue-flat" className="h-auto px-2.5 py-1.5 gap-1 min-w-0" isDisabled={!!loadingDeleteId} startContent={<DynamicIcon name={loadingLoadId !== session.id ? 'pencil' : 'loader-circle'} className={`w-3 h-3 ${loadingLoadId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingLoadId(session.id); try { await onLoadSession!(session); } finally { setLoadingLoadId(null); } }}>Редагувати</Button>
                      )}

                      {session.status === 'removed' && isAdmin && onRestoreSession && (
                        <Button size="sm" variant="flat" color="primary" data-btn-tone="primary-emerald-flat" className="h-auto px-3 py-1.5 gap-1 min-w-0" isDisabled={!!loadingDeleteId} startContent={<DynamicIcon name={loadingLoadId !== session.id ? 'corner-up-left' : 'loader-circle'} className={`w-3 h-3 ${loadingLoadId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingLoadId(session.id); try { await onRestoreSession!(session.id); } finally { setLoadingLoadId(null); } }}>Відновити</Button>
                      )}

                      {isAdmin && onDeleteSession && (
                        <Button size="sm" variant="flat" color="danger" className="h-auto px-3 py-1.5 gap-1 min-w-0" isDisabled={!!loadingLoadId} startContent={<DynamicIcon name={loadingDeleteId !== session.id ? 'trash-2' : 'loader-circle'} className={`w-3 h-3 ${loadingDeleteId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingDeleteId(session.id); try { await onDeleteSession!(session.id); } finally { setLoadingDeleteId(null); } }}>{session.status === 'removed' ? 'Видалити назавжди' : 'Видалити'}</Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    {sessionsInEntry.map((sess) => (
                      <span key={sess.id} className="flex items-center gap-3">
                        <StockBadge variant={resolveSessionWarehouseScope(sess) === 'gp' ? 'gp' : 'ms'} size="9px" />
                        <span>#{sess.id}: <b>{namesMap[Number(sess.createdBy ?? -1)] ?? 'N/A'}</b></span>
                        <span className="border-l border-gray-300 pl-3">{formatDate(sess.createdAt)}</span>
                        {sess.comment && <span className="border-l border-gray-300 pl-3">{sess.comment}</span>}
                      </span>
                    ))}
                  </div>
                </div>

                {sessionsInEntry.map((detailSession) => {
                  const st = computeInventorySessionStats(detailSession);
                  const { materials: dMat, sets: dSets, products: dProd } = st;
                  const wh = resolveSessionWarehouseScope(detailSession);
                  const sectionTitlePrefix = wh === 'gp' ? 'ГП' : 'МС';

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
                    <div key={`detail-${detailSession.id}`} className={isGroup ? 'mb-8 pb-6 border-b border-gray-200 last:border-0' : ''}>
                      {isGroup && (
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h4 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                            <StockBadge variant={wh === 'gp' ? 'gp' : 'ms'} size="10px" />
                            {sectionTitlePrefix} — сесія #{detailSession.id}
                          </h4>
                          {detailSession.status !== 'removed' && (isAdmin || canAuthorEditSession(detailSession)) && onLoadSession && (
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              data-btn-tone="primary-blue-flat"
                              className="h-auto px-2.5 py-1.5 gap-1 min-w-0"
                              isDisabled={!!loadingDeleteId}
                              startContent={<DynamicIcon name={loadingLoadId !== detailSession.id ? 'pencil' : 'loader-circle'} className={`w-3 h-3 ${loadingLoadId !== detailSession.id ? '' : 'animate-spin'}`} />}
                              onPress={async () => {
                                setLoadingLoadId(detailSession.id);
                                try {
                                  await onLoadSession!(detailSession);
                                } finally {
                                  setLoadingLoadId(null);
                                }
                              }}
                            >
                              Редагувати
                            </Button>
                          )}
                        </div>
                      )}
                      {dSets.length > 0 && (
                        <InventoryTableSection
                          title={`${sectionTitlePrefix}: Комплекти`}
                          sessionId={detailSession.id}
                          inventoryDate={detailSession.inventoryDate}
                          rows={sortItems(dSets, sortColumnProd, sortDirectionProd)}
                          sortColumn={sortColumnProd}
                          sortDirection={sortDirectionProd}
                          onSort={(col) => handleSort(col, false)}
                          expandedRowKey={expandedRowKey}
                          onRowClick={handleRowClick}
                          rowHistoryCache={rowHistoryCache}
                          rowHistoryLoading={loadingSku}
                          setCompositionBySku={setCompositionBySku}
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
                          sessionId={detailSession.id}
                          inventoryDate={detailSession.inventoryDate}
                          rows={sortItems(dProd, sortColumnProd, sortDirectionProd)}
                          sortColumn={sortColumnProd}
                          sortDirection={sortDirectionProd}
                          onSort={(col) => handleSort(col, false)}
                          expandedRowKey={expandedRowKey}
                          onRowClick={handleRowClick}
                          rowHistoryCache={rowHistoryCache}
                          rowHistoryLoading={loadingSku}
                          setCompositionBySku={setCompositionBySku}
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
                          sessionId={detailSession.id}
                          inventoryDate={detailSession.inventoryDate}
                          rows={sortItems(dMat, sortColumnMat, sortDirectionMat)}
                          sortColumn={sortColumnMat}
                          sortDirection={sortDirectionMat}
                          onSort={(col) => handleSort(col, true)}
                          expandedRowKey={expandedRowKey}
                          onRowClick={handleRowClick}
                          rowHistoryCache={rowHistoryCache}
                          rowHistoryLoading={loadingSku}
                          setCompositionBySku={setCompositionBySku}
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
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {total > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600">
            Показано {rangeStart}–{rangeEnd} з {total}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Кількість на сторінку"
              size="sm"
              className="w-36"
              selectedKeys={new Set([String(limit)])}
              onSelectionChange={(keys) => {
                const value = Number(Array.from(keys)[0]);
                if (Number.isFinite(value)) {
                  setLimit(value);
                  setPage(1);
                }
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} textValue={`${option} / стор.`}>
                  {option} / стор.
                </SelectItem>
              ))}
            </Select>
            {pages > 1 && (
              <Pagination
                total={pages}
                page={safePage}
                onChange={setPage}
                showControls
                size="sm"
              />
            )}
          </div>
        </div>
      )}

      <InventoryRefreshReportModal
        isOpen={isRefreshModalOpen}
        onClose={() => { setIsRefreshModalOpen(false); setRefreshInventoryDate(null); }}
        items={refreshReportItems}
        sessionItems={refreshSessionItems}
        inventoryDate={refreshInventoryDate}
        warehouseScope={refreshWarehouseScope}
        isApplying={isApplying}
        onApply={handleApplyRefresh}
        onRefresh={onRefresh ? async () => { const maybe: any = onRefresh(); if (maybe && typeof maybe.then === 'function') await maybe; } : undefined}
      />
    </div>
  );
};

export default HistoryTable;
