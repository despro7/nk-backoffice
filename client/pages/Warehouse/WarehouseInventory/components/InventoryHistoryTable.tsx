import { useState, useRef, useEffect, Fragment } from 'react';
import { Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, formatRelativeDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import type { InventorySession, ProductHistoryEntry } from '../WarehouseInventoryTypes';
import { statusLabel, statusColor, totalPortions } from '../WarehouseInventoryUtils';
import { ToastService } from '@/services/ToastService';

// ---------------------------------------------------------------------------
// HistoryTable — список інвентаризацій як акордеон з двома таблицями: Товари / Матеріали
// ---------------------------------------------------------------------------

interface HistoryTableProps {
  sessions: InventorySession[];
  onLoadSession?: (session: InventorySession) => Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  // Called to refresh system balances for the session date. Should return
  // a report object with an `items` array describing changes (before/after).
  onRefreshSessionBalances?: (sessionId: string) => Promise<{ items?: Array<any> } | null>;
  onRefresh?: () => void;
}

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation';
type SortDirection = 'ascending' | 'descending';

export const HistoryTable = ({ sessions, onLoadSession, onDeleteSession, onRefreshSessionBalances, onRefresh }: HistoryTableProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const currentUserId = user?.id ? String(user.id) : null;
  const latestOwnSessionId = currentUserId
    ? sessions.find((s) => String(s.createdBy) === currentUserId)?.id ?? null
    : null;
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
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshReportItems, setRefreshReportItems] = useState<Array<any>>([]);
  const [refreshInventoryDate, setRefreshInventoryDate] = useState<string | null>(null);
  const [refreshSessionItems, setRefreshSessionItems] = useState<any[]>([]);
  const [refreshSessionId, setRefreshSessionId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [sortColumnModal, setSortColumnModal] = useState<'sku' | 'name' | 'before' | 'after' | 'delta'>('name');
  const [sortDirectionModal, setSortDirectionModal] = useState<SortDirection>('ascending');
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [rowHistoryCache, setRowHistoryCache] = useState<Record<string, ProductHistoryEntry[]>>({});
  const [rowHistoryLoading, setRowHistoryLoading] = useState<string | null>(null);

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
      if (sortColumnMat === column) {
        setSortDirectionMat(sortDirectionMat === 'ascending' ? 'descending' : 'ascending');
      } else {
        setSortColumnMat(column);
        setSortDirectionMat('ascending');
      }
    } else {
      if (sortColumnProd === column) {
        setSortDirectionProd(sortDirectionProd === 'ascending' ? 'descending' : 'ascending');
      } else {
        setSortColumnProd(column);
        setSortDirectionProd('ascending');
      }
    }
  };

  const getSortIcon = (column: SortColumn, forMaterials = false) => {
    if (forMaterials) {
      if (sortColumnMat !== column) return 'arrow-up-down';
      return sortDirectionMat === 'ascending' ? 'arrow-up' : 'arrow-down';
    }
    if (sortColumnProd !== column) return 'arrow-up-down';
    return sortDirectionProd === 'ascending' ? 'arrow-up' : 'arrow-down';
  };

  const getSortIconModal = (column: 'sku' | 'name' | 'before' | 'after' | 'delta') => {
    if (sortColumnModal !== column) return 'arrow-up-down';
    return sortDirectionModal === 'ascending' ? 'arrow-up' : 'arrow-down';
  };

  const handleSortModal = (column: 'sku' | 'name' | 'before' | 'after' | 'delta') => {
    if (sortColumnModal === column) {
      setSortDirectionModal(sortDirectionModal === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumnModal(column);
      setSortDirectionModal('ascending');
    }
  };

  const getSessionItems = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return { products: [] as any[], materials: [] as any[] };
    const items: any[] = s.items as any[];
    const materials = items.filter((it) => it.type === 'material');
    const products = items.filter((it) => it.type !== 'material');
    return { products, materials };
  };

  const formatCompact = (total: number | null | undefined, portionsPerBox: number | null | undefined, sessionItem?: any): any => {
    if (total === null || total === undefined) return '–';
    if (!portionsPerBox || portionsPerBox <= 0) return String(total);
    if (sessionItem && sessionItem.boxCount !== undefined && sessionItem.boxCount !== null) {
      const bc = sessionItem.boxCount ?? 0;
      const ac = sessionItem.actualCount ?? 0;
      return (
        <>
          {total} <span className="text-gray-500 text-xs">({bc}/{ac})</span>
        </>
      );
    }
    const boxes = Math.floor(Number(total) / portionsPerBox);
    const rest = Number(total) % portionsPerBox;
    return (
      <>
        {total} <span className="text-gray-500 text-xs">({boxes}/{rest})</span>
      </>
    );
  };

  const sortItems = (items: any[], column: SortColumn, dir: SortDirection) => {
    const list = [...items].map((item) => ({
      item,
      total: totalPortions(item),
      dev: totalPortions(item) !== null ? totalPortions(item)! - item.systemBalance : null,
    }));

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

  const handleRowClick = async (sessionId: string, sku: string): Promise<void> => {
    const key = `${sessionId}-${sku}`;
    if (expandedRowKey === key) {
      setExpandedRowKey(null);
      return;
    }
    setExpandedRowKey(key);
    if (!rowHistoryCache[sku]) {
      setRowHistoryLoading(sku);
      try {
        const res = await fetch(`/api/warehouse/inventory/product-history?sku=${encodeURIComponent(sku)}&days=21`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { sku: string; entries: ProductHistoryEntry[] } = await res.json();
        setRowHistoryCache((prev) => ({ ...prev, [sku]: data.entries ?? [] }));
      } catch {
        setRowHistoryCache((prev) => ({ ...prev, [sku]: [] }));
      } finally {
        setRowHistoryLoading(null);
      }
    }
  };

  useEffect(() => {
    if (expandedSessionId && contentRefs.current[expandedSessionId]) {
      const h = contentRefs.current[expandedSessionId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedSessionId]: h }));
    }
  }, [expandedSessionId, sortColumnProd, sortDirectionProd, sortColumnMat, sortDirectionMat, expandedRowKey, rowHistoryCache]);

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const canAuthorEditThisSession = !isAdmin
          && currentUserId !== null
          && String(session.createdBy) === currentUserId
          && latestOwnSessionId !== null
          && String(session.id) === String(latestOwnSessionId);
        const { products, materials } = getSessionItems(session.id);
        const productSystem = products.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
        const materialSystem = materials.reduce((s, it) => s + (it.systemBalance ?? 0), 0);
        const productActualSum = products.reduce((s, it) => s + ((totalPortions(it) ?? 0)), 0);
        const materialActualSum = materials.reduce((s, it) => s + ((totalPortions(it) ?? 0)), 0);
        const productDev = products.reduce((s, it) => s + ((totalPortions(it) ?? 0) - (it.systemBalance ?? 0)), 0);
        const materialDev = materials.reduce((s, it) => s + ((totalPortions(it) ?? 0) - (it.systemBalance ?? 0)), 0);
        const productDevShortfall = products.reduce((s, it) => {
          const total = totalPortions(it);
          const system = it.systemBalance ?? 0;
          return s + (total !== null && total < system ? system - total : 0);
        }, 0);
        const productDevSurplus = products.reduce((s, it) => {
          const total = totalPortions(it);
          const system = it.systemBalance ?? 0;
          return s + (total !== null && total > system ? total - system : 0);
        }, 0);
        const materialDevShortfall = materials.reduce((s, it) => {
          const total = totalPortions(it);
          const system = it.systemBalance ?? 0;
          return s + (total !== null && total < system ? system - total : 0);
        }, 0);
        const materialDevSurplus = materials.reduce((s, it) => {
          const total = totalPortions(it);
          const system = it.systemBalance ?? 0;
          return s + (total !== null && total > system ? total - system : 0);
        }, 0);
        const productHasActual = products.some((it) => totalPortions(it) !== null);
        const materialHasActual = materials.some((it) => totalPortions(it) !== null);

        return (
          <div key={session.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors"
              onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
            >
              <div className="flex items-center gap-2 flex-1">
                <DynamicIcon name="chevron-right" className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expandedSessionId === session.id ? 'rotate-90' : ''}`} />
                <div className="text-left pr-2">
                  <p className="text-sm font-medium text-gray-700 tabular-nums">{formatDate(session.inventoryDate)}</p>
                </div>
                <Chip size="sm" color={statusColor[session.status]} variant="flat">{statusLabel[session.status]}</Chip>
              </div>

              <div className="flex items-center gap-4">
                <div className="grid grid-cols-2 w-90 gap-8 ml-2 text-xs text-gray-500">
                  {/* <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{`${productSystem} / ${materialSystem}`}</span>
                    <p className="leading-none">за обліком</p>
                  </div>
                  <div className="text-right">
                    <span className="text-medium font-semibold leading-none">{`${productHasActual ? productActualSum : '–'} / ${materialHasActual ? materialActualSum : '–'}`}</span>
                    <p className="leading-none">фактично</p>
                  </div> */}
                  <div className="text-right">
                    {productHasActual ? (
                      <div className="text-medium font-semibold leading-none">
                        <span className="text-red-500">{productDevShortfall > 0 ? `-${productDevShortfall}` : '0'}</span>
                        <span> / </span>
                        <span className="text-blue-600">{productDevSurplus > 0 ? `+${productDevSurplus}` : '+0'}</span>
                      </div>
                    ) : '–'}
                    <p className="leading-none">відхилення товарів</p>
                  </div>
                  <div className="text-right">
                    {materialHasActual ? (
                      <div className="text-medium font-semibold leading-none">
                        <span className="text-red-500">{materialDevShortfall > 0 ? `-${materialDevShortfall}` : '0'}</span>
                        <span> / </span>
                        <span className="text-blue-600">{materialDevSurplus > 0 ? `+${materialDevSurplus}` : '+0'}</span>
                      </div>
                    ) : '–'}
                    <p className="leading-none">відхилення матеріалів</p>
                  </div>
                </div>
              </div>
            </button>

            <div
              style={{
                maxHeight: expandedSessionId === session.id ? `${contentHeights[session.id] || 0}px` : '0',
                opacity: expandedSessionId === session.id ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 300ms ease-in-out',
              }}
              className="bg-gray-50 border-t border-gray-200"
            >
              <div
                ref={(el) => { if (el) contentRefs.current[session.id] = el; }}
                className="p-4"
              >
                <div className="mb-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Деталі інвентаризації #{session.id}</h3>
                    <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                      {/* Refresh balances - available for all users */}
                      {onRefreshSessionBalances && (
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          className="bg-blue-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60"
                          isDisabled={!!loadingLoadId || !!loadingDeleteId}
                          startContent={<DynamicIcon name="refresh-cw" className={`w-3 h-3 ${loadingRefreshId !== session.id ? '' : 'animate-spin'}`} />}
                          onPress={async () => {
                            setLoadingRefreshId(session.id);
                            try {
                              const report = await onRefreshSessionBalances!(session.id);
                              setRefreshReportItems(report?.items || []);
                              setRefreshSessionItems(session.items as any[] || []);
                              setRefreshSessionId(session.id);
                              setRefreshInventoryDate(formatDate(session.inventoryDate));
                              setIsRefreshModalOpen(true);
                            } finally {
                              setLoadingRefreshId(null);
                            }
                          }}
                        >
                          Оновити облікові залишки
                        </Button>
                      )}

                      {(isAdmin || canAuthorEditThisSession) && onLoadSession && (
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          className="bg-blue-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60"
                          isLoading={loadingLoadId === session.id}
                          isDisabled={!!loadingDeleteId}
                          startContent={loadingLoadId !== session.id ? <DynamicIcon name="pencil" className="w-3 h-3" /> : undefined}
                          onPress={async () => { setLoadingLoadId(session.id); try { await onLoadSession!(session); } finally { setLoadingLoadId(null); } }}
                        >
                          Редагувати
                        </Button>
                      )}
                      {isAdmin && onDeleteSession && (
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          className="bg-red-200 h-auto px-2.5 py-1.5 gap-1.5 opacity-60"
                          isLoading={loadingDeleteId === session.id}
                          isDisabled={!!loadingLoadId}
                          startContent={loadingDeleteId !== session.id ? <DynamicIcon name="trash-2" className="w-3 h-3" /> : undefined}
                          onPress={async () => { setLoadingDeleteId(session.id); try { await onDeleteSession!(session.id); } finally { setLoadingDeleteId(null); } }}
                        >
                          Видалити
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
                    <span>Автор: <b>{session.createdByName || 'N/A'}</b></span>
                    <span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(session.createdAt)}</b></span>
                    <span className="border-l border-gray-300 pl-3">Кількість позицій: <b>{(products.length + materials.length)}</b></span>
                    {session.comment && <span className="border-l border-gray-300 pl-3">Коментар: {session.comment}</span>}
                  </div>
                </div>

                {/* Products table */}
                {products.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 bg-gray-50 justify-between px-3 py-2 rounded-t-md border-1 border-b-0 border-gray-200">
                      <h4 className="text-md font-medium text-gray-700">Товари</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm bg-white border-1 border-gray-200">
                        <thead>
                          <tr className="border-b border-gray-200  bg-gray-100">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('sku', false)}>
                              <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name', false)}>
                              <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100">
                              <div className="flex items-center justify-center gap-1">Порцій в коробці</div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('systemBalance', false)}>
                              <div className="flex items-center justify-center gap-1">За обліком <DynamicIcon name={getSortIcon('systemBalance', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('actual', false)}>
                              <div className="flex items-center justify-center gap-1">Факт <DynamicIcon name={getSortIcon('actual', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('deviation', false)}>
                              <div className="flex items-center justify-center gap-1">Відхилення <DynamicIcon name={getSortIcon('deviation', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortItems(products, sortColumnProd, sortDirectionProd).map(({ item, total, dev }, idx) => {
                            const rowKey = `${session.id}-${item.sku}`;
                            const isRowExpanded = expandedRowKey === rowKey;
                            const historyEntries = rowHistoryCache[item.sku];
                            const isRowLoading = rowHistoryLoading === item.sku;
                            return (
                              <Fragment key={`${session.id}-prod-${idx}`}>
                                <tr
                                  className="border-b not-last:border-b-gray-100 hover:bg-blue-50/30 text-gray-700 transition-colors cursor-pointer select-none"
                                  onClick={() => handleRowClick(session.id, item.sku)}
                                >
                                  <td className="py-2 px-3 font-mono">
                                    <div className="flex items-center gap-1">
                                      <DynamicIcon name="chevron-right" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isRowExpanded ? 'rotate-90' : ''}`} />
                                      {item.sku}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">{item.name}</td>
                                  <td className="py-2 px-3 text-center">{item.portionsPerBox ?? '–'}</td>
                                  <td className="py-2 px-3 text-center">{item.unit === 'portions' ? formatCompact(item.systemBalance, item.portionsPerBox) : item.systemBalance}</td>
                                  <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{total === null ? '–' : (item.unit === 'portions' ? formatCompact(total, item.portionsPerBox, item) : String(total))}</td>
                                  <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{dev === null ? '–' : (<span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>{dev > 0 ? '+' : ''} {dev}</span>)}</td>
                                </tr>
                                {isRowExpanded && (
                                  <tr>
                                    <td colSpan={6} className="p-0 bg-blue-50/60 border-b border-blue-100">
                                      <div className="px-2 py-2">
                                        {isRowLoading ? (
                                          <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                                            <DynamicIcon name="loader-2" className="w-3 h-3 animate-spin" />
                                            Завантаження...
                                          </div>
                                        ) : !historyEntries || historyEntries.length === 0 ? (
                                          <p className="text-xs text-gray-400 py-1">Немає даних інвентаризацій за останні 30 днів</p>
                                        ) : (
                                          <table className="w-[90.5%] text-xs ml-auto">
                                            <thead>
                                              <tr className="text-gray-500 border-b border-blue-100">
                                                <th className="text-left py-1 pr-4 font-medium">Дата</th>
                                                <th className="text-center py-1 px-2 font-medium w-[13.8%]">Відвантаження</th>
                                                <th className="text-center py-1 px-2 font-medium w-[13.8%]">Повернення</th>
                                                <th className="text-center py-1 px-2 font-medium w-[13.8%]">Списання</th>
                                                <th className="text-center py-1 px-2 font-medium w-[13.8%]">За обліком</th>
                                                <th className="text-center py-1 px-2 font-medium w-[13.8%]">Факт</th>
                                                <th className="text-center py-1 px-2 font-medium w-[13.8%]">Відхилення</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-blue-50">
                                              {historyEntries.map((entry) => (
                                                <tr key={entry.sessionId} className='tabular-nums text-gray-600 hover:bg-white/40'>
                                                  <td className="py-0.5 pr-4">{formatRelativeDate(entry.date, {showTime: false, maxRelativeDays: 30, maxRelativeHours: 24, includeWeekdays: true, shortWeekday: true })}</td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.shipped == null ? '–' : (
                                                      <span className="text-red-600 font-medium">-{Math.abs(entry.shipped)}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.returned == null ? '–' : (
                                                      <span className="text-green-600 font-medium">+{Math.abs(entry.returned)}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.writtenOff == null ? '–' : (
                                                      <span className="text-red-500 font-medium">-{Math.abs(entry.writtenOff)}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-0.5 px-2 text-center">{entry.systemBalance ?? '–'}</td>
                                                  <td className="py-0.5 px-2 text-center">{entry.actual ?? '–'}</td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.deviation === null ? (
                                                      <span className="text-gray-300">–</span>
                                                    ) : (
                                                      <span className={`font-semibold ${entry.deviation === 0 ? 'text-green-600' : entry.deviation < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                                        {entry.deviation > 0 ? '+' : ''}{entry.deviation}
                                                      </span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                          <tr className="bg-gray-100/60">
                            <td></td>
                            <td></td>
                            <td className="text-center font-semibold py-2">-</td>
                            <td className="text-center font-semibold py-2">{productSystem}</td>
                            <td className="text-center font-semibold py-2">{productHasActual ? productActualSum : '–'}</td>
                            <td className="text-center font-semibold py-2">
                              {productHasActual ? (
                                <>
                                  <span className="text-red-500">{productDevShortfall > 0 ? `-${productDevShortfall}` : '0'}</span>
                                  <span> / </span>
                                  <span className="text-blue-600">{productDevSurplus > 0 ? `+${productDevSurplus}` : '+0'}</span>
                                </>
                              ) : '–'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Materials table */}
                {materials.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 bg-gray-50 justify-between px-3 py-2 rounded-t-md border-1 border-b-0 border-gray-200">
                      <h4 className="text-md font-medium text-gray-700">Матеріали</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm bg-white border-1 border-gray-200">
                        <thead>
                          <tr className="bg-gray-100 border-b">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('sku', true)}>
                              <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name', true)}>
                              <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100">
                              <div className="flex items-center justify-center gap-1">Порцій в коробці</div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('systemBalance', true)}>
                              <div className="flex items-center justify-center gap-1">За обліком <DynamicIcon name={getSortIcon('systemBalance', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('actual', true)}>
                              <div className="flex items-center justify-center gap-1">Факт <DynamicIcon name={getSortIcon('actual', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('deviation', true)}>
                              <div className="flex items-center justify-center gap-1">Відхилення <DynamicIcon name={getSortIcon('deviation', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortItems(materials, sortColumnMat, sortDirectionMat).map(({ item, total, dev }, idx) => {
                            const rowKey = `${session.id}-${item.sku}`;
                            const isRowExpanded = expandedRowKey === rowKey;
                            const historyEntries = rowHistoryCache[item.sku];
                            const isRowLoading = rowHistoryLoading === item.sku;
                            return (
                              <Fragment key={`${session.id}-mat-${idx}`}>
                                <tr
                                  className="border-b not-last:border-b-gray-100 hover:bg-blue-50/30 text-gray-700 transition-colors cursor-pointer select-none"
                                  onClick={() => handleRowClick(session.id, item.sku)}
                                >
                                  <td className="py-2 px-3 font-mono">
                                    <div className="flex items-center gap-1">
                                      <DynamicIcon name="chevron-right" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isRowExpanded ? 'rotate-90' : ''}`} />
                                      {item.sku}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">{item.name}</td>
                                  <td className="py-2 px-3 text-center">{item.portionsPerBox ?? '–'}</td>
                                  <td className="py-2 px-3 text-center">{item.unit === 'portions' ? formatCompact(item.systemBalance, item.portionsPerBox) : item.systemBalance}</td>
                                  <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{total === null ? '–' : (item.unit === 'portions' ? formatCompact(total, item.portionsPerBox, item) : String(total))}</td>
                                  <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{dev === null ? '–' : (<span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>{dev > 0 ? '+' : ''} {dev}</span>)}</td>
                                </tr>
                                {isRowExpanded && (
                                  <tr>
                                    <td colSpan={6} className="p-0 bg-blue-50/40 border-b border-blue-100">
                                      <div className="px-6 py-2">
                                        {isRowLoading ? (
                                          <div className="flex items-center gap-2 py-1 text-xs text-gray-500">
                                            <DynamicIcon name="loader-2" className="w-3 h-3 animate-spin" />
                                            Завантаження...
                                          </div>
                                        ) : !historyEntries || historyEntries.length === 0 ? (
                                          <p className="text-xs text-gray-400 py-1">Немає даних інвентаризацій за останні 30 днів</p>
                                        ) : (
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="text-gray-500 border-b border-blue-100">
                                                <th className="text-left py-1 pr-4 font-medium">Дата</th>
                                                <th className="text-center py-1 px-2 font-medium">Відвантаження</th>
                                                <th className="text-center py-1 px-2 font-medium">Повернення</th>
                                                <th className="text-center py-1 px-2 font-medium">Списання</th>
                                                <th className="text-center py-1 px-2 font-medium">За обліком</th>
                                                <th className="text-center py-1 px-2 font-medium">Факт</th>
                                                <th className="text-center py-1 px-2 font-medium">Відхилення</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {historyEntries.map((entry) => (
                                                <tr key={entry.sessionId} className={String(entry.sessionId) === session.id ? 'font-semibold text-gray-800' : 'text-gray-600'}>
                                                  <td className="py-0.5 pr-4">{formatDate(entry.date)}</td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.shipped == null ? '–' : (
                                                      <span className="text-red-600 font-medium">-{Math.abs(entry.shipped)}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.returned == null ? '–' : (
                                                      <span className="text-green-600 font-medium">+{Math.abs(entry.returned)}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.writtenOff == null ? '–' : (
                                                      <span className="text-red-500 font-medium">-{Math.abs(entry.writtenOff)}</span>
                                                    )}
                                                  </td>
                                                  <td className="py-0.5 px-2 text-center">{entry.systemBalance ?? '–'}</td>
                                                  <td className="py-0.5 px-2 text-center">{entry.actual ?? '–'}</td>
                                                  <td className="py-0.5 px-2 text-center">
                                                    {entry.deviation === null ? (
                                                      <span className="text-gray-300">–</span>
                                                    ) : (
                                                      <span className={`font-semibold ${entry.deviation === 0 ? 'text-green-600' : entry.deviation < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                                        {entry.deviation > 0 ? '+' : ''}{entry.deviation}
                                                      </span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                          <tr className="bg-gray-100/60">
                            <td></td>
                            <td></td>
                            <td className="text-center font-semibold py-2">-</td>
                            <td className="text-center font-semibold py-2">{materialSystem}</td>
                            <td className="text-center font-semibold py-2">{materialHasActual ? materialActualSum : '–'}</td>
                            <td className="text-center font-semibold py-2">
                              {materialHasActual ? (
                                <>
                                  <span className="text-red-500">{materialDevShortfall > 0 ? `-${materialDevShortfall}` : '0'}</span>
                                  <span> / </span>
                                  <span className="text-blue-600">{materialDevSurplus > 0 ? `+${materialDevSurplus}` : '+0'}</span>
                                </>
                              ) : '–'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })}
      {/* Refresh report modal */}
      <Modal isOpen={isRefreshModalOpen} scrollBehavior="inside" isDismissable={false} onClose={() => { setIsRefreshModalOpen(false); setRefreshInventoryDate(null); }} size="5xl">
        <ModalContent>
          <ModalHeader>Звіт оновлення залишків на {refreshInventoryDate ?? '—'}</ModalHeader>
          <ModalBody>
            {refreshReportItems.length === 0 ? (
              <p className="text-sm text-gray-600">Нічого не змінено.</p>
            ) : (
              <div className="space-y-4">
                {/* Products */}
                {refreshReportItems.filter((it) => it.type !== 'material').length > 0 && (
                  <div>
                    <h4 className="text-md font-medium text-gray-700 mb-2">Товари</h4>
                    <div className="overflow-x-auto mb-2">
                      <table className="w-full text-sm bg-white border-1 border-gray-200">
                        <thead>
                          <tr className="bg-gray-100 border-b">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('sku', false)}>
                              <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('name', false)}>
                              <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('systemBalance', false)}>
                              <div className="flex items-center justify-center gap-1">Було <DynamicIcon name={getSortIcon('systemBalance', false)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Стало</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Δ</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Факт</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Відх.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {refreshReportItems.filter((it) => it.type !== 'material').sort((a, b) => {
                            const dir = sortDirectionProd === 'ascending' ? 1 : -1;
                            switch (sortColumnProd) {
                              case 'sku': return dir * String((a.sku ?? '')).localeCompare(String(b.sku ?? ''));
                              case 'name': return dir * String((a.name ?? '')).localeCompare(String(b.name ?? ''));
                              case 'systemBalance': return dir * ((a.before ?? 0) - (b.before ?? 0));
                              case 'actual': return 0;
                              case 'deviation': return 0;
                              default: return 0;
                            }
                          }).map((it, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-100/80">
                              <td className="py-2 px-3 font-mono">{it.sku}</td>
                              <td className="py-2 px-3">{it.name || ''}</td>
                              <td className="py-2 px-3 text-center">{(() => {
                                const sessionItem = refreshSessionItems.find((si) => si.sku === it.sku);
                                if (sessionItem && sessionItem.unit === 'portions') return formatCompact(it.before, sessionItem.portionsPerBox, sessionItem);
                                return it.before ?? '–';
                              })()}</td>
                              <td className="py-2 px-3 text-center">{it.after ?? '–'}</td>
                              <td className={`py-2 px-3 text-center font-semibold ${((it.after ?? 0) - (it.before ?? 0)) === 0 ? 'text-gray-600' : ((it.after ?? 0) - (it.before ?? 0)) > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                {(it.after ?? 0) - (it.before ?? 0) > 0 ? `+${(it.after ?? 0) - (it.before ?? 0)}` : `${(it.after ?? 0) - (it.before ?? 0)}`}
                              </td>
                              {/* Факт з сесії */}
                              {(() => {
                                const sessionItem = refreshSessionItems.find((si) => si.sku === it.sku);
                                const fact = sessionItem ? totalPortions(sessionItem) : null;
                                const deltaFact = fact === null ? null : (fact - (it.after ?? 0));
                                return (
                                  <>
                                    <td className={`py-2 px-3 text-center ${fact === null ? 'text-gray-300' : ''}`}>{fact === null ? '–' : (sessionItem && sessionItem.unit === 'portions' ? formatCompact(fact, sessionItem.portionsPerBox, sessionItem) : String(fact))}</td>
                                    <td className={`py-2 px-3 text-center font-semibold ${deltaFact === null || deltaFact === 0 ? 'text-gray-600' : deltaFact > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                      {deltaFact === null ? '–' : (deltaFact > 0 ? `+${deltaFact}` : `${deltaFact}`)}
                                    </td>
                                  </>
                                );
                              })()}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Materials */}
                {refreshReportItems.filter((it) => it.type === 'material').length > 0 && (
                  <div>
                    <h4 className="text-md font-medium text-gray-700 mb-2">Матеріали</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm bg-white border-1 border-gray-200">
                        <thead>
                          <tr className="bg-gray-100 border-b">
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('sku', true)}>
                              <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('name', true)}>
                              <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => handleSort('systemBalance', true)}>
                              <div className="flex items-center justify-center gap-1">Було <DynamicIcon name={getSortIcon('systemBalance', true)} className="w-3 h-3 text-gray-400 inline" /></div>
                            </th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Стало</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Δ</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Факт</th>
                            <th className="text-center py-2 px-3 font-semibold text-gray-600">Відх.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {refreshReportItems.filter((it) => it.type === 'material').sort((a, b) => {
                            const dir = sortDirectionMat === 'ascending' ? 1 : -1;
                            switch (sortColumnMat) {
                              case 'sku': return dir * String((a.sku ?? '')).localeCompare(String(b.sku ?? ''));
                              case 'name': return dir * String((a.name ?? '')).localeCompare(String(b.name ?? ''));
                              case 'systemBalance': return dir * ((a.before ?? 0) - (b.before ?? 0));
                              case 'actual': return 0;
                              case 'deviation': return 0;
                              default: return 0;
                            }
                          }).map((it, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="py-2 px-3 font-mono">{it.sku}</td>
                              <td className="py-2 px-3">{it.name || ''}</td>
                              <td className="py-2 px-3 text-center">{(() => {
                                const sessionItem = refreshSessionItems.find((si) => si.sku === it.sku);
                                if (sessionItem && sessionItem.unit === 'portions') return formatCompact(it.before, sessionItem.portionsPerBox, sessionItem);
                                return it.before ?? '–';
                              })()}</td>
                              <td className="py-2 px-3 text-center">{it.after ?? '–'}</td>
                              <td className={`py-2 px-3 text-center font-semibold ${((it.after ?? 0) - (it.before ?? 0)) === 0 ? 'text-gray-600' : ((it.after ?? 0) - (it.before ?? 0)) > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                {(it.after ?? 0) - (it.before ?? 0) > 0 ? `+${(it.after ?? 0) - (it.before ?? 0)}` : `${(it.after ?? 0) - (it.before ?? 0)}`}
                              </td>
                              {/* Факт з сесії */}
                              {(() => {
                                const sessionItem = refreshSessionItems.find((si) => si.sku === it.sku);
                                const fact = sessionItem ? totalPortions(sessionItem) : null;
                                const deltaFact = fact === null ? null : (fact - (it.after ?? 0));
                                return (
                                  <>
                                    <td className={`py-2 px-3 text-center ${fact === null ? 'text-gray-300' : ''}`}>{fact === null ? '–' : (sessionItem && sessionItem.unit === 'portions' ? formatCompact(fact, sessionItem.portionsPerBox, sessionItem) : String(fact))}</td>
                                    <td className={`py-2 px-3 text-center font-semibold ${deltaFact === null || deltaFact === 0 ? 'text-gray-600' : deltaFact > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                      {deltaFact === null ? '–' : (deltaFact > 0 ? `+${deltaFact}` : `${deltaFact}`)}
                                    </td>
                                  </>
                                );
                              })()}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <div className="flex items-center gap-2">
              <Button
                variant="solid"
                color="primary"
                isLoading={isApplying}
                isDisabled={!refreshSessionId || isApplying}
                onPress={async () => {
                  if (!refreshSessionId) return;
                  setIsApplying(true);
                  try {
                    const res = await fetch(`/api/warehouse/inventory/${refreshSessionId}/refresh-balances?apply=true`, { method: 'POST', credentials: 'include' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    if (data && data.applyScheduled) {
                      ToastService.show({ title: 'Оновлення запущено', description: 'Оновлення облікових залишків запущено у фоновому режимі', color: 'success' });
                    } else {
                      // Synchronous apply completed (or no apply requested) — refresh and wait
                      ToastService.show({ title: 'Оновлення застосовано', color: 'success' });
                      try {
                        const maybe: any = onRefresh?.();
                        if (maybe && typeof maybe.then === 'function') {
                          await maybe;
                        }
                      } catch (e) {
                        // ignore refresh errors here; user will see stale data
                      }
                    }
                    // Close modal after apply (and after refresh awaited when applicable)
                    setIsRefreshModalOpen(false);
                  } catch (err) {
                    ToastService.show({ title: 'Помилка застосування', description: err instanceof Error ? err.message : 'Не вдалося застосувати оновлення', color: 'danger' });
                  } finally {
                    setIsApplying(false);
                  }
                }}
              >
                Застосувати
              </Button>
              <Button variant="flat" color="default" onPress={() => setIsRefreshModalOpen(false)}>Скасувати</Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};
