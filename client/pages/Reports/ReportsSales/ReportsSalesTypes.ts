export interface SalesData {
  date: string;
  ordersCount: number;
  portionsCount: number;
  ordersByStatus: { [status: string]: number };
  portionsByStatus: { [status: string]: number };
  ordersBySource: { [source: string]: number };
  portionsBySource: { [source: string]: number };
  priceBySource: { [source: string]: number };
  ordersWithDiscountReason: number;
  portionsWithDiscountReason: number;
  priceWithDiscountReason: number;
  discountReasonText: string;
  totalPrice: number | undefined;
  vidskoduvannaTotal: number;
  vidskoduvannaGrnTotal: number;
  vidskoduvannaPortions: number;
  orders: Array<{
    orderNumber: string;
    portionsCount: number;
    source: string;
    createdAt: string;
    orderDate: string;
    orderTime: string;
    externalId: string;
    status: string;
    totalPrice?: number | undefined;
    hasDiscount?: boolean;
    discountReasonCode?: string | null;
    vidskoduvanna?: number | null;
    vidskoduvannaGrn?: number | null;
  }>;
}

export interface SalesReportTableProps {
  className?: string;
}

export interface SalesSetReportData {
  name: string;
  sku: string;
  ordersCount: number;
  uniqOrdersCount: number;
  ordersBySource: { [source: string]: number };
  portionsBySource: { [source: string]: number };
  ordersWithDiscountReason: number;
  portionsWithDiscountReason: number;
  orders: Array<{
    orderNumber: string;
    externalId: string;
    status: string;
    source: string;
    orderedQuantity: number;
    totalPrice?: number | undefined;
    hasDiscount?: boolean;
    discountReasonCode?: string | null;
  }>;
}

export interface SalesSetsReportTableProps {
  className?: string;
}

export type SalesSortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

export interface ProductStats {
  name: string;
  sku: string;
  orderedQuantity: number;
  stockBalances: { [warehouse: string]: number };
  categoryId?: number | null;
  categoryName?: string | null;
  categoryKey?: string | null;
  isSet?: boolean;
}

export interface ProductStatsCategorySeriesOption {
  key: string;
  categoryId: number | null;
  label: string;
  count: number;
}

export interface ProductStatsAvailableSeries {
  default: {
    key: string;
    label: string;
  };
  categories: ProductStatsCategorySeriesOption[];
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
    availableSeries: ProductStatsAvailableSeries;
    fetchedAt: string;
  };
}

export interface ProductStatsChartProps {
  className?: string;
}

export type ProductStatsSortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

export type ProductChartGroupBy = "hour" | "day" | "week" | "month";