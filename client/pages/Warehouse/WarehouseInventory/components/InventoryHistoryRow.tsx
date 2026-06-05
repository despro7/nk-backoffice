import { Fragment } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductHistoryEntry } from '../WarehouseInventoryTypes';
import { formatRelativeDate } from '@/lib/formatUtils';
import CompactBalance from './CompactBalance';

interface InventoryHistoryRowProps {
  sessionId: string;
  item: any;
  total: number | null;
  dev: number | null; // deviation (відхилення від обліку)
  rowKey: string;
  expandedRowKey: string | null;
  rowHistoryCache: Record<string, ProductHistoryEntry[]>;
  rowHistoryLoading: string | null;
  onRowClick: (sessionId: string, sku: string) => void;
}

export const InventoryHistoryRow = ({
  sessionId,
  item,
  total,
  dev,
  rowKey,
  expandedRowKey,
  rowHistoryCache,
  rowHistoryLoading,
  onRowClick,
  
}: InventoryHistoryRowProps) => {
  const isRowExpanded = expandedRowKey === rowKey;
  const historyEntries = rowHistoryCache[item.sku];
  const isRowLoading = rowHistoryLoading === item.sku;

  return (
    <Fragment>
      <tr
        className="[&>td]:border-b [&>td]:border-b-gray-100 [&>td]:text-gray-700 [&>td]:transition-colors hover:bg-gray-100/30 cursor-pointer select-none"
        onClick={() => onRowClick(sessionId, item.sku)}
      >
        <td className="py-2 px-3 font-mono">
          <div className="flex items-center gap-1">
            <DynamicIcon
              name="chevron-right"
              className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isRowExpanded ? 'rotate-90' : ''}`}
            />
            {item.sku}
          </div>
        </td>
        <td className="py-2 px-3">{item.name}</td>
        <td className="py-2 px-3 text-center">{item.portionsPerBox ?? '–'}</td>
        <td className="py-2 px-3 text-center">{item.unit === 'portions' ? <CompactBalance total={item.systemBalance} portionsPerBox={item.portionsPerBox} /> : item.systemBalance}</td>
        <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{total === null ? '–' : (item.unit === 'portions' ? <CompactBalance total={total} portionsPerBox={item.portionsPerBox} sessionItem={item} /> : String(total))}</td>
        <td className={`py-2 px-3 text-center ${total === null ? 'text-gray-300' : ''}`}>{dev === null ? '–' : (<span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>{dev > 0 ? '+' : ''} {dev}</span>)}</td>
      </tr>
      {isRowExpanded && (
        <tr>
          <td colSpan={6} className="p-0 bg-gray-100 border-b border-gray-200/40 shadow-[inset_0_6px_10px_rgba(0,0,0,0.05)]">
            <div className="px-2 py-2">
              {isRowLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                  <DynamicIcon name="loader-2" className="w-3 h-3 animate-spin" />
                  Завантаження...
                </div>
              ) : !historyEntries || historyEntries.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">Немає даних інвентаризацій за останні 30 днів</p>
              ) : (
                <table className="w-[91%] text-xs ml-auto">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200 [&>th]:text-center [&>th]:py-1 [&>th]:px-2 [&>th]:font-semibold [&>th]:w-[13.8%]">
                      <th className="text-left! w-auto!">Дата</th>
                      <th>Відвантаження</th>
                      <th>Повернення</th>
                      <th>Списання</th>
                      <th>За обліком</th>
                      <th>Факт</th>
                      <th>Відхилення</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {historyEntries.map((entry) => (
                      <tr key={entry.sessionId} className='tabular-nums text-gray-600 hover:bg-white/40'>
                        <td className="py-0.5 px-2">{formatRelativeDate(entry.date, { showTime: false, maxRelativeDays: 30, maxRelativeHours: 24, includeWeekdays: true, shortWeekday: true })}</td>
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          {entry.shipped == null || entry.shipped === 0 ? '–' : (
                            <span className="text-red-600 font-medium">-{Math.abs(entry.shipped)}</span>
                          )}
                        </td>
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          {entry.returned == null || entry.returned === 0 ? '–' : (
                            <span className="text-green-600 font-medium">+{Math.abs(entry.returned)}</span>
                          )}
                        </td>
                        <td className="py-0.5 px-2 text-center text-gray-400">
                          {entry.writtenOff == null || entry.writtenOff === 0 ? '–' : (
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
};

export default InventoryHistoryRow;
