import { useState, useRef, useEffect } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import type { InventorySession } from '../WarehouseInventoryTypes';
import { statusLabel, statusColor, totalPortions } from '../WarehouseInventoryUtils';

// ---------------------------------------------------------------------------
// HistoryTable — список інвентаризацій як акордеон з плавною анімацією
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
  const [sortColumn, setSortColumn] = useState<SortColumn>('sku');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
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

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return 'arrow-up-down';
    return sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down';
  };

  const getSessionDetails = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return [];
    return session.items;
  };

  const getSortedSessionItems = (sessionId: string) => {
    const items = getSessionDetails(sessionId);
    const sorted = [...items].map((item) => ({
      item,
      total: totalPortions(item),
      dev: totalPortions(item) !== null ? totalPortions(item)! - item.systemBalance : null,
    }));

    sorted.sort((a, b) => {
      let compareResult = 0;

      switch (sortColumn) {
        case 'sku':
          compareResult = a.item.sku.localeCompare(b.item.sku);
          break;
        case 'name':
          compareResult = a.item.name.localeCompare(b.item.name);
          break;
        case 'systemBalance':
          compareResult = (a.item.systemBalance ?? 0) - (b.item.systemBalance ?? 0);
          break;
        case 'actual':
          compareResult = (a.total ?? 0) - (b.total ?? 0);
          break;
        case 'deviation':
          compareResult = (a.dev ?? 0) - (b.dev ?? 0);
          break;
      }

      return sortDirection === 'ascending' ? compareResult : -compareResult;
    });

    return sorted;
  };

  // Вимірюємо висоту контенту коли розгортаємо
  useEffect(() => {
    if (expandedSessionId && contentRefs.current[expandedSessionId]) {
      const height = contentRefs.current[expandedSessionId]?.scrollHeight || 0;
      setContentHeights((prev) => ({
        ...prev,
        [expandedSessionId]: height,
      }));
    }
  }, [expandedSessionId, sortColumn, sortDirection]);

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <div key={session.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Заголовок акордеона */}
          <button
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-100 transition-colors"
            onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
          >
            <div className="flex items-center gap-4 flex-1">
              <DynamicIcon
                name="chevron-right"
                className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expandedSessionId === session.id ? 'rotate-90' : ''}`}
              />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-700 tabular-nums">{formatDate(session.inventoryDate)}</p>
              </div>
              <div>
                <Chip size="sm" color={statusColor[session.status]} variant="flat">
                  {statusLabel[session.status]}
                </Chip>
              </div>
              {/* Кнопки дій для адміна (лише для активних/чернеткових сесій) */}
              {isAdmin && session.status !== 'completed' && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {onLoadSession && (
                    <Button
                      size="sm"
                      variant="flat"
                      color="primary"
                      className="bg-blue-200"
                      isLoading={loadingLoadId === session.id}
                      isDisabled={!!loadingDeleteId}
                      startContent={loadingLoadId !== session.id ? <DynamicIcon name="pencil" className="w-3.5 h-3.5" /> : undefined}
                      onPress={async () => {
                        setLoadingLoadId(session.id);
                        try { await onLoadSession(session); } finally { setLoadingLoadId(null); }
                      }}
                    >
                      Редагувати
                    </Button>
                  )}
                  {onDeleteSession && (
                    <Button
                      size="sm"
                      variant="flat"
                      color="danger"
                      isLoading={loadingDeleteId === session.id}
                      isDisabled={!!loadingLoadId}
                      startContent={loadingDeleteId !== session.id ? <DynamicIcon name="trash-2" className="w-3.5 h-3.5" /> : undefined}
                      onPress={async () => {
                        setLoadingDeleteId(session.id);
                        try { await onDeleteSession(session.id); } finally { setLoadingDeleteId(null); }
                      }}
                    >
                      Видалити
                    </Button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-10 ml-auto text-xs text-gray-500">
                <div className="text-left">
                  <span className="text-medium font-semibold leading-none">{getSessionDetails(session.id).reduce((sum, item) => sum + item.systemBalance, 0)}</span>
                  <p className="leading-none">за обліком</p>
                </div>
                <div className="text-left">
                  <span className="text-medium font-semibold leading-none">{getSessionDetails(session.id).reduce((sum, item) => sum + (totalPortions(item) ?? 0), 0)}</span>
                  <p className="leading-none">фактично</p>
                </div>
                <div className="text-left">
                  <span className="text-medium font-semibold leading-none">{(() => {
                    const dev = getSessionDetails(session.id).reduce((sum, item) => {
                      const t = totalPortions(item);
                      return t !== null ? sum + (t - item.systemBalance) : sum;
                    }, 0);
                    return dev === 0
                      ? <span className="text-green-600">0</span>
                      : dev > 0
                        ? <span className="text-blue-600">+{dev}</span>
                        : <span className="text-red-500">{dev}</span>;
                    })()}
                  </span>
                  <p className="leading-none">відхилення</p>
                </div>
              </div>
            </div>
          </button>

          {/* Вміст акордеона — деталі сесії */}
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
              ref={(el) => {
                if (el) contentRefs.current[session.id] = el;
              }}
              className="p-4"
            >
              <div className="mb-4">
                <h3 className="text-md font-semibold text-gray-700 mb-2">Деталі інвентаризації #{session.id}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Автор: <b>{session.createdByName || 'N/A'}</b></span>
                  <span className="border-l border-gray-300 pl-3">Дата створення: <b>{formatDate(session.createdAt)}</b></span>
                  <span className="border-l border-gray-300 pl-3">Кількість позицій: <b>{getSessionDetails(session.id).length}</b></span>
                  {session.comment && <span className="border-l border-gray-300 pl-3">Коментар: {session.comment}</span>}
                </div>
              </div>

              {/* Таблиця позицій */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white border-b border-gray-200">
                      <th
                        className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('sku')}
                      >
                        <div className="flex items-center gap-1">
                          SKU
                          <DynamicIcon
                            name={getSortIcon('sku')}
                            className="w-3 h-3 text-gray-400 inline"
                          />
                        </div>
                      </th>
                      <th
                        className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          Позиція
                          <DynamicIcon
                            name={getSortIcon('name')}
                            className="w-3 h-3 text-gray-400 inline"
                          />
                        </div>
                      </th>
                      <th
                        className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('systemBalance')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          За обліком
                          <DynamicIcon
                            name={getSortIcon('systemBalance')}
                            className="w-3 h-3 text-gray-400 inline"
                          />
                        </div>
                      </th>
                      <th
                        className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('actual')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Факт
                          <DynamicIcon
                            name={getSortIcon('actual')}
                            className="w-3 h-3 text-gray-400 inline"
                          />
                        </div>
                      </th>
                      <th
                        className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('deviation')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Відхилення
                          <DynamicIcon
                            name={getSortIcon('deviation')}
                            className="w-3 h-3 text-gray-400 inline"
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedSessionItems(session.id).map(({ item, total, dev }, idx) => (
                      <tr key={`${session.id}-item-${idx}`} className="border-b border-gray-100 hover:bg-white text-gray-700 transition-colors">
                        <td className="py-2 px-3 font-mono">{item.sku}</td>
                        <td className="py-2 px-3">{item.name}</td>
                        <td className="py-2 px-3 text-center">{item.systemBalance}</td>
                        <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>
                          {total ?? '–'}
                        </td>
                        <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>
                          {dev === null ? '–' : (
                            <span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                              {dev > 0 ? '+' : ''} {dev}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
