// Налаштування Dilovod (зберігаються в settings_base з category = 'dilovod')
export interface DilovodSettings {
  // Основні налаштування API
  apiUrl?: string;
  apiKey?: string;
  consumerKey?: string; 
  consumerSecret?: string;
  
  // Налаштування складів
  storageIdsList?: string[]; // Масив ID складів
  storageId?: string;       // Основний склад для списання
  
  // Налаштування синхронізації
  synchronizationInterval: DilovodSyncInterval;
  synchronizationRegularPrice: boolean;
  synchronizationSalePrice: boolean;
  synchronizationStockQuantity: boolean;
  
  // Автоматичний експорт замовлень
  autoSendOrder: boolean;
  cronSendOrder: boolean;
  autoSendListSettings?: string[]; // Масив статусів для автовідправки
  
  // Налаштування експорту
  unloadOrderNumberAs: 'dilovod' | 'web';
  unloadOrderAs: 'sale' | 'saleOrder';
  
  // Пошук контрагентів
  getPersonBy: DilovodPersonSearchType;
  
  // Фірма за замовчуванням
  defaultFirmId?: string;
  
  // Мапінг каналів продажів
  channelPaymentMapping?: DilovodChannelPaymentMapping;
  
  // Логування
  logSendOrder: boolean;
  
  // Комісія LiqPay
  liqpayCommission: boolean;
}

// Константи для роботи з settings_base
export const DILOVOD_SETTINGS_CATEGORY = 'dilovod';

// Ключі налаштувань в settings_base
export const DILOVOD_SETTINGS_KEYS = {
  API_URL: 'dilovod_api_url',
  API_KEY: 'dilovod_api_key',
  STORAGE_IDS_LIST: 'dilovod_storage_ids_list',
  STORAGE_ID: 'dilovod_storage_id',
  SYNCHRONIZATION_INTERVAL: 'dilovod_synchronization_interval',
  SYNCHRONIZATION_REGULAR_PRICE: 'dilovod_synchronization_regular_price',
  SYNCHRONIZATION_SALE_PRICE: 'dilovod_synchronization_sale_price',
  SYNCHRONIZATION_STOCK_QUANTITY: 'dilovod_synchronization_stock_quantity',
  AUTO_SEND_ORDER: 'dilovod_auto_send_order',
  CRON_SEND_ORDER: 'dilovod_cron_send_order',
  AUTO_SEND_LIST_SETTINGS: 'dilovod_auto_send_list_settings',
  UNLOAD_ORDER_NUMBER_AS: 'dilovod_unload_order_number_as',
  UNLOAD_ORDER_AS: 'dilovod_unload_order_as',
  GET_PERSON_BY: 'dilovod_get_person_by',
  DEFAULT_FIRM_ID: 'dilovod_default_firm_id',
  PAYMENT_GATEWAY_MAPPING: 'dilovod_payment_gateway_mapping',
  LOG_SEND_ORDER: 'dilovod_log_send_order',
  LIQPAY_COMMISSION: 'dilovod_liqpay_commission',
} as const;

// Інтервали синхронізації
export type DilovodSyncInterval = 
  | 'none sync'
  | 'hourly' 
  | 'every two hours'
  | 'twicedaily'
  | 'daily'
  | 'every two days';

// Типи пошуку персони
export type DilovodPersonSearchType = 
  | 'end_user'
  | 'billing_fullname'
  | 'shipping_fullname'
  | 'billing_company'
  | 'billing_phone'
  | 'billing_email'
  | 'shipping_company'
  | 'shipping_phone'
  | 'shipping_email';

// Канали продажів з SalesDrive
export interface SalesChannel {
  id: string; // channelId з SalesDrive (22, 24, 28, 31, 38, 39)
  name: string; // Назва каналу (Rozetka (Сергій), prom, тощо)
}

// Єдиний мапінг для каналу (окремий елемент масиву)
export interface DilovodChannelMapping {
  id: string;               // Унікальний ID мапінгу
  channelId: string;        // ID каналу з SalesDrive
  paymentForm?: string;     // ID форми оплати в Dilovod
  cashAccount?: string;     // ID рахунку в Dilovod
}

// Налаштування каналу продажів
export interface DilovodChannelSettings {
  channelId: string;        // ID каналу з SalesDrive
  prefixOrder?: string;     // Префікс до номера замовлення для цього каналу
  sufixOrder?: string;      // Суфікс до номера замовлення для цього каналу
  mappings: DilovodChannelMapping[];  // Мапінги методів оплати для цього каналу
}

// Мапінг каналів продажів до способів оплати
export interface DilovodChannelPaymentMapping {
  [channelId: string]: DilovodChannelSettings;
}

// Легаці - мапінг платіжних шлюзів (для зворотної сумісності)
export interface DilovodPaymentGatewayMapping {
  [gatewayId: string]: {
    paymentForm?: string;  // ID форми оплати в Dilovod
    cashAccount?: string;  // ID рахунку в Dilovod
  };
}

// Довідники з Dilovod API
export interface DilovodStorage {
  id: string;
  code: string;
  name: string;
}

export interface DilovodCashAccount {
  id: string;
  code: string;
  name: string;
  owner?: string; // ID фірми-власника
}

export interface DilovodPaymentForm {
  id: string;
  code: string;
  name: string;
}

export interface DilovodFirm {
  id: string;
  name: string;
}

// Структура для отримання довідників
export interface DilovodDirectories {
  storages: DilovodStorage[];
  cashAccounts: DilovodCashAccount[];
  paymentForms: DilovodPaymentForm[];
  firms: DilovodFirm[];
}

// Request/Response типи для API
export interface DilovodSettingsRequest extends Partial<DilovodSettings> {
  // Поля які можна оновлювати
}

export interface DilovodSettingsResponse {
  success: boolean;
  data?: DilovodSettings;
  message?: string;
  error?: string;
}

export interface DilovodDirectoriesResponse {
  success: boolean;
  data?: DilovodDirectories;
  message?: string;
  error?: string;
}

// Статуси замовлень WooCommerce (для автовідправки)
export interface WooCommerceOrderStatus {
  slug: string;
  name: string;
}