export type GroupBy = "day" | "calendarWeek" | "week4";

export interface SalesDynamicsColumn {
  key: string;
  label: string;
  tooltip?: string;
  allowsSorting: boolean;
}

export interface PeriodMeta {
  key: string;
  label: string;
}

export interface SalesDynamicsRow {
  sku: string;
  productName: string;
  periods: Record<string, number>;
  totalSold: number;
}

export type DisplayRow = SalesDynamicsRow & {
  _stock: number | null | undefined;
  _currentStock: number | null | undefined;
};

export interface SalesDynamicsResponse {
  success: boolean;
  data: {
    rows: SalesDynamicsRow[];
    periods: PeriodMeta[];
  };
  metadata: {
    year: number;
    month: number;
    groupBy: GroupBy;
    totalOrders: number;
    ordersWithCache: number;
    generatedAt: string;
  };
}

export interface StockSnapshotResponse {
  success: boolean;
  asOfDate: string | null;
  stocks: Record<string, { mainStock: number; smallStock: number }>;
}