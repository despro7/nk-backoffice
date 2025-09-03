// Типы и интерфейсы для работы с Dilovod API

export interface DilovodProduct {
  id: string;
  name: string;
  sku: string;
  costPerItem: string;
  currency: string;
  category: {
    id: number;
    name: string;
  };
  weight?: number; // Вес товара в граммах
  set: Array<{
    id: string;
    quantity: number;
  }>;
  additionalPrices: Array<{
    priceType: string;
    priceValue: string;
  }>;
  parent?: string; // ID родительской группы для определения комплектов
}

export interface DilovodStockBalance {
  sku: string;
  name: string;
  mainStorage: number;    // Склад 1 (главный склад)
  kyivStorage: number;    // Склад 2 (киевский склад)
  total: number;          // Общая сумма по складам
}

export interface DilovodApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DilovodSyncResult {
  success: boolean;
  message: string;
  syncedProducts: number;
  syncedSets: number;
  errors: string[];
}

export interface DilovodTestResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface DilovodApiRequest {
  version: string;
  key: string;
  action: string;
  params: any;
}

export interface DilovodPriceInfo {
  priceType: string;
  price: string;
}

export interface DilovodSetComponent {
  good: string;
  qty: string;
}

export interface DilovodObjectResponse {
  id?: string;
  tableParts?: {
    tpGoods?: DilovodSetComponent[];
  };
  [key: string]: any;
}

export interface DilovodGoodsResponse {
  id: string;
  sku: string;
  parent: string;
  id__pr?: string;
  [key: string]: any;
}

export interface DilovodPricesResponse {
  id: string;
  sku: string;
  priceType: string;
  price: string;
  [key: string]: any;
}

export interface WordPressProduct {
  sku: string;
  stock_quantity: number;
  [key: string]: any;
}

export interface DatabaseProduct {
  id: number;
  sku: string;
  name: string;
  costPerItem: number | null;
  currency: string;
  categoryId: number | null;
  categoryName: string;
  weight?: number;        // Добавляем вес
  set: Array<{ id: string; quantity: number }> | null;
  additionalPrices: Array<{ priceType: string; priceValue: string }> | null;
  stockBalanceByStock: {  // Добавляем остатки по складам
    "1": number;          // Склад 1 (главный)
    "2": number;          // Склад 2 (киевский)
  } | null;
  dilovodId: string;
  lastSyncAt: Date;
}

export interface DilovodConfig {
  apiUrl: string;
  apiKey: string;
  setParentId: string;
  mainPriceType: string;
  categoriesMap: { [key: string]: number };
}
