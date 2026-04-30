import { useState, useRef, useEffect } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import type { InventorySession } from '../WarehouseInventoryTypes';
import { statusLabel, statusColor, totalPortions } from '../WarehouseInventoryUtils';

// ---------------------------------------------------------------------------
// HistoryTable — список інвентаризацій як акордеон з двома таблицями: Товари / Матеріали
// ---------------------------------------------------------------------------

interface HistoryTableProps {
  sessions: InventorySession[];
  onLoadSession?: (session: InventorySession) => Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
}

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation';
type SortDirection = 'ascending' | 'descending';

export const HistoryTable = ({ sessions, onLoadSession, onDeleteSession }: HistoryTableProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [loadingLoadId, setLoadingLoadId] = useState<string | null>(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null);
  const [sortColumnProd, setSortColumnProd] = useState<SortColumn>('name');
  const [sortDirectionProd, setSortDirectionProd] = useState<SortDirection>('ascending');
  const [sortColumnMat, setSortColumnMat] = useState<SortColumn>('sku');
  const [sortDirectionMat, setSortDirectionMat] = useState<SortDirection>('ascending');
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const getSessionItems = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return { products: [] as any[], materials: [] as any[] };
    const items: any[] = s.items as any[];
    const materials = items.filter((it) => it.type === 'material');
    const products = items.filter((it) => it.type !== 'material');
    return { products, materials };
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

  useEffect(() => {
    if (expandedSessionId && contentRefs.current[expandedSessionId]) {
      const h = contentRefs.current[expandedSessionId]?.scrollHeight || 0;
      setContentHeights((p) => ({ ...p, [expandedSessionId]: h }));
    }
  }, [expandedSessionId, sortColumnProd, sortDirectionProd, sortColumnMat, sortDirectionMat]);

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
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
                    {isAdmin && (
                      <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                        {onLoadSession && (
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
                        {onDeleteSession && (
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
                    )}
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
                          {sortItems(products, sortColumnProd, sortDirectionProd).map(({ item, total, dev }, idx) => (
                            <tr key={`${session.id}-prod-${idx}`} className="border-b not-last:border-b-gray-100 hover:bg-white text-gray-700 transition-colors">
                              <td className="py-2 px-3 font-mono">{item.sku}</td>
                              <td className="py-2 px-3">{item.name}</td>
                              <td className="py-2 px-3 text-center">{item.systemBalance}</td>
                              <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{total ?? '–'}</td>
                              <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{dev === null ? '–' : (<span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>{dev > 0 ? '+' : ''} {dev}</span>)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-100/60">
                            <td></td>
                            <td></td>
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
                          {sortItems(materials, sortColumnMat, sortDirectionMat).map(({ item, total, dev }, idx) => (
                            <tr key={`${session.id}-mat-${idx}`} className="border-b not-last:border-b-gray-100 hover:bg-white text-gray-700 transition-colors">
                              <td className="py-2 px-3 font-mono">{item.sku}</td>
                              <td className="py-2 px-3">{item.name}</td>
                              <td className="py-2 px-3 text-center">{item.systemBalance}</td>
                              <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{total ?? '–'}</td>
                              <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{dev === null ? '–' : (<span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>{dev > 0 ? '+' : ''} {dev}</span>)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-100/60">
                            <td></td>
                            <td></td>
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
    </div>
  );
};
