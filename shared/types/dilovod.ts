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
  
  // Мапінг способів доставки
  deliveryMappings?: DilovodDeliveryMapping[];
  
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
  DELIVERY_MAPPINGS: 'dilovod_delivery_mappings',
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
  id: string;                    // Унікальний ID мапінгу
  channelId: string;             // ID каналу з SalesDrive
  salesDrivePaymentMethod?: number;  // ID методу оплати з SalesDrive (13 = LiqPay, 25 = Наложений платіж, etc.)
  paymentForm?: string;          // ID форми оплати в Dilovod
  cashAccount?: string;          // ID рахунку в Dilovod
}

// Мапінг способів доставки
export interface DilovodDeliveryMapping {
  salesDriveShippingMethods: string[];  // Масив назв способів доставки з SalesDrive
  dilovodDeliveryMethodId: string;      // ID способу доставки в Dilovod
}

// Налаштування каналу продажів
export interface DilovodChannelSettings {
  channelId: string;        // ID каналу з SalesDrive
  prefixOrder?: string;     // Префікс до номера замовлення для цього каналу
  sufixOrder?: string;      // Суфікс до номера замовлення для цього каналу
  dilovodTradeChannelId?: string;  // ID каналу продажів з Dilovod (для мапінгу sajt → tradeChanel)
  mappings: DilovodChannelMapping[];  // Мапінги методів оплати для цього каналу
  deliveryMappings?: DilovodDeliveryMapping[];  // Мапінги способів доставки для цього каналу
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

export interface DilovodTradeChanel {
  id: string;
  id__pr: string; // Назва каналу
  code: string;   // Код каналу для мапінгу
}

export interface DilovodDeliveryMethod {
  id: string;
  id__pr: string; // Назва способу доставки
  code: string;   // Код способу доставки
}

// Структура для отримання довідників
export interface DilovodDirectories {
  storages: DilovodStorage[];
  cashAccounts: DilovodCashAccount[];
  paymentForms: DilovodPaymentForm[];
  firms: DilovodFirm[];
  tradeChanels: DilovodTradeChanel[];
  deliveryMethods: DilovodDeliveryMethod[];
  goods: Array<{ id: number; good_id: string; productNum: string; name: string | null; parent: string | null }>;
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

// ============================================================================
// ТИПИ ДЛЯ ЕКСПОРТУ ЗАМОВЛЕНЬ В DILOVOD
// ============================================================================

/**
 * Інформація про контрагента (клієнта) для Dilovod
 */
export interface DilovodPerson {
  id: string;           // ID контрагента в Dilovod
  code: string;         // Код контрагента
  name: string;         // ПІБ
  phone: string;        // Телефон
  personType: string;   // Тип контрагента (1004000000000035 - фізична особа)
  wasCreated?: boolean; // Чи був контрагент створений під час експорту
}

/**
 * Статус документа в Dilovod
 */
export interface DilovodDocumentState {
  id: string;           // ID статусу (1111500000000006 - проведений)
}

/**
 * Заголовок документа замовлення для експорту в Dilovod
 */
export interface DilovodExportHeader {
  id: string;                      // Тип документу: "documents.saleOrder" або "documents.sale"
  storage: string;                 // ID складу для списання
  date: string;                    // Дата документу (YYYY-MM-DD HH:mm:ss)
  person: DilovodPerson;           // Контрагент (клієнт)
  firm: string;                    // ID фірми
  currency: string;                // ID валюти (UAH = 1101200000001001)
  posted: number;                  // Провести документ (0 - ні, 1 - так)
  state: DilovodDocumentState;     // Статус документа
  taxAccount: number;              // Податковий облік (1 - так)
  tradeChanel: string;             // ID каналу продажів (з мапінгу)
  paymentForm: string;             // ID форми оплати (з мапінгу)
  cashAccount: string;             // ID рахунку (з мапінгу)
  number: string;                  // Номер замовлення
  remarkFromPerson?: string;       // Коментар до замовлення
  business: string;                // ID бізнес-процесу
  deliveryMethod_forDel?: string;  // ID методу доставки (legacy поле)
  deliveryRemark_forDel?: string;  // Адреса доставки (legacy поле)
  baseDoc?: string;                // ID базового документа (для documents.sale → documents.saleOrder)
  docMode?: string;                // Режим документа (операція)
  contract?: string;               // Договір (зазвичай такий самий як docMode)
}

/**
 * Товарна позиція в замовленні для Dilovod
 */
export interface DilovodTablePartGood {
  rowNum: number;        // Номер рядка
  good: string;         // ID товару в Dilovod (recommended: use products.dilovodGood)
  // productNum?: string;   // Артикул товару (SKU) - застарілий спосіб
  unit: string;          // ID одиниці виміру (1103600000000001 - шт)
  qty: number;           // Кількість
  baseQty: number;       // Кількість в базових одиницях (зазвичай = qty)
  priceAmount: number;   // Сума (qty * price)
  price: number;         // Ціна за одиницю
  amountCur: number;     // Сума у валюті (зазвичай = priceAmount)
}

/**
 * Табличні частини документа замовлення
 */
export interface DilovodExportTableParts {
  tpGoods: DilovodTablePartGood[];  // Масив товарів
}

/**
 * Повний payload для експорту замовлення в Dilovod
 */
export interface DilovodExportPayload {
  saveType: number;                      // Тип збереження (0 - новий документ)
  header: DilovodExportHeader;           // Заголовок документа
  tableParts: DilovodExportTableParts;   // Табличні частини
}

/**
 * Відповідь API при експорті замовлення
 */
export interface DilovodExportResponse {
  success: boolean;
  payload?: DilovodExportPayload;        // Сформований payload (для preview)
  documentId?: string;                   // ID створеного документа в Dilovod (після відправки)
  message?: string;
  error?: string;
  warnings?: string[];                   // Попередження (напр., товар не знайдено)
}