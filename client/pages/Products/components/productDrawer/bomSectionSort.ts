import type { SortDescriptor } from '@heroui/react';
import type { CatalogDictItemDto } from '../../ProductsTypes';
import type { BomRow } from './productDrawerTypes';

export const BOM_MANUAL_SORT: SortDescriptor = {
  column: 'sortOrder',
  direction: 'ascending',
};

export type BomSortColumn = 'sortOrder' | 'name' | 'loss' | 'qty' | 'unit';

export type BomRowEntry = {
  row: BomRow;
  originalIdx: number;
};

export function isBomManualSort(sortDescriptor: SortDescriptor): boolean {
  const col = String(sortDescriptor.column || 'sortOrder');
  return col === 'sortOrder';
}

export function getBomSortIconName(
  column: BomSortColumn,
  sortDescriptor: SortDescriptor
): 'arrow-up-down' | 'arrow-up' | 'arrow-down' {
  if (String(sortDescriptor.column) !== column) return 'arrow-up-down';
  return sortDescriptor.direction === 'ascending' ? 'arrow-up' : 'arrow-down';
}

export function nextBomSortDescriptor(
  current: SortDescriptor,
  column: Exclude<BomSortColumn, 'sortOrder'>
): SortDescriptor {
  const col = String(current.column);
  if (col === column) {
    return {
      column,
      direction: current.direction === 'ascending' ? 'descending' : 'ascending',
    };
  }
  return { column, direction: 'ascending' };
}

export function sortBomEntries(
  rows: BomRow[],
  sortDescriptor: SortDescriptor,
  units: CatalogDictItemDto[]
): BomRowEntry[] {
  const entries = rows.map((row, originalIdx) => ({ row, originalIdx }));
  const col = String(sortDescriptor.column || 'sortOrder');

  if (col === 'sortOrder') {
    return entries;
  }

  const dir = sortDescriptor.direction === 'descending' ? -1 : 1;

  return [...entries].sort((a, b) => {
    const getVal = (entry: BomRowEntry): string | number => {
      switch (col) {
        case 'name':
          return entry.row.componentName || '';
        case 'loss':
          return entry.row.cookingLossPercent ?? 0;
        case 'qty':
          return entry.row.qty ?? 0;
        case 'unit': {
          const unit = units.find((u) => u.id === entry.row.unitId);
          return unit?.name || '';
        }
        default:
          return entry.row.componentName || '';
      }
    };

    const va = getVal(a);
    const vb = getVal(b);
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), 'uk') * dir;
  });
}

export function reorderBomRows(rows: BomRow[], from: number, to: number): BomRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) {
    return rows;
  }
  const next = [...rows];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}
