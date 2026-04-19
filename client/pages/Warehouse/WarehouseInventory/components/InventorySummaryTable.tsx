import { useState, useMemo } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { totalPortions } from '../WarehouseInventoryUtils';
import type { InventoryProduct } from '../WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// InventorySummaryTable — підсумкова таблиця відхилень з HeroUI
// ---------------------------------------------------------------------------

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'actual' | 'deviation';
type SortDirection = 'ascending' | 'descending';

interface InventorySummaryTableProps {
  products: InventoryProduct[];
  materials: InventoryProduct[];
}

export const InventorySummaryTable = ({ products, materials }: InventorySummaryTableProps) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');

  const allItems = [
    ...products.filter((p) => p.checked || totalPortions(p) !== null),
    ...materials.filter((m) => m.checked || totalPortions(m) !== null),
  ];

  // Сортування — useMemo ОБОВ'ЯЗКОВО до будь-якого раннього return (Rules of Hooks)
  const sortedItems = useMemo(() => {
    const items = [...allItems].map((item) => ({
      item,
      total: totalPortions(item),
      dev: totalPortions(item) !== null ? totalPortions(item)! - item.systemBalance : null,
    }));

    items.sort((a, b) => {
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

    return items;
  }, [allItems, sortColumn, sortDirection]);

  if (allItems.length === 0) return null;

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

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <DynamicIcon name="bar-chart-2" className="w-4 h-4" />
        Підсумок
      </h3>
      <div className="overflow-x-auto">
        <Table
          aria-label="Inventory summary table"
          selectionMode="none"
          removeWrapper
          classNames={{ 
            base: "w-full text-sm",
              th: ["first:rounded-s-md", "last:rounded-e-md"],
          }}
        >
          <TableHeader>
            <TableColumn
              key="sku"
              className="cursor-pointer"
              onClick={() => handleSort('sku')}
            >
              <div className="flex items-center gap-2">
                SKU
                <DynamicIcon
                  name={getSortIcon('sku')}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </TableColumn>
            <TableColumn
              key="name"
              className="cursor-pointer"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center gap-2">
                Позиція
                <DynamicIcon
                  name={getSortIcon('name')}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </TableColumn>
            <TableColumn
              key="systemBalance"
              align="center"
              className="cursor-pointer"
              onClick={() => handleSort('systemBalance')}
            >
              <div className="flex items-center justify-center gap-2">
                За обліком
                <DynamicIcon
                  name={getSortIcon('systemBalance')}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </TableColumn>
            <TableColumn
              key="actual"
              align="center"
              className="cursor-pointer"
              onClick={() => handleSort('actual')}
            >
              <div className="flex items-center justify-center gap-2">
                Факт
                <DynamicIcon
                  name={getSortIcon('actual')}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </TableColumn>
            <TableColumn
              key="deviation"
              align="center"
              className="cursor-pointer"
              onClick={() => handleSort('deviation')}
            >
              <div className="flex items-center justify-center gap-2">
                Відхилення
                <DynamicIcon
                  name={getSortIcon('deviation')}
                  className="w-4 h-4 text-gray-400"
                />
              </div>
            </TableColumn>
          </TableHeader>
          <TableBody>
            {sortedItems.map(({ item, total, dev }) => (
              <TableRow key={item.id}>
                <TableCell className="text-gray-600 font-mono">{item.sku}</TableCell>
                <TableCell className="text-gray-700">{item.name}</TableCell>
                <TableCell className="text-center text-gray-600">{item.systemBalance}</TableCell>
                <TableCell className="text-center font-medium">
                  {total ?? '—'}
                </TableCell>
                <TableCell className="text-center">
                  {dev === null ? '—' : (
                    <span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                      {dev > 0 ? '+' : ''}{dev}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
