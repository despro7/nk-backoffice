// Типи та інтерфейси для роботи з Dilovod API

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
  weight?: number; // Вага товару в грамах
  set: Array<{
    id: string;
    quantity: number;
  }>;
  additionalPrices: Array<{
    priceType: string;
    priceValue: string;
  }>;
  parent?: string; // ID батьківської групи для визначення комплектів
}

export interface DilovodStockBalance {
  sku: string;
  name: string;
  mainStorage: number;    // Склад 1 (головний склад)
  kyivStorage: number;    // Склад 2 (київський склад)
  total: number;          // Загальна сума по складах
}

export interface DilovodApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DilovodSyncResult {
  success: boolean;
  message: string;
  syncedProducts: number; // Для зворотної сумісності (created + updated)
  syncedSets: number;
  createdProducts?: number; // Кількість створених товарів
  updatedProducts?: number; // Кількість оновлених товарів
  skippedProducts?: number; // Кількість пропущених товарів (без змін)
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
  weight?: number;        // Додаємо вагу
  set: Array<{ id: string; quantity: number }> | null;
  additionalPrices: Array<{ priceType: string; priceValue: string }> | null;
  stockBalanceByStock: {  // Додаємо залишки по складах
    "1": number;          // Склад 1 (головний)
    "2": number;          // Склад 2 (київський)
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

// Інтерфейси для роботи із замовленнями в Dilovod
export interface DilovodOrder {
  id: string;
  number: string;
  date: string;
  customer: {
    id: string;
    name: string;
  };
  total: number;
  currency: string;
  status: string;
  items: DilovodOrderItem[];
  delivery?: {
    address: string;
    date?: string;
    method?: string;
  };
  payment?: {
    method?: string;
    status?: string;
  };
}

export interface DilovodOrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface DilovodOrderResponse {
  success: boolean;
  data?: DilovodOrder[];
  error?: string;
  message?: string;
}
