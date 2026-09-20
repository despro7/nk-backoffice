import type { DateRange } from '@react-types/datepicker';
import type { CalendarDate } from '@internationalized/date';
import type { WarehouseBatchListItem } from './WarehouseBatchesTypes';

export interface WarehouseBatchesFilterState {
  onlyWithStock: boolean;
  searchQuery: string;
  dateRange: DateRange | null;
}

export function calendarDateToIso(value: CalendarDate): string {
  const year = String(value.year).padStart(4, '0');
  const month = String(value.month).padStart(2, '0');
  const day = String(value.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateInRange(
  value: string | null,
  dateRange: DateRange | null,
): boolean {
  if (!dateRange?.start || !dateRange?.end) return true;
  if (!value) return false;

  const target = value.slice(0, 10);
  const from = calendarDateToIso(dateRange.start as CalendarDate);
  const to = calendarDateToIso(dateRange.end as CalendarDate);
  return target >= from && target <= to;
}

export function matchesBatchSearch(
  item: WarehouseBatchListItem,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (item.batchNumber.toLowerCase().includes(normalized)) return true;
  if (item.productName.toLowerCase().includes(normalized)) return true;
  if (item.sku?.toLowerCase().includes(normalized)) return true;
  if (item.lastBarcode?.toLowerCase().includes(normalized)) return true;
  if (item.barcodes.some((barcode) => barcode.code.toLowerCase().includes(normalized))) {
    return true;
  }

  return false;
}

export function filterWarehouseBatches(
  items: WarehouseBatchListItem[],
  filters: Pick<WarehouseBatchesFilterState, 'dateRange' | 'searchQuery'>,
): WarehouseBatchListItem[] {
  return items.filter((item) => {
    if (!matchesBatchSearch(item, filters.searchQuery)) return false;
    if (!isDateInRange(item.createdAt, filters.dateRange)) return false;
    return true;
  });
}
