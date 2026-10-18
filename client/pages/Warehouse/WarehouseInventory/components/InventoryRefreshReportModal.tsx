import { useMemo, useState } from 'react';
import { Accordion, AccordionItem, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import type { InventoryWarehouseScope } from '@shared/types/inventoryWarehouse';
import {
  factTotalForWarehouseScope,
  normalizeInventoryItemsForScope,
  shouldKeepInventoryItemForScope,
} from '../WarehouseInventoryUtils';
import CompactBalance from './CompactBalance';
import { StockBadge } from '@/components/StockBadge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  sessionItems: any[];
  inventoryDate?: string | null;
  warehouseScope?: InventoryWarehouseScope | 'multi';
  isApplying?: boolean;
  onApply?: () => Promise<void>;
  onRefresh?: (() => Promise<void>) | undefined;
}

type SortColumn = 'sku' | 'name' | 'systemBalance' | 'systemBalanceAfter' | 'balanceDelta' | 'factBalance' | 'deviation';
type SortDirection = 'ascending' | 'descending';

function balanceBefore(row: any, scope: InventoryWarehouseScope): number {
  return scope === 'gp' ? (row.beforeGp ?? 0) : (row.before ?? 0);
}

function balanceAfter(row: any, scope: InventoryWarehouseScope): number {
  return scope === 'gp' ? (row.afterGp ?? 0) : (row.after ?? 0);
}

/** null завжди в кінці списку, незалежно від напрямку сортування */
function compareNullableNumber(a: number | null, b: number | null, order: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return order * (a - b);
}

function sortList(
  list: any[],
  column: SortColumn,
  dir: SortDirection,
  sessionItems: any[],
  warehouseScope: InventoryWarehouseScope | 'multi',
) {
  const effectiveScope: InventoryWarehouseScope = warehouseScope === 'multi' ? 'small' : warehouseScope;
  const order = dir === 'ascending' ? 1 : -1;
  const sessionBySku = new Map(sessionItems.map((si) => [String(si.sku), si]));

  const factFor = (row: any): number | null => {
    const sessionItem = sessionBySku.get(String(row.sku));
    return sessionItem ? factTotalForWarehouseScope(sessionItem, effectiveScope) : null;
  };

  return [...list].sort((a, b) => {
    switch (column) {
      case 'sku':
        return order * String(a.sku ?? '').localeCompare(String(b.sku ?? ''), 'uk', { numeric: true });
      case 'name':
        return order * String(a.name ?? '').localeCompare(String(b.name ?? ''), 'uk');
      case 'systemBalance':
        return order * (balanceBefore(a, effectiveScope) - balanceBefore(b, effectiveScope));
      case 'systemBalanceAfter':
        return order * (balanceAfter(a, effectiveScope) - balanceAfter(b, effectiveScope));
      case 'balanceDelta': {
        const deltaA = balanceAfter(a, effectiveScope) - balanceBefore(a, effectiveScope);
        const deltaB = balanceAfter(b, effectiveScope) - balanceBefore(b, effectiveScope);
        return order * (deltaA - deltaB);
      }
      case 'factBalance':
        return compareNullableNumber(factFor(a), factFor(b), order);
      case 'deviation': {
        const factA = factFor(a);
        const factB = factFor(b);
        const devA = factA === null ? null : factA - balanceAfter(a, effectiveScope);
        const devB = factB === null ? null : factB - balanceAfter(b, effectiveScope);
        return compareNullableNumber(devA, devB, order);
      }
      default: {
        const _exhaustive: never = column;
        return _exhaustive;
      }
    }
  });
}

function zeroOpacityClass(value: number | null | undefined): string {
  return value === 0 || value === null || value === undefined ? 'opacity-30' : '';
}

/** box/actual для tooltip факту з урахуванням складу (ГП vs МС). */
function factBreakdownSessionItem(item: any, scope: InventoryWarehouseScope): { boxCount: number | null; actualCount: number | null } | undefined {
  const boxCount = scope === 'gp' ? item.boxCountGp : item.boxCount;
  const actualCount = scope === 'gp' ? item.actualCountGp : item.actualCount;
  if (boxCount == null && actualCount == null) return undefined;
  return { boxCount, actualCount };
}

function rowAccountingDelta(row: any, warehouseScope: InventoryWarehouseScope): number {
  return balanceAfter(row, warehouseScope) - balanceBefore(row, warehouseScope);
}

export function rowsHaveAccountingChanges(rows: any[], warehouseScope: InventoryWarehouseScope | 'multi'): boolean {
  if (warehouseScope === 'multi') {
    return rows.some((row) =>
      (row.after ?? 0) !== (row.before ?? 0) || (row.afterGp ?? 0) !== (row.beforeGp ?? 0),
    );
  }
  return rows.some((row) => rowAccountingDelta(row, warehouseScope) !== 0);
}

function BalanceReportTable({
  title,
  rows,
  sessionItems,
  warehouseScope,
  sortColumn,
  sortDirection,
  onSort,
}: {
  title: string;
  rows: any[];
  sessionItems: any[];
  warehouseScope: InventoryWarehouseScope | 'multi';
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return 'arrow-up-down';
    return sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down';
  };

  if (rows.length === 0) return null;

  const effectiveScope: InventoryWarehouseScope = warehouseScope === 'multi' ? 'small' : warehouseScope;

  return (
    <div>
      <div className="overflow-x-auto mb-2">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="[&>th]:bg-gray-100 [&>th:first-child]:rounded-l-sm [&>th:last-child]:rounded-r-sm">
              <th className="w-18 text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('sku')}>
                <div className="flex items-center gap-1">SKU <DynamicIcon name={getSortIcon('sku')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="text-left py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('name')}>
                <div className="flex items-center gap-1">Позиція <DynamicIcon name={getSortIcon('name')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="w-22 text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('systemBalance')}>
                <div className="flex items-center justify-center gap-1">Було <DynamicIcon name={getSortIcon('systemBalance')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="w-22 text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('systemBalanceAfter')}>
                <div className="flex items-center justify-center gap-1">Стало <DynamicIcon name={getSortIcon('systemBalanceAfter')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="w-22 text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('balanceDelta')}>
                <div className="flex items-center justify-center gap-1">Різниця <DynamicIcon name={getSortIcon('balanceDelta')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="w-22 text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('factBalance')}>
                <div className="flex items-center justify-center gap-1">Факт <DynamicIcon name={getSortIcon('factBalance')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
              <th className="w-22 text-center py-2 px-3 font-semibold text-gray-600 cursor-pointer" onClick={() => onSort('deviation')}>
                <div className="flex items-center justify-center gap-1">Відх. <DynamicIcon name={getSortIcon('deviation')} className="w-3 h-3 text-gray-400 inline" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortList(rows, sortColumn, sortDirection, sessionItems, warehouseScope).map((it, idx) => {
              const sessionItem = sessionItems.find((si) => si.sku === it.sku);
              const fact = sessionItem ? factTotalForWarehouseScope(sessionItem, effectiveScope) : null;
              const beforeVal = balanceBefore(it, effectiveScope);
              const afterVal = balanceAfter(it, effectiveScope);
              const balanceDelta = afterVal - beforeVal;
              const deltaFact = fact === null ? null : fact - afterVal;

              return (
                <tr key={`${it.sku}-${idx}`} className="not-last:border-b border-gray-200/75 hover:bg-gray-100/80">
                  <td className="py-2 px-3 font-mono max-w-18 truncate">{it.sku}</td>
                  <td className="py-2 px-3">{it.name || ''}</td>
                  <td className={`py-2 px-3 text-center ${zeroOpacityClass(beforeVal)}`}>{(() => {
                    if (sessionItem && sessionItem.unit === 'portions') {
                      return <CompactBalance total={beforeVal} portionsPerBox={sessionItem.portionsPerBox} />;
                    }
                    return beforeVal ?? '–';
                  })()}</td>
                  <td className={`py-2 px-3 text-center ${zeroOpacityClass(afterVal)}`}>
                    {afterVal === null ? '–' : (sessionItem && sessionItem.unit === 'portions'
                      ? <CompactBalance total={afterVal} portionsPerBox={sessionItem.portionsPerBox} />
                      : String(afterVal))}
                  </td>
                  <td className={`py-2 px-3 text-center font-semibold ${balanceDelta === 0 ? 'text-gray-600 opacity-50' : balanceDelta > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {balanceDelta > 0 ? `+${balanceDelta}` : `${balanceDelta}`}
                  </td>
                  <td className={`py-2 px-3 text-center ${fact === null ? 'text-gray-300' : zeroOpacityClass(fact)}`}>
                    {fact === null ? '–' : (sessionItem && sessionItem.unit === 'portions'
                      ? (
                        <CompactBalance
                          total={fact}
                          portionsPerBox={sessionItem.portionsPerBox}
                          sessionItem={factBreakdownSessionItem(sessionItem, effectiveScope)}
                        />
                      )
                      : String(fact))}
                  </td>
                  <td className={`py-2 px-3 text-center font-semibold ${deltaFact === null || deltaFact === 0 ? 'text-gray-600 opacity-50' : deltaFact > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {deltaFact === null ? '–' : (deltaFact > 0 ? `+${deltaFact}` : `${deltaFact}`)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BalanceReportSection({
  title,
  rows,
  sessionItems,
  warehouseScope,
  sortColumn,
  sortDirection,
  onSort,
}: {
  title: string;
  rows: any[];
  sessionItems: any[];
  warehouseScope: InventoryWarehouseScope | 'multi';
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  if (rows.length === 0) return null;

  const hasAccountingChanges = rowsHaveAccountingChanges(rows, warehouseScope);

  if (hasAccountingChanges) {
    return (
      <div>
        <h4 className="text-md font-bold text-gray-700 mb-2 ml-1">{title}</h4>
        <BalanceReportTable
          title={title}
          rows={rows}
          sessionItems={sessionItems}
          warehouseScope={warehouseScope}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
    );
  }

  return (
    <Accordion variant="splitted" className="px-0">
      <AccordionItem
        key={title}
        aria-label={title}
        title={<span className="text-md font-medium text-gray-600">{title} <span className="text-sm font-normal leading-relaxed text-gray-500">(без змін облікових залишків)</span></span>}
        classNames={{ content: 'pt-0 pb-2' }}
      >
        <BalanceReportTable
          title={title}
          rows={rows}
          sessionItems={sessionItems}
          warehouseScope={warehouseScope}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </AccordionItem>
    </Accordion>
  );
}

const InventoryRefreshReportModal = ({
  isOpen,
  onClose,
  items,
  sessionItems,
  inventoryDate,
  warehouseScope = 'small',
  isApplying,
  onApply,
}: Props) => {
  const [sortColumnSets, setSortColumnSets] = useState<SortColumn>('name');
  const [sortDirectionSets, setSortDirectionSets] = useState<SortDirection>('ascending');
  const [sortColumnProd, setSortColumnProd] = useState<SortColumn>('name');
  const [sortDirectionProd, setSortDirectionProd] = useState<SortDirection>('ascending');
  const [sortColumnMat, setSortColumnMat] = useState<SortColumn>('name');
  const [sortDirectionMat, setSortDirectionMat] = useState<SortDirection>('ascending');

  const toggleSort = (
    column: SortColumn,
    current: SortColumn,
    direction: SortDirection,
    setCol: (c: SortColumn) => void,
    setDir: (d: SortDirection) => void,
  ) => {
    if (current === column) setDir(direction === 'ascending' ? 'descending' : 'ascending');
    else {
      setCol(column);
      setDir('ascending');
    }
  };

  const scopedSessionItems = useMemo(() => {
    if (warehouseScope === 'multi') return sessionItems;
    return normalizeInventoryItemsForScope(sessionItems as any[], warehouseScope);
  }, [sessionItems, warehouseScope]);

  const filterScope = warehouseScope === 'multi' ? 'small' : warehouseScope;

  const filteredItems = useMemo(() => {
    const keepSkus = new Set(
      scopedSessionItems
        .filter((item) => shouldKeepInventoryItemForScope(item, filterScope))
        .map((item) => String(item.sku)),
    );
    return items.filter((it) => it?.sku && keepSkus.has(String(it.sku)));
  }, [items, scopedSessionItems, filterScope]);

  const sets = filteredItems.filter((it) => it.type === 'set');
  const products = filteredItems.filter((it) => it.type === 'product' || it.type === undefined);
  const materials = filteredItems.filter((it) => it.type === 'material');

  const dateLabel = inventoryDate ? formatDate(inventoryDate) : '—';

  const hasAnyAccountingChanges = useMemo(
    () => rowsHaveAccountingChanges(filteredItems, warehouseScope),
    [filteredItems, warehouseScope],
  );

  const applyDisabledReason = !hasAnyAccountingChanges
    ? 'Облікові залишки в Dilovod збігаються з документом — нічого застосовувати'
    : null;

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" isDismissable={false} onClose={onClose} size="5xl">
      <ModalContent>
        <ModalHeader className="border-b flex items-center">
          Оновлення залишків на складі <StockBadge variant={warehouseScope === 'gp' ? 'gp' : 'ms'} size="10px" className="ml-1.5 leading-tight" />
          <span className="text-sm font-normal leading-relaxed self-end text-gray-500 ml-3">станом на {dateLabel}</span>
        </ModalHeader>
        <ModalBody className="py-6">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-gray-600">Нічого не змінено.</p>
          ) : (
            <div className="space-y-8">
              <BalanceReportSection
                title="Комплекти"
                rows={sets}
                sessionItems={scopedSessionItems}
                warehouseScope={warehouseScope}
                sortColumn={sortColumnSets}
                sortDirection={sortDirectionSets}
                onSort={(col) => toggleSort(col, sortColumnSets, sortDirectionSets, setSortColumnSets, setSortDirectionSets)}
              />
              <BalanceReportSection
                title="Товари"
                rows={products}
                sessionItems={scopedSessionItems}
                warehouseScope={warehouseScope}
                sortColumn={sortColumnProd}
                sortDirection={sortDirectionProd}
                onSort={(col) => toggleSort(col, sortColumnProd, sortDirectionProd, setSortColumnProd, setSortDirectionProd)}
              />
              <BalanceReportSection
                title="Матеріали"
                rows={materials}
                sessionItems={scopedSessionItems}
                warehouseScope={warehouseScope}
                sortColumn={sortColumnMat}
                sortDirection={sortDirectionMat}
                onSort={(col) => toggleSort(col, sortColumnMat, sortDirectionMat, setSortColumnMat, setSortDirectionMat)}
              />
            </div>
          )}
        </ModalBody>
        <ModalFooter className="border-t flex-col sm:flex-row gap-3 sm:items-center">
          {applyDisabledReason && (
            <p className="text-xs text-gray-500 sm:mr-auto">{applyDisabledReason}</p>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <span>
              <Button
                variant="solid"
                color="primary"
                isLoading={!!isApplying}
                isDisabled={!onApply || !!isApplying || !hasAnyAccountingChanges}
                onPress={async () => { if (!onApply) return; await onApply(); }}
              >
                Застосувати
              </Button>
            </span>
            <Button variant="flat" color="default" onPress={onClose}>Скасувати</Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default InventoryRefreshReportModal;
