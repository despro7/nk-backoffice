export interface WarehouseDocHistoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export const DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION: WarehouseDocHistoryPagination = {
  page: 1,
  limit: 10,
  total: 0,
  pages: 1,
};
