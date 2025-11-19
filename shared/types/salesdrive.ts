// Типи для SalesDrive замовлень з підтримкою Dilovod вивантаження

export interface DilovodExportInfo {
  exportDate: Date | null;
  error?: string;
}

export interface SalesDriveOrderForExport {
  id: number;
  externalId: string;
  orderNumber: string;
  orderDate: Date | null;
  updatedAt: Date | null;
  status: string;
  statusText: string;
  paymentMethod: string | null;
  shippingMethod: string | null;
  sajt: string | null; // канал продаж
  dilovodDocId: string | null;
  dilovodSaleExportDate: Date | null;
  dilovodExportDate: Date | null;
  dilovodCashInDate: Date | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  totalPrice: number | null;
  quantity: number;
  items: any; // JSON string or parsed object
  rawData: any; // JSON string or parsed object
  logsCount?: number;
}

export interface SalesDriveOrdersResponse {
  success: boolean;
  data: SalesDriveOrderForExport[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  metadata: {
    fetchedAt: string;
    filters: {
      excludedChannel: string;
      search: string | null;
    };
    sorting: {
      sortBy: string;
      sortOrder: string;
    };
  };
}

// Типи для API endpoints Dilovod дій
export interface DilovodCheckOrderResponse {
  success: boolean;
  exists: boolean;
  data?: any;
  error?: string;
}

export interface DilovodExportOrderResponse {
  success: boolean;
  exported: boolean;
  data?: any;
  error?: string;
}

export interface DilovodShipmentResponse {
  success: boolean;
  created: boolean;
  data?: any;
  error?: string;
}