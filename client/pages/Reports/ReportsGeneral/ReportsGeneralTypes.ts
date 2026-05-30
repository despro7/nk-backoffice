export interface ProductStats {
  name: string;
  sku: string;
  orderedQuantity: number;
  stockBalances: { [warehouse: string]: number };
}

export interface ProductDateStats {
  date: string;
  orderedQuantity: number;
  stockBalances: { [warehouse: string]: number };
}

export interface ProductStatsResponse {
  success: boolean;
  data: ProductStats[];
  metadata: {
    source: string;
    filters: {
      status: string;
      dateRange: { startDate: string; endDate: string } | null;
    };
    totalProducts: number;
    totalOrders: number;
    fetchedAt: string;
  };
}

export interface ProductDateStatsResponse {
  success: boolean;
  data: ProductDateStats[];
  product: {
    name: string;
    sku: string;
  };
  metadata: {
    source: string;
    filters: {
      sku: string;
      status: string;
      dateRange: { startDate: string; endDate: string } | null;
    };
    totalDates: number;
    totalOrders: number;
    fetchedAt: string;
  };
}

export interface ProductStatsTableProps {
  className?: string;
}

export type ProductStatsSortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};