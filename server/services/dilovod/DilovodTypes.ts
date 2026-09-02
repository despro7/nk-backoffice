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
  portionsPerBox?: number; // Кількість порцій у коробці (mapping from Dilovod packageRatio)
  /** Штрих-код з регістру barCodes Dilovod (null якщо відсутній) */
  barcode?: string | null;
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

/** Відповідь регістру barCodes Dilovod */
export interface DilovodBarCodeResponse {
  id: string;
  object: string;
  code: string;
  /** ID партії (goodPart); може бути відсутнім для товарного ШК */
  goodPart?: string;
  /** Назва/номер партії (goodPart__pr) */
  goodPart__pr?: string;
  /** "1" — активний, "0" — неактивний */
  activity?: '1' | '0' | string;
}

export interface DilovodStockBalance {
  sku: string;
  name: string;
  mainStorage: number;    // Склад 1 (головний склад)
  smallStorage: number;   // Склад 2 (малий склад для відвантажень)
  total: number;          // Загальна сума по складах
  storages?: Record<string, number>;
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
  header?: {
    id?: { id: string; pr: string };
    productNum?: string;
    name?: { ru: string; uk: string };
    parent?: { id: string; pr: string };
    [key: string]: any;
  };
  tableParts?: {
    tpGoods?: DilovodSetComponent[] | { [key: string]: DilovodSetComponent };
  };
  [key: string]: any;
}

export interface DilovodGoodsResponse {
  id: string;
  sku: string;
  parent: string;
  id__pr?: string;
  packageRatio?: string | number; // Поле з Dilovod (packageRatio) — використовується для portionsPerBox
  [key: string]: any;
}

export interface DilovodPricesResponse {
  id: string;
  sku: string;
  priceType: string;
  price: string;
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
  barcode?: string | null;
  set: Array<{ id: string; quantity: number }> | null;
  additionalPrices: Array<{ priceType: string; priceValue: string }> | null;
  stockBalanceByStock: {  // Додаємо залишки по складах
    "1": number;          // Склад 1 (головний)
    "2": number;          // Склад 2 (малий для відвантажень)
  } | null;
  dilovodId: string;
  lastSyncAt: Date;
  portionsPerBox?: number;
}

export interface DilovodConfig {
  apiUrl: string;
  apiKey: string;
  mainPriceType: string;
  categoriesMap: { [key: string]: number };
  /** ID головного складу (склад готової продукції) */
  mainStorageId: string;
  /** ID малого складу (для відвантажень) */
  smallStorageId: string;
  /** @deprecated Залишено для зворотної сумісності */
  storageIdsList: string[];
  /** ID фірми за замовчуванням (для фільтрації залишків по фірмі) */
  defaultFirmId?: string;
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

export interface DilovodMetadataListItem {
  id: string;
  idPrefix?: string;
  presentation?: string;
}

export type DilovodMetadataList = Record<string, DilovodMetadataListItem>;

export interface DilovodMetadataReq {
  name?: string;
  presentation?: string;
  valueType?: string | Record<string, unknown> | Array<string | Record<string, unknown>>;
  kind?: string;
  use?: string;
  role?: string;
  purpose?: string;
  type?: string;
  [key: string]: unknown;
}

export interface DilovodObjectMetadata {
  name: string;
  presentation?: string;
  listPresentation?: string;
  idPrefix?: string;
  hierarchyType?: string;
  autoNumeration?: number;
  reqs: Record<string, DilovodMetadataReq>;
  dimensions?: Record<string, DilovodMetadataReq> | DilovodMetadataReq[];
  resources?: Record<string, DilovodMetadataReq> | DilovodMetadataReq[];
  predefined?: Record<string, unknown>;
  [key: string]: unknown;
}

export type DilovodRegisterFieldKind = 'dimension' | 'resource' | 'attribute';

export interface DilovodRegisterField {
  name: string;
  presentation: string;
  valueType?: string;
  kind: DilovodRegisterFieldKind;
  raw: DilovodMetadataReq;
}

export interface DilovodRegisterShape {
  objectName: string;
  registerName: string;
  presentation?: string;
  dimensions: DilovodRegisterField[];
  resources: DilovodRegisterField[];
  attributes: DilovodRegisterField[];
}

export interface DilovodVirtualBatFields {
  start: string;
  receipt: string;
  expense: string;
  final: string;
}

/** Параметри `request` / `balanceAndTurnover`. Імена вже з live shape — клієнт схеми не знає. */
export interface DilovodBalanceAndTurnoverParams {
  register: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  /** Імена полів (виміри + віртуальні BAT-ресурси). Без `shape.attributes`. */
  fields: string[];
  filters?: Array<{ alias: string; operator: string; value: unknown }>;
}
