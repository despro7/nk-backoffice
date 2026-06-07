import InventoryHistoryRow from './InventoryHistoryRow';
import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductHistoryEntry } from '../WarehouseInventoryTypes';

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation';
type SortDirection = 'ascending' | 'descending';

interface Summary {
  systemTotal: number;
  actualSum: number | null;
  hasActual: boolean;
  devShortfall: number;
  devSurplus: number;
}

interface Props {
  title: string;
  sessionId: string;
  rows: Array<{ item: any; total: number | null; dev: number | null }>;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (col: SortColumn) => void;
  expandedRowKey: string | null;
  onRowClick: (sessionId: string, sku: string) => void;
  rowHistoryCache: Record<string, ProductHistoryEntry[]>;
  rowHistoryLoading: string | null;
  summary: Summary;
  isMaterial?: boolean;
}

const InventoryTableSection = ({ title, sessionId, rows, sortColumn, sortDirection, onSort, expandedRowKey, onRowClick, rowHistoryCache, rowHistoryLoading, summary, isMaterial }: Props) => {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 justify-between px-3 py-2 rounded-t-md border-1 border-b-0 border-gray-200 bg-gray-200">
        <h4 className="text-md font-medium text-gray-700">{title} <Tooltip content="всього / підтверджених" placement="right"><span className="text-gray-500 text-sm font-normal">({rows.length}/{rows.filter(row => row.dev !== null).length})</span></Tooltip></h4>
      </div>
      <div className="overflow-x-auto px-1 pb-1 bg-gray-200 rounded-b-md">
        <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md text-sm bg-white border-1 border-gray-200">
          <thead>
            <tr className="border-b border-gray-200  bg-gray-100">
              <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => onSort('sku')}>
                <div className="flex items-center gap-1">SKU <DynamicIcon name={sortColumn !== 'sku' ? 'arrow-up-down' : (sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => onSort('name')}>
                <div className="flex items-center gap-1">Позиція <DynamicIcon name={sortColumn !== 'name' ? 'arrow-up-down' : (sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100">
                <div className="flex items-center justify-center gap-1">Порцій в коробці</div>
              </th>
              <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => onSort('systemBalance')}>
                <div className="flex items-center justify-center gap-1">За обліком <DynamicIcon name={sortColumn !== 'systemBalance' ? 'arrow-up-down' : (sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => onSort('actual')}>
                <div className="flex items-center justify-center gap-1">Факт <DynamicIcon name={sortColumn !== 'actual' ? 'arrow-up-down' : (sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100" onClick={() => onSort('deviation')}>
                <div className="flex items-center justify-center gap-1">Відхилення <DynamicIcon name={sortColumn !== 'deviation' ? 'arrow-up-down' : (sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, total, dev }, idx) => {
              const rowKey = `${sessionId}-${item.sku}`;
              return (
                <InventoryHistoryRow
                  key={`${sessionId}-${isMaterial ? 'mat' : 'prod'}-${idx}`}
                  sessionId={sessionId}
                  item={item}
                  total={total}
                  dev={dev}
                  rowKey={rowKey}
                  expandedRowKey={expandedRowKey}
                  rowHistoryCache={rowHistoryCache}
                  rowHistoryLoading={rowHistoryLoading}
                  onRowClick={onRowClick}
                />
              );
            })}

            <tr className="bg-gray-100/60">
              <td></td>
              <td></td>
              <td className="text-center font-semibold py-2">-</td>
              <td className="text-center font-semibold py-2">{summary.systemTotal}</td>
              <td className="text-center font-semibold py-2">{summary.hasActual ? summary.actualSum : '–'}</td>
              <td className="text-center font-semibold py-2">
                {summary.hasActual ? (
                  <>
                    <span className="text-red-500">{summary.devShortfall > 0 ? `-${summary.devShortfall}` : '0'}</span>
                    <span> / </span>
                    <span className="text-blue-600">{summary.devSurplus > 0 ? `+${summary.devSurplus}` : '+0'}</span>
                  </>
                ) : '–'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryTableSection;
