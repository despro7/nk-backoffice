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

type DynamicIconName = React.ComponentProps<typeof DynamicIcon>['name'];

interface SummarySectionProps {
  title: string;
  icon: DynamicIconName;
  headerColorClass: string;
  items: InventoryProduct[];
  rowKeyPrefix: string;
}

/** Окрема таблиця підсумків для одного списку (страви або матеріали) */
const SummarySection = ({ title, icon, headerColorClass, items, rowKeyPrefix }: SummarySectionProps) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');

  const visibleItems = items.filter((p) => p.checked || totalPortions(p) !== null);

  const sortedItems = useMemo(() => {
    const mapped = visibleItems.map((item) => ({
      rowKey: `${rowKeyPrefix}-${item.id}`,
      item,
      total: totalPortions(item),
      dev: totalPortions(item) !== null ? totalPortions(item)! - item.systemBalance : null,
    }));

    mapped.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'sku':          cmp = a.item.sku.localeCompare(b.item.sku); break;
        case 'name':         cmp = a.item.name.localeCompare(b.item.name); break;
        case 'systemBalance': cmp = (a.item.systemBalance ?? 0) - (b.item.systemBalance ?? 0); break;
        case 'actual':       cmp = (a.total ?? 0) - (b.total ?? 0); break;
        case 'deviation':    cmp = (a.dev ?? 0) - (b.dev ?? 0); break;
      }
      return sortDirection === 'ascending' ? cmp : -cmp;
    });

    return mapped;
  }, [visibleItems, sortColumn, sortDirection, rowKeyPrefix]);

  // Підсумки по рядках
  const totalsRow = useMemo(() => {
    let systemTotal = 0;
    let actualTotal = 0;
    let negDev = 0;
    let posDev = 0;
    for (const item of visibleItems) {
      const actual = totalPortions(item);
      systemTotal += item.systemBalance;
      if (actual !== null) {
        actualTotal += actual;
        const dev = actual - item.systemBalance;
        if (dev < 0) negDev += dev;
        else if (dev > 0) posDev += dev;
      }
    }
    return { systemTotal, actualTotal, negDev, posDev };
  }, [visibleItems]);

  if (visibleItems.length === 0) return null;

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
    <div>
      {/* <h4 className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-md mb-2 ${headerColorClass}`}>
        <DynamicIcon name={icon} className="w-4 h-4" />
        {title}
        <span className="ml-3 font-normal opacity-60 text-xs mt-0.5 mr-0.5">{visibleItems.length} {pluralize(visibleItems.length, 'позиція', 'позиції', 'позицій')}</span>
      </h4> */}
      <div className="overflow-x-auto">
        <Table
          aria-label={`${title} summary table`}
          selectionMode="none"
          removeWrapper
          classNames={{
            base: 'w-full text-sm',
            th: ['first:rounded-s-md', 'last:rounded-e-md'],
          }}
        >
          <TableHeader>
            <TableColumn key="sku" className="cursor-pointer w-24" onClick={() => handleSort('sku')}>
              <div className="flex items-center gap-2">
                SKU <DynamicIcon name={getSortIcon('sku')} className="w-4 h-4 text-gray-400" />
              </div>
            </TableColumn>
            <TableColumn key="name" className="cursor-pointer w-auto" onClick={() => handleSort('name')}>
              <div className="flex items-center gap-2">
                {title}<DynamicIcon name={getSortIcon('name')} className="w-4 h-4 text-gray-400" />
              </div>
            </TableColumn>
            <TableColumn key="systemBalance" align="center" className="cursor-pointer w-[13%]" onClick={() => handleSort('systemBalance')}>
              <div className="flex items-center justify-center gap-2">
                За обліком <DynamicIcon name={getSortIcon('systemBalance')} className="w-4 h-4 text-gray-400" />
              </div>
            </TableColumn>
            <TableColumn key="actual" align="center" className="cursor-pointer w-[13%]" onClick={() => handleSort('actual')}>
              <div className="flex items-center justify-center gap-2">
                Факт <DynamicIcon name={getSortIcon('actual')} className="w-4 h-4 text-gray-400" />
              </div>
            </TableColumn>
            <TableColumn key="deviation" align="center" className="cursor-pointer w-[13%]" onClick={() => handleSort('deviation')}>
              <div className="flex items-center justify-center gap-2">
                Відхилення <DynamicIcon name={getSortIcon('deviation')} className="w-4 h-4 text-gray-400" />
              </div>
            </TableColumn>
          </TableHeader>
          <TableBody>
            {sortedItems.map(({ rowKey, item, total, dev }) => (
              <TableRow key={rowKey}>
                <TableCell className="text-gray-600 font-mono">{item.sku}</TableCell>
                <TableCell className="text-gray-700">{item.name}</TableCell>
                <TableCell className="text-center text-gray-600">{item.systemBalance}</TableCell>
                <TableCell className="text-center font-medium">{total ?? '—'}</TableCell>
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

        {/* Рядок підсумків — поза HeroUI Table (не підтримує змішані children) */}
        <div className="grid grid-cols-[108px_1fr_13%_13%_13%] items-center border-t-1 border-gray-200 bg-gray-50 rounded-b-md py-2 text-sm font-semibold mt-0.5">
          <span />
          <span className="text-gray-500 text-xs uppercase tracking-wide">Разом</span>
          <span className="text-center text-gray-700">{totalsRow.systemTotal}</span>
          <span className="text-center text-gray-700">{totalsRow.actualTotal}</span>
          <span className="text-center">
            {totalsRow.negDev === 0 && totalsRow.posDev === 0 ? (
              <span className="text-green-600">0</span>
            ) : (
              <span className="inline-flex items-center justify-center gap-1">
                {totalsRow.negDev !== 0 && <span className="text-red-500">{totalsRow.negDev}</span>}
                {totalsRow.negDev !== 0 && totalsRow.posDev !== 0 && <span className="text-gray-300">/</span>}
                {totalsRow.posDev !== 0 && <span className="text-blue-600">+{totalsRow.posDev}</span>}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

interface InventorySummaryTableProps {
  products: InventoryProduct[];
  materials: InventoryProduct[];
}

export const InventorySummaryTable = ({ products, materials }: InventorySummaryTableProps) => {
  const hasProducts = products.some((p) => p.checked || totalPortions(p) !== null);
  const hasMaterials = materials.some((m) => m.checked || totalPortions(m) !== null);

  if (!hasProducts && !hasMaterials) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-6">
      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
        <DynamicIcon name="bar-chart-2" className="w-4 h-4" />
        Підсумок
      </h3>

      <SummarySection
        title="Страви"
        icon="utensils"
        headerColorClass="bg-blue-50 text-blue-900"
        items={products}
        rowKeyPrefix="product"
      />

      <SummarySection
        title="Матеріали"
        icon="box"
        headerColorClass="bg-amber-50 text-amber-900"
        items={materials}
        rowKeyPrefix="material"
      />
    </div>
  );
};
