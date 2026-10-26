import {
  appendWarehouseDocHistoryQueryToUrl,
  warehouseDocHistoryFiltersToListQuery,
  type WarehouseDocHistoryFilters,
} from '@shared/utils/warehouseDocHistoryListQuery';
import type { WarehouseDocHistoryPagination } from './warehouseDocHistoryTypes';
import { DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION } from './warehouseDocHistoryTypes';

export async function fetchWarehouseDocHistoryPage(
  apiBase: string,
  status: 'active' | 'deleted',
  page: number,
  limit: number,
  filters: WarehouseDocHistoryFilters,
  extra?: Record<string, string>,
): Promise<{ records: any[]; pagination: WarehouseDocHistoryPagination }> {
  const url = new URL(apiBase, window.location.origin);
  appendWarehouseDocHistoryQueryToUrl(
    url,
    warehouseDocHistoryFiltersToListQuery(filters, page, limit, status),
    extra,
  );
  const res = await fetch(url.toString(), { credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || 'Не вдалося завантажити історію');
  }
  return {
    records: Array.isArray(json.data) ? json.data : [],
    pagination: json.pagination ?? { ...DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION, page, limit },
  };
}
