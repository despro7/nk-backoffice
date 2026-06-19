import { useState, useRef, useEffect } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import type { InventorySession } from '../WarehouseInventoryTypes';
import { statusLabel, statusColor, statusClass, totalPortions } from '../WarehouseInventoryUtils';
import useRowHistory from '../useRowHistory';
import { ToastService } from '@/services/ToastService';
import InventoryRefreshReportModal from './InventoryRefreshReportModal';
import InventoryTableSection from './InventoryTableSection';
import useUserNames from '@/hooks/useUserNames';

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation';
type SortDirection = 'ascending' | 'descending';

interface HistoryTableProps {
  sessions: InventorySession[];
  onLoadSession?: (session: InventorySession) => Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  onRestoreSession?: (sessionId: string) => Promise<void>;
  onRefreshSessionBalances?: (sessionId: string) => Promise<{ items?: Array<any> } | null>;
  onRefresh?: (() => Promise<void>) | (() => void);
}
// Accept both sync and async callbacks for onRefresh

const HistoryTable = ({ sessions, onLoadSession, onDeleteSession, onRestoreSession, onRefreshSessionBalances, onRefresh }: HistoryTableProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const currentUserId = user?.id ? String(user.id) : null;
  const latestOwnSessionId = currentUserId ? sessions.find((s) => String(s.createdBy) === currentUserId)?.id ?? null : null;

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

  const userIds = sessions.map(s => Number(s.createdBy ?? null));
  const namesMap = useUserNames(userIds);

  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshReportItems, setRefreshReportItems] = useState<any[]>([]);
  const [refreshInventoryDate, setRefreshInventoryDate] = useState<string | null>(null);
  const [refreshSessionItems, setRefreshSessionItems] = useState<any[]>([]);
  const [refreshSessionId, setRefreshSessionId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const { rowHistoryCache, loadingSku, fetchHistory } = useRowHistory();

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
      else { setSortColumnMat(column); setSortDirectionMat('ascending'); }
    } else {
      if (sortColumnProd === column) setSortDirectionProd(sortDirectionProd === 'ascending' ? 'descending' : 'ascending');
      else { setSortColumnProd(column); setSortDirectionProd('ascending'); }
    }
  };

  const sortItems = (items: any[], column: SortColumn, dir: SortDirection) => {
    const list = [...items].map((item) => ({ item, total: totalPortions(item), dev: totalPortions(item) !== null ? totalPortions(item)! - item.systemBalance : null }));
    list.sort((a, b) => {
      let cmp = 0;
      switch (column) {
        case 'sku': cmp = a.item.sku.localeCompare(b.item.sku); break;
        case 'name': cmp = a.item.name.localeCompare(b.item.name); break;
        case 'systemBalance': cmp = (a.item.systemBalance ?? 0) - (b.item.systemBalance ?? 0); break;
        case 'actual': cmp = (a.total ?? 0) - (b.total ?? 0); break;
        case 'deviation': cmp = (a.dev ?? 0) - (b.dev ?? 0); break;
      }
      return dir === 'ascending' ? cmp : -cmp;
    });
    return list;
  };

  const handleRowClick = async (sessionId: string, sku: string) => {
    const key = `${sessionId}-${sku}`;
    if (expandedRowKey === key) { setExpandedRowKey(null); return; }
    setExpandedRowKey(key);
    if (!rowHistoryCache[sku]) {
      try { await fetchHistory(sku); } catch (e) { /* swallow */ }
    }
  };

  useEffect(() => {
    if (expandedSessionId && contentRefs.current[expandedSessionId]) {
      const h = contentRefs.current[expandedSessionId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedSessionId]: h }));
    }
  }, [expandedSessionId, sortColumnProd, sortDirectionProd, sortColumnMat, sortDirectionMat, expandedRowKey, rowHistoryCache]);

  const handleApplyRefresh = async () => {
    if (!refreshSessionId) return;
    setIsApplying(true);
    try {
      const res = await fetch(`/api/warehouse/inventory/${refreshSessionId}/refresh-balances?apply=true`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.applyScheduled) {
        ToastService.show({ title: 'Оновлення запущено', description: 'Оновлення облікових залишків запущено у фоновому режимі', color: 'success' });
      } else {
        ToastService.show({ title: 'Оновлення застосовано', color: 'success' });
        try { const maybe: any = onRefresh?.(); if (maybe && typeof maybe.then === 'function') await maybe; } catch (e) { }
      }
      setIsRefreshModalOpen(false);
    } catch (err) {
      ToastService.show({ title: 'Помилка застосування', description: err instanceof Error ? err.message : 'Не вдалося застосувати оновлення', color: 'danger' });
    } finally { setIsApplying(false); }
  };

  const getSessionItems = (sessionItems: any[]) => {
    const shouldKeepItem = (item: any): boolean => {
      if (!item?.isOutdated) return true;
      const fact = totalPortions(item);
      const actualOrSystem = Math.max(fact ?? 0, item.systemBalance ?? 0);
      return actualOrSystem > 0;
    };

    const materials = sessionItems.filter((item) => item.type === 'material' && shouldKeepItem(item));
    const sets = sessionItems.filter((item) => item.type === 'set' && shouldKeepItem(item));
    const products = sessionItems.filter((item) => (item.type === 'product' || item.type === undefined) && shouldKeepItem(item));

    return { materials, sets, products };
  };

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const canAuthorEditThisSession = !isAdmin && currentUserId !== null && String(session.createdBy) === currentUserId && latestOwnSessionId !== null && String(session.id) === String(latestOwnSessionId);
        const items: any[] = session.items as any[];
        const { materials, sets, products } = getSessionItems(items);

        const productSystem = products.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
        const materialSystem = materials.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
        const setSystem = sets.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
        const productActualSum = products.reduce((s, it) => s + ((totalPortions(it) ?? 0)), 0);
        const materialActualSum = materials.reduce((s, it) => s + ((totalPortions(it) ?? 0)), 0);
        const setActualSum = sets.reduce((s, it) => s + ((totalPortions(it) ?? 0)), 0);
        const productDevShortfall = products.reduce((s, it) => { const total = totalPortions(it); const system = it.systemBalance ?? 0; return s + (total !== null && total < system ? system - total : 0); }, 0);
        const productDevSurplus = products.reduce((s, it) => { const total = totalPortions(it); const system = it.systemBalance ?? 0; return s + (total !== null && total > system ? total - system : 0); }, 0);
        const materialDevShortfall = materials.reduce((s, it) => { const total = totalPortions(it); const system = it.systemBalance ?? 0; return s + (total !== null && total < system ? system - total : 0); }, 0);
        const materialDevSurplus = materials.reduce((s, it) => { const total = totalPortions(it); const system = it.systemBalance ?? 0; return s + (total !== null && total > system ? total - system : 0); }, 0);
        const setDevShortfall = sets.reduce((s, it) => { const total = totalPortions(it); const system = it.systemBalance ?? 0; return s + (total !== null && total < system ? system - total : 0); }, 0);
        const setDevSurplus = sets.reduce((s, it) => { const total = totalPortions(it); const system = it.systemBalance ?? 0; return s + (total !== null && total > system ? total - system : 0); }, 0);
        const productHasActual = products.some((it) => totalPortions(it) !== null);
        const materialHasActual = materials.some((it) => totalPortions(it) !== null);
        const setHasActual = sets.some((it) => totalPortions(it) !== null);

        return (
          <div key={session.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors" onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}>
              <div className="flex items-center gap-2 flex-1">
                <DynamicIcon name="chevron-right" className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expandedSessionId === session.id ? 'rotate-90' : ''}`} />
                <div className="text-left pr-2"><p className="text-sm font-medium text-gray-700 tabular-nums">{formatDate(session.inventoryDate)}</p></div>
                <Chip size="sm" color={statusColor[session.status]} className={statusClass[session.status]} variant="flat">{statusLabel[session.status]}</Chip>
              </div>

              <div className="flex items-center gap-4">
                <div className="grid grid-cols-3 gap-8 ml-2 text-xs text-gray-500">
                  <div className="text-right">
                    {setHasActual ? (
                      <div className="text-medium font-semibold leading-none"><span className="text-red-500">{setDevShortfall > 0 ? `-${setDevShortfall}` : '0'}</span><span> / </span><span className="text-blue-600">{setDevSurplus > 0 ? `+${setDevSurplus}` : '+0'}</span></div>
                    ) : '–'}
                    <p className="leading-none">відхилення наборів</p>
                  </div>
                  <div className="text-right">
                    {productHasActual ? (
                      <div className="text-medium font-semibold leading-none"><span className="text-red-500">{productDevShortfall > 0 ? `-${productDevShortfall}` : '0'}</span><span> / </span><span className="text-blue-600">{productDevSurplus > 0 ? `+${productDevSurplus}` : '+0'}</span></div>
                    ) : '–'}
                    <p className="leading-none">відхилення товарів</p>
                  </div>
                  <div className="text-right">
                    {materialHasActual ? (
                      <div className="text-medium font-semibold leading-none"><span className="text-red-500">{materialDevShortfall > 0 ? `-${materialDevShortfall}` : '0'}</span><span> / </span><span className="text-blue-600">{materialDevSurplus > 0 ? `+${materialDevSurplus}` : '+0'}</span></div>
                    ) : '–'}
                    <p className="leading-none">відхилення матеріалів</p>
                  </div>
                </div>
              </div>
            </button>

            <div style={{ maxHeight: expandedSessionId === session.id ? `${contentHeights[session.id] || 0}px` : '0', opacity: expandedSessionId === session.id ? 1 : 0, overflow: 'hidden', transition: 'all 300ms ease-in-out' }} className="bg-gray-50 border-t border-gray-200">
              <div ref={(el) => { if (el) contentRefs.current[session.id] = el; }} className="p-4">
                <div className="mb-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Деталі інвентаризації #{session.id}</h3>
                    <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                      {onRefreshSessionBalances && (
                        <Button size="sm" variant="flat" color="primary" className="bg-blue-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60" isDisabled={!!loadingLoadId || !!loadingDeleteId} startContent={<DynamicIcon name="refresh-cw" className={`w-3 h-3 ${loadingRefreshId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingRefreshId(session.id); try { const report = await onRefreshSessionBalances!(session.id); setRefreshReportItems(report?.items || []); setRefreshSessionItems(session.items as any[] || []); setRefreshSessionId(session.id); setRefreshInventoryDate(formatDate(session.inventoryDate)); setIsRefreshModalOpen(true); } finally { setLoadingRefreshId(null); } }}>Оновити облікові залишки</Button>
                      )}

                      {session.status !== 'removed' && (isAdmin || canAuthorEditThisSession) && onLoadSession && (
                        <Button size="sm" variant="flat" color="primary" className="bg-blue-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60" isDisabled={!!loadingDeleteId} startContent={<DynamicIcon name={loadingLoadId !== session.id ? 'pencil' : 'loader-circle'} className={`w-3 h-3 ${loadingLoadId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingLoadId(session.id); try { await onLoadSession!(session); } finally { setLoadingLoadId(null); } }}>Редагувати</Button>
                      )}

                      {session.status === 'removed' && isAdmin && onRestoreSession && (
                        <Button size="sm" variant="flat" color="primary" className="bg-emerald-200 text-emerald-800 h-auto px-2.5 py-1.5 gap-1.5 opacity-60" isDisabled={!!loadingDeleteId} startContent={<DynamicIcon name={loadingLoadId !== session.id ? 'corner-up-left' : 'loader-circle'} className={`w-3 h-3 ${loadingLoadId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingLoadId(session.id); try { await onRestoreSession!(session.id); } finally { setLoadingLoadId(null); } }}>Відновити</Button>
                      )}

                      {isAdmin && onDeleteSession && (
                        <Button size="sm" variant="flat" color="danger" className="bg-red-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60" isDisabled={!!loadingLoadId} startContent={<DynamicIcon name={loadingDeleteId !== session.id ? 'trash-2' : 'loader-circle'} className={`w-3 h-3 ${loadingDeleteId !== session.id ? '' : 'animate-spin'}`} />} onPress={async () => { setLoadingDeleteId(session.id); try { await onDeleteSession!(session.id); } finally { setLoadingDeleteId(null); } }}>{session.status === 'removed' ? 'Видалити назавжди' : 'Видалити'}</Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap"><span>Автор: <b>{namesMap[Number(session.createdBy ?? -1)] ?? 'N/A'}</b></span><span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(session.createdAt)}</b></span><span className="border-l border-gray-300 pl-3">Кількість позицій: <b>{(products.length + materials.length + sets.length)}</b></span>{session.comment && <span className="border-l border-gray-300 pl-3">Коментар: {session.comment}</span>}</div>
                </div>

                {sets.length > 0 && (
                  <InventoryTableSection title="Комплекти" sessionId={session.id} rows={sortItems(sets, sortColumnProd, sortDirectionProd)} sortColumn={sortColumnProd} sortDirection={sortDirectionProd} onSort={(col) => handleSort(col, false)} expandedRowKey={expandedRowKey} onRowClick={handleRowClick} rowHistoryCache={rowHistoryCache} rowHistoryLoading={loadingSku} summary={{ systemTotal: setSystem, actualSum: setHasActual ? setActualSum : null, hasActual: setHasActual, devShortfall: setDevShortfall, devSurplus: setDevSurplus }} />
                )}

                {products.length > 0 && (
                  <InventoryTableSection title="Товари" sessionId={session.id} rows={sortItems(products, sortColumnProd, sortDirectionProd)} sortColumn={sortColumnProd} sortDirection={sortDirectionProd} onSort={(col) => handleSort(col, false)} expandedRowKey={expandedRowKey} onRowClick={handleRowClick} rowHistoryCache={rowHistoryCache} rowHistoryLoading={loadingSku} summary={{ systemTotal: productSystem, actualSum: productHasActual ? productActualSum : null, hasActual: productHasActual, devShortfall: productDevShortfall, devSurplus: productDevSurplus }} />
                )}

                {materials.length > 0 && (
                  <InventoryTableSection title="Матеріали" sessionId={session.id} rows={sortItems(materials, sortColumnMat, sortDirectionMat)} sortColumn={sortColumnMat} sortDirection={sortDirectionMat} onSort={(col) => handleSort(col, true)} expandedRowKey={expandedRowKey} onRowClick={handleRowClick} rowHistoryCache={rowHistoryCache} rowHistoryLoading={loadingSku} summary={{ systemTotal: materialSystem, actualSum: materialHasActual ? materialActualSum : null, hasActual: materialHasActual, devShortfall: materialDevShortfall, devSurplus: materialDevSurplus }} isMaterial />
                )}
              </div>
            </div>
          </div>
        );
      })}

      <InventoryRefreshReportModal
        isOpen={isRefreshModalOpen}
        onClose={() => { setIsRefreshModalOpen(false); setRefreshInventoryDate(null); }}
        items={refreshReportItems}
        sessionItems={refreshSessionItems}
        inventoryDate={refreshInventoryDate}
        isApplying={isApplying}
        onApply={handleApplyRefresh}
        onRefresh={onRefresh ? async () => { const maybe: any = onRefresh(); if (maybe && typeof maybe.then === 'function') await maybe; } : undefined}
      />
    </div>
  );
};

export default HistoryTable;
