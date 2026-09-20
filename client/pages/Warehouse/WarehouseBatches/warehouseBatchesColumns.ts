import type { SortDescriptor } from '@heroui/react';
import type { WarehouseBatchListItem } from './WarehouseBatchesTypes';

export type WarehouseBatchesColumnKey =
  | 'batchNumber'
  | 'product'
  | 'barcodes'
  | 'createdAt'
  | 'expiration'
  | 'stockGp'
  | 'stockMs';

export interface WarehouseBatchesColumnDef {
  key: WarehouseBatchesColumnKey;
  label: string;
  /** Ширина колонки в px (HeroUI TableColumn `width`). */
  width?: number;
  align?: 'start' | 'center' | 'end';
  allowsSorting?: boolean;
}

export const WAREHOUSE_BATCHES_DEFAULT_SORT: SortDescriptor = {
  column: 'createdAt',
  direction: 'descending',
};

export const WAREHOUSE_BATCHES_DEFAULT_COLUMN_ORDER: WarehouseBatchesColumnKey[] = [
  'batchNumber',
  'product',
  'barcodes',
  'createdAt',
  'expiration',
  'stockGp',
  'stockMs',
];

export const WAREHOUSE_BATCHES_COLUMNS: Record<WarehouseBatchesColumnKey, WarehouseBatchesColumnDef> = {
  batchNumber: { key: 'batchNumber', label: 'Номер партії', width: 140, allowsSorting: true },
  product: { key: 'product', label: 'Продукція', allowsSorting: true },
  barcodes: { key: 'barcodes', label: 'ШК', width: 200, allowsSorting: true },
  createdAt: { key: 'createdAt', label: 'Дата виготовлення', width: 150, allowsSorting: true },
  expiration: { key: 'expiration', label: 'Термін придатності', width: 150, allowsSorting: true },
  stockGp: { key: 'stockGp', label: 'Залишки ГП', width: 108, align: 'end', allowsSorting: true },
  stockMs: { key: 'stockMs', label: 'Залишки МС', width: 108, align: 'end', allowsSorting: true },
};

const COLUMN_ORDER_STORAGE_KEY = 'warehouse-batches-column-order-v2';

function isValidColumnKey(value: string): value is WarehouseBatchesColumnKey {
  return value in WAREHOUSE_BATCHES_COLUMNS;
}

function normalizeColumnOrder(keys: string[]): WarehouseBatchesColumnKey[] {
  const result: WarehouseBatchesColumnKey[] = [];

  for (const rawKey of keys) {
    if (rawKey === 'stock') {
      if (!result.includes('stockGp')) result.push('stockGp');
      if (!result.includes('stockMs')) result.push('stockMs');
      continue;
    }
    if (!isValidColumnKey(rawKey) || result.includes(rawKey)) continue;
    result.push(rawKey);
  }

  const missing = WAREHOUSE_BATCHES_DEFAULT_COLUMN_ORDER.filter((key) => !result.includes(key));
  return [...result, ...missing];
}

export function loadWarehouseBatchesColumnOrder(): WarehouseBatchesColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY)
      ?? localStorage.getItem('warehouse-batches-column-order-v1');
    if (!raw) return [...WAREHOUSE_BATCHES_DEFAULT_COLUMN_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...WAREHOUSE_BATCHES_DEFAULT_COLUMN_ORDER];

    return normalizeColumnOrder(parsed.map((item) => String(item)));
  } catch {
    return [...WAREHOUSE_BATCHES_DEFAULT_COLUMN_ORDER];
  }
}

export function saveWarehouseBatchesColumnOrder(order: WarehouseBatchesColumnKey[]): void {
  try {
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore quota / private mode
  }
}

export function toColumnDefs(order: WarehouseBatchesColumnKey[]): WarehouseBatchesColumnDef[] {
  return order.map((key) => WAREHOUSE_BATCHES_COLUMNS[key]);
}

export function sortWarehouseBatches(
  items: WarehouseBatchListItem[],
  descriptor: SortDescriptor,
): WarehouseBatchListItem[] {
  const column = descriptor.column;
  if (!column) return items;

  const key = String(column) as WarehouseBatchesColumnKey;
  const dir = descriptor.direction === 'descending' ? -1 : 1;

  const getValue = (item: WarehouseBatchListItem): string | number => {
    switch (key) {
      case 'batchNumber':
        return item.batchNumber;
      case 'product':
        return item.productName;
      case 'barcodes':
        return item.barcodeCount;
      case 'createdAt':
        return item.createdAt ? Date.parse(item.createdAt) : 0;
      case 'expiration':
        return item.expiration ? Date.parse(item.expiration) : 0;
      case 'stockGp':
        return item.quantityGp;
      case 'stockMs':
        return item.quantityMs;
      default:
        return '';
    }
  };

  return [...items].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * dir;
    }
    return String(leftValue).localeCompare(String(rightValue), 'uk') * dir;
  });
}
