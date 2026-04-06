import { Router } from 'express';
import { buildDilovodPayload } from '../../shared/utils/dilovodPayloadBuilder.js';
import { authenticateToken, requireRole, requireMinRole, ROLES } from '../middleware/auth.js';
import { DilovodService } from '../services/dilovod/index.js';
import { handleDilovodApiError, clearConfigCache, isDilovodExportError, getDilovodExportErrorMessage, cleanDilovodErrorMessageShort, cleanDilovodErrorMessageFull } from '../services/dilovod/DilovodUtils.js';
import { PrismaClient } from '@prisma/client';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { cronService } from '../services/cronService.js';
import type {
  DilovodSettings,
  DilovodSettingsRequest,
  DilovodDirectories
} from '../../shared/types/dilovod.js';

const router = Router();
const prisma = new PrismaClient();

// Допоміжні функції для роботи з налаштуваннями Dilovod в settings_base

/**
 * Отримання всіх налаштувань Dilovod з settings_base
 */
async function getDilovodSettings(): Promise<DilovodSettings> {
  const settings = await prisma.settingsBase.findMany({
    where: {
      category: 'dilovod',
      isActive: true
    }
  });

  const settingsMap = new Map(
    settings.map(setting => [setting.key, setting.value])
  );

  // Функція для безпечного парсингу JSON
  const parseJsonSafe = (value: string | undefined, defaultValue: any = null) => {
    if (!value) return defaultValue;
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  };

  // Функція для парсингу boolean
  const parseBool = (value: string | undefined, defaultValue: boolean = false) => {
    if (!value) return defaultValue;
    return value === 'true' || value === '1';
  };

  return {
    apiUrl: settingsMap.get('dilovod_api_url'),
    apiKey: settingsMap.get('dilovod_api_key'),
    mainStorageId: settingsMap.get('dilovod_main_storage_id'),
    smallStorageId: settingsMap.get('dilovod_small_storage_id'),
    storageId: settingsMap.get('dilovod_storage_id'),
    productsInterval: (settingsMap.get('dilovod_products_interval') as DilovodSettings['productsInterval']) || 'none sync',
    productsHour: settingsMap.get('dilovod_products_hour') !== undefined ? Number(settingsMap.get('dilovod_products_hour')) : 6,
    productsMinute: settingsMap.get('dilovod_products_minute') !== undefined ? Number(settingsMap.get('dilovod_products_minute')) : 0,
    synchronizationInterval: (settingsMap.get('dilovod_synchronization_interval') as DilovodSettings['synchronizationInterval']) || 'daily',
    synchronizationHour: settingsMap.get('dilovod_synchronization_hour') !== undefined ? Number(settingsMap.get('dilovod_synchronization_hour')) : 6,
    synchronizationMinute: settingsMap.get('dilovod_synchronization_minute') !== undefined ? Number(settingsMap.get('dilovod_synchronization_minute')) : 0,
    synchronizationRegularPrice: parseBool(settingsMap.get('dilovod_synchronization_regular_price')),
    synchronizationSalePrice: parseBool(settingsMap.get('dilovod_synchronization_sale_price')),
    synchronizationStockQuantity: parseBool(settingsMap.get('dilovod_synchronization_stock_quantity')),
    ordersInterval: (settingsMap.get('dilovod_orders_interval') as DilovodSettings['ordersInterval']) || 'hourly',
    ordersHour: settingsMap.get('dilovod_orders_hour') !== undefined ? Number(settingsMap.get('dilovod_orders_hour')) : 5,
    ordersMinute: settingsMap.get('dilovod_orders_minute') !== undefined ? Number(settingsMap.get('dilovod_orders_minute')) : 5,
    ordersBatchSize: settingsMap.get('dilovod_orders_batch_size') !== undefined ? Number(settingsMap.get('dilovod_orders_batch_size')) : 50,
    ordersRetryAttempts: settingsMap.get('dilovod_orders_retry_attempts') !== undefined ? Number(settingsMap.get('dilovod_orders_retry_attempts')) : 3,
    autoSendOrder: parseBool(settingsMap.get('dilovod_auto_send_order')),
    autoSendListSettings: parseJsonSafe(settingsMap.get('dilovod_auto_send_list_settings'), []),
    autoSendChannelSettings: parseJsonSafe(settingsMap.get('dilovod_auto_send_channel_settings'), []),
    autoSendSale: parseBool(settingsMap.get('dilovod_auto_send_sale')),
    autoSendSaleListSettings: parseJsonSafe(settingsMap.get('dilovod_auto_send_sale_list_settings'), []),
    autoSendSaleChannelSettings: parseJsonSafe(settingsMap.get('dilovod_auto_send_sale_channel_settings'), []),
    getPersonBy: (settingsMap.get('dilovod_get_person_by') as DilovodSettings['getPersonBy']) || 'end_user',
    defaultFirmId: settingsMap.get('dilovod_default_firm_id'),
    channelPaymentMapping: parseJsonSafe(settingsMap.get('dilovod_channel_payment_mapping'), {}),
    deliveryMappings: parseJsonSafe(settingsMap.get('dilovod_delivery_mappings'), []),
    logSendOrder: parseBool(settingsMap.get('dilovod_log_send_order')),
    liqpayCommission: parseBool(settingsMap.get('dilovod_liqpay_commission'))
  };
}

/**
 * Збереження налаштувань Dilovod в settings_base
 */
async function saveDilovodSettings(settings: DilovodSettingsRequest): Promise<DilovodSettings> {
  // Підготовуємо масив налаштувань для збереження
  const settingsToSave = [
    { key: 'dilovod_api_url', value: settings.apiUrl || '', description: 'API URL для Dilovod' },
    { key: 'dilovod_api_key', value: settings.apiKey || '', description: 'API ключ для Dilovod' },
    { key: 'dilovod_main_storage_id', value: settings.mainStorageId || '', description: 'ID головного складу' },
    { key: 'dilovod_small_storage_id', value: settings.smallStorageId || '', description: 'ID малого складу' },
    { key: 'dilovod_storage_id', value: settings.storageId || '', description: 'Основний склад для списання' },
    { key: 'dilovod_products_interval', value: settings.productsInterval || 'none sync', description: 'Інтервал синхронізації товарів' },
    { key: 'dilovod_products_hour', value: String(settings.productsHour ?? 6), description: 'Година запуску синхронізації товарів' },
    { key: 'dilovod_products_minute', value: String(settings.productsMinute ?? 0), description: 'Хвилина запуску синхронізації товарів' },
    { key: 'dilovod_synchronization_interval', value: settings.synchronizationInterval || 'daily', description: 'Інтервал синхронізації залишків' },
    { key: 'dilovod_synchronization_hour', value: String(settings.synchronizationHour ?? 6), description: 'Година запуску синхронізації залишків' },
    { key: 'dilovod_synchronization_minute', value: String(settings.synchronizationMinute ?? 0), description: 'Хвилина запуску синхронізації залишків' },
    { key: 'dilovod_synchronization_regular_price', value: String(settings.synchronizationRegularPrice ?? false), description: 'Синхронізація звичайних цін' },
    { key: 'dilovod_synchronization_sale_price', value: String(settings.synchronizationSalePrice ?? false), description: 'Синхронізація акційних цін' },
    { key: 'dilovod_synchronization_stock_quantity', value: String(settings.synchronizationStockQuantity ?? false), description: 'Синхронізація залишків' },
    { key: 'dilovod_orders_interval', value: settings.ordersInterval || 'hourly', description: 'Інтервал синхронізації замовлень' },
    { key: 'dilovod_orders_hour', value: String(settings.ordersHour ?? 5), description: 'Година запуску синхронізації замовлень' },
    { key: 'dilovod_orders_minute', value: String(settings.ordersMinute ?? 5), description: 'Хвилина запуску синхронізації замовлень' },
    { key: 'dilovod_orders_batch_size', value: String(settings.ordersBatchSize ?? 50), description: 'Розмір пакета синхронізації замовлень' },
    { key: 'dilovod_orders_retry_attempts', value: String(settings.ordersRetryAttempts ?? 3), description: 'Кількість повторних спроб синхронізації замовлень' },
    { key: 'dilovod_auto_send_order', value: String(settings.autoSendOrder ?? false), description: 'Автоматичне відправлення замовлень (saleOrder)' },
    { key: 'dilovod_auto_send_list_settings', value: JSON.stringify(settings.autoSendListSettings || []), description: 'Статуси для автовідправки saleOrder' },
    { key: 'dilovod_auto_send_channel_settings', value: JSON.stringify(settings.autoSendChannelSettings || []), description: 'Канали для автовідправки saleOrder' },
    { key: 'dilovod_auto_send_sale', value: String(settings.autoSendSale ?? false), description: 'Автоматичне відвантаження (sale)' },
    { key: 'dilovod_auto_send_sale_list_settings', value: JSON.stringify(settings.autoSendSaleListSettings || []), description: 'Статуси для автовідправки sale' },
    { key: 'dilovod_auto_send_sale_channel_settings', value: JSON.stringify(settings.autoSendSaleChannelSettings || []), description: 'Канали для автовідправки sale' },
    { key: 'dilovod_get_person_by', value: settings.getPersonBy || 'end_user', description: 'Пошук контрагентів' },
    { key: 'dilovod_default_firm_id', value: settings.defaultFirmId || '', description: 'Фірма за замовчуванням' },
    { key: 'dilovod_channel_payment_mapping', value: JSON.stringify(settings.channelPaymentMapping || {}), description: 'Мапінг каналів продажів' },
    { key: 'dilovod_delivery_mappings', value: JSON.stringify(settings.deliveryMappings || []), description: 'Мапінг способів доставки' },
    { key: 'dilovod_log_send_order', value: String(settings.logSendOrder ?? false), description: 'Логування відправки замовлень' },
    { key: 'dilovod_liqpay_commission', value: String(settings.liqpayCommission ?? false), description: 'Комісія LiqPay' }
  ];

  // Використовуємо транзакцію для атомарного збереження
  await prisma.$transaction(async (tx) => {
    for (const setting of settingsToSave) {
      await tx.settingsBase.upsert({
        where: { key: setting.key },
        update: {
          value: setting.value,
          category: 'dilovod',
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          key: setting.key,
          value: setting.value,
          description: setting.description,
          category: 'dilovod',
          isActive: true
        }
      });
    }
  });

  // Очищаємо кеш конфігурації після збереження
  clearConfigCache();

  // Повертаємо оновлені налаштування
  return await getDilovodSettings();
}

/**
 * GET /api/dilovod/test-connection
 * Тест підключення до Dilovod API
 */
router.get('/test-connection', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    const { user } = req as any;

    console.log('=== API: test-connection викликано ===');

    const dilovodService = new DilovodService();
    const result = await dilovodService.testConnection();

    console.log('API: Результат тестування підключення отримано:', result);
    res.json(result);
  } catch (error) {
    console.log('Error testing connection:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Невідома помилка'
    });
  }
});

/**
 * POST /api/dilovod/orders/test
 * Тест отримання замовлення з Dilovod за номером
 */
router.post('/orders/test', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    const { user } = req as any;

    console.log('=== API: dilovod/orders/test викликано ===');

    const {
      orderNumber,
      documentType = 'documents.saleOrder',
      baseDoc,
      includeDetails = false
    } = req.body;

    if (!orderNumber || typeof orderNumber !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Номер замовлення обов\'язковий'
      });
    }

    console.log(`API: Пошук документу типу ${documentType} з номером: ${orderNumber}`);

    // Формуємо payload через утиліту
    const dilovodPayload = buildDilovodPayload({
      orderNumber,
      documentType,
      baseDoc
    });
    const fields = dilovodPayload.params.fields;

    const dilovodService = new DilovodService();

    // Використовуємо універсальний метод пошуку або стандартний для saleOrder
    let orders: any[];
    if (documentType === 'documents.saleOrder') {
      orders = await dilovodService.getOrderByNumber([orderNumber], includeDetails);
    } else if ((documentType === 'documents.sale' || documentType === 'documents.cashIn') && baseDoc) {
      // Пошук документу за baseDoc, коли маємо пов'язаний документ
      orders = await (dilovodService as any).apiClient.searchDocumentByBaseDoc(
        baseDoc,
        documentType,
        fields,
        includeDetails
      );
    } else {
      // Пошук за номером для інших типів документів
      orders = await (dilovodService as any).apiClient.searchDocumentByNumber(
        orderNumber,
        documentType,
        fields,
        includeDetails
      );
    }

    console.log(`API: Знайдено ${orders.length} документів типу ${documentType}`);

    const responsePayload: Record<string, unknown> = {
      success: true,
      message: `Знайдено ${orders.length} замовлення з номером ${orderNumber}`,
      data: orders
    };

    if (includeDetails) {
      responsePayload.details = orders[0]?.details ?? null;
    }

    res.json(responsePayload);
  } catch (error) {
    const errorMessage = handleDilovodApiError(error, 'Order search');
    console.log('API: Помилка в dilovod/orders/test:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Dilovod API error',
      message: errorMessage
    });
  }
});

/**
 * GET /api/dilovod/orders/:orderId/details
 * Отримання детальної інформації про замовлення за ID
 */
router.get('/orders/:orderId/details', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { user } = req as any;

    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'ID замовлення обов\'язковий'
      });
    }

    console.log(`=== API: Отримання деталей замовлення ID: ${orderId} ===`);

    const dilovodService = new DilovodService();
    const orderDetails = await dilovodService.getOrderDetails(orderId);

    res.json({
      success: true,
      message: `Деталі замовлення ${orderId} отримані`,
      data: orderDetails,
      orderId: orderId
    });
  } catch (error) {
    const errorMessage = handleDilovodApiError(error, 'Order details');
    console.log('API: Помилка отримання деталей замовлення:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Dilovod API error',
      message: errorMessage
    });
  }
});

/**
 * GET /api/dilovod/settings
 * Отримання налаштувань Dilovod
 */
router.get('/settings', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { user } = req as any;

    // Отримуємо налаштування з settings_base
    const settings = await getDilovodSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.log('API: Помилка отримання налаштувань Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Невідома помилка'
    });
  }
});

/**
 * POST /api/dilovod/settings
 * Збереження налаштувань Dilovod
 */
router.post('/settings', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const { user } = req as any;

    console.log('=== API: Збереження налаштувань Dilovod ===');

    const settingsData: DilovodSettingsRequest = req.body;

    // Зберігаємо налаштування через допоміжну функцію
    const savedSettings = await saveDilovodSettings(settingsData);

    // Оновлюємо конфігурацію в DilovodService після збереження
    const dilovodService = new DilovodService();
    await dilovodService.reloadApiConfig();

    // Перезапускаємо обидва cron job з новими налаштуваннями
    void cronService.restartProductsSync();
    void cronService.restartStockSync();
    void cronService.restartOrderSync();

    console.log('API: Налаштування Dilovod збережено і конфігурацію оновлено');
    res.json({
      success: true,
      data: savedSettings,
      message: 'Налаштування успішно збережено'
    });
  } catch (error) {
    console.log('API: Помилка збереження налаштувань Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Невідома помилка'
    });
  }
});

/**
 * GET /api/dilovod/directories
 * Отримання довідників з Dilovod (склади, рахунки, форми оплати, фірми)
 */
router.get('/directories', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const { user } = req as any;

    console.log('=== API: Отримання довідників Dilovod ===');

    const dilovodService = new DilovodService();

    // Dilovod API блокує паралельні запити ('multithreadApiSession multithread api request blocked')
    // Тому робимо запити послідовно з обробкою помилок
    let storagesResult: any[] = [];
    let accountsResult: any[] = [];
    let paymentFormsResult: any[] = [];
    let firmsResult: any[] = [];
    let tradeChanelsResult: any[] = [];
    let deliveryMethodsResult: any[] = [];

    try {
      storagesResult = await dilovodService.getStorages();
    } catch (error) {
      console.log('API: ❌ Помилка отримання складів:', error);
    }

    try {
      accountsResult = await dilovodService.getCashAccounts();
    } catch (error) {
      console.log('API: ❌ Помилка отримання рахунків:', error);
    }

    try {
      paymentFormsResult = await dilovodService.getPaymentForms();
    } catch (error) {
      console.log('API: ❌ Помилка отримання форм оплати:', error);
    }

    try {
      firmsResult = await dilovodService.getFirms();
    } catch (error) {
      console.log('API: ❌ Помилка отримання фірм:', error);
    }

    try {
      tradeChanelsResult = await dilovodService.getTradeChanels();
    } catch (error) {
      console.log('API: ❌ Помилка отримання каналів продажів:', error);
    }

    try {
      deliveryMethodsResult = await dilovodService.getDeliveryMethods();
    } catch (error) {
      console.log('API: ❌ Помилка отримання способів доставки:', error);
    }

    // Отримуємо товари з products (будемо використовувати поле products.dilovodId)
    let goodsResult: any[] = [];
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const products = await prisma.product.findMany({
        where: ({ dilovodId: { not: null } } as any),
        orderBy: { sku: 'asc' }
      });

      // Map to expected shape for directories endpoint
      goodsResult = products.map(p => ({
        id: p.id,
        good_id: (p as any).dilovodId,
        productNum: p.sku,
        name: p.name || null,
        parent: null
      }));

      await prisma.$disconnect();
    } catch (error) {
      console.log('API: ❌ Помилка отримання товарів з кешу:', error);
    }

    const directories: DilovodDirectories = {
      storages: storagesResult,
      cashAccounts: accountsResult,
      paymentForms: paymentFormsResult,
      firms: firmsResult,
      tradeChanels: tradeChanelsResult,
      deliveryMethods: deliveryMethodsResult,
      goods: goodsResult
    };

    res.json({
      success: true,
      data: directories
    });
  } catch (error) {
    console.log('API: Помилка отримання довідників Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Невідома помилка'
    });
  }
});

/**
 * GET /api/dilovod/salesdrive/orders
 * Отримання замовлень SalesDrive для моніторингу вивантаження в Dilovod
 */
router.get('/salesdrive/orders', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    // Параметри пагінації
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = req.query.sortBy as string || 'orderDate';
    const sortOrder = req.query.sortOrder as string || 'desc';
    const search = req.query.search as string;
    const searchCategory = (req.query.searchCategory as string) || 'orderNumber'; // 'orderNumber' | 'ttn' | 'phone' | 'name' | 'all'
    const channelsParam = req.query.channels as string;
    const includeUnknown = req.query.includeUnknown === 'true';
    const shipmentStatus = req.query.shipmentStatus as string; // 'shipped' | 'not_shipped'
    const shipmentDateFrom = req.query.shipmentDateFrom as string; // ISO date string
    const shipmentDateTo = req.query.shipmentDateTo as string; // ISO date string
    const statusesParam = req.query.statuses as string; // comma-separated status keys, e.g. '1,2,3'

    const offset = (page - 1) * limit;

    // Побудова умов запиту
    let whereCondition: any = {
      // Виключаємо статуси 6, 7, 8
      NOT: [
        { status: { in: ['8'] } }
      ]
    };

    // Додаємо фільтр каналів, якщо вказано
    if (channelsParam || includeUnknown) {
      const channels = channelsParam ? channelsParam.split(',').filter(ch => ch.trim()) : [];
      
      if (channels.length > 0 && includeUnknown) {
        // Якщо вибрані конкретні канали + невідомі
        whereCondition.OR = [
          { sajt: { in: channels } },
          { sajt: null },
          { sajt: '' }
        ];
      } else if (channels.length > 0) {
        // Тільки конкретні канали
        whereCondition.sajt = { in: channels };
      } else if (includeUnknown) {
        // Тільки невідомі канали
        whereCondition.OR = [
          { sajt: null },
          { sajt: '' }
        ];
      }
    }

    // Додаємо фільтр по статусам
    if (statusesParam) {
      const statuses = statusesParam.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        whereCondition.status = { in: statuses };
      }
    }

    // Додаємо фільтр по відвантаженню та датам (об'єднані)
    if (shipmentDateFrom || shipmentDateTo) {
      // Якщо вказані дати
      const dateFilter: any = {};
      if (shipmentDateFrom) {
        dateFilter.gte = new Date(shipmentDateFrom);
      }
      if (shipmentDateTo) {
        // Додаємо 1 день до кінцевої дати, щоб включити весь день
        const endDate = new Date(shipmentDateTo);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }
      
      // Комбінуємо з статусом відвантаження
      if (shipmentStatus === 'shipped') {
        // Відвантажені в цьому діапазоні: дата відвантаження в діапазоні І не null
        whereCondition.AND = [
          { dilovodSaleExportDate: dateFilter },
          { dilovodSaleExportDate: { not: null } }
        ];
      } else if (shipmentStatus === 'not_shipped') {
        // Не відвантажені в цьому діапазоні: дата замовлення в діапазоні І дата відвантаження null
        whereCondition.AND = [
          { orderDate: dateFilter },
          { dilovodSaleExportDate: null }
        ];
      } else {
        // Просто діапазон дат без статусу - фільтруємо по даті відвантаження (всі замовлення)
        whereCondition.dilovodSaleExportDate = dateFilter;
      }
    } else if (shipmentStatus === 'shipped') {
      // Якщо дати не вказані, але вказано "відвантажені" - показуємо всі відвантажені
      whereCondition.dilovodSaleExportDate = { not: null };
    } else if (shipmentStatus === 'not_shipped') {
      // Якщо дати не вказані, але вказано "не відвантажені" - показуємо всі не відвантажені
      whereCondition.dilovodSaleExportDate = null;
    } else if (shipmentStatus === 'duplicates') {
      // Дублікати: замовлення з більше ніж одним документом відвантаження
      whereCondition.dilovodSaleDocsCount = { gt: 1 };
    }

    // Додаємо пошук, якщо вказано
    if (search) {
      let searchCondition: any;
      switch (searchCategory) {
        case 'ttn': {
          // Якщо введено 4 символи або менше — шукаємо по останніх 4 цифрах ТТН
          const ttnCondition = search.length <= 4
            ? { ttn: { endsWith: search } }
            : { ttn: { contains: search } };
          searchCondition = ttnCondition;
          break;
        }
        case 'phone':
          searchCondition = { customerPhone: { contains: search } };
          break;
        case 'name':
          searchCondition = { customerName: { contains: search } };
          break;
        case 'all':
          searchCondition = {
            OR: [
              { orderNumber: { contains: search } },
              { ttn: { contains: search } },
              { customerName: { contains: search } },
              { customerPhone: { contains: search } }
            ]
          };
          break;
        case 'orderNumber':
        default:
          searchCondition = { orderNumber: { contains: search } };
          break;
      }
      whereCondition = { ...whereCondition, ...searchCondition };
    }

    // Отримуємо замовлення з пагінацією, загальну кількість та групування по статусах паралельно
    // Для groupBy статусів використовуємо умову БЕЗ фільтру статусу,
    // щоб лічильники показували реальну кількість для всіх статусів незалежно від вибраного фільтру
    const { status: _excludedStatus, ...whereConditionForCounts } = whereCondition;
    const [orders, totalCount, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where: whereCondition,
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
        select: {
          id: true,
          externalId: true,
          orderNumber: true,
          orderDate: true,
          updatedAt: true,
          readyToShipAt: true,
          status: true,
          statusText: true,
          paymentMethod: true,
          shippingMethod: true,
          sajt: true,
          dilovodDocId: true,
          dilovodSaleExportDate: true,
          dilovodSaleDocsCount: true,
          dilovodExportDate: true,
          dilovodCashInDate: true,
          dilovodReturnDate: true,
          dilovodReturnDocsCount: true,
          customerName: true,
          customerPhone: true,
          deliveryAddress: true,
          totalPrice: true,
          quantity: true,
          items: true,
          rawData: true
        }
      }),
      prisma.order.count({ where: whereCondition }),
      prisma.order.groupBy({
        by: ['status'],
        where: whereConditionForCounts,
        _count: { status: true }
      })
    ]);

    // Перетворюємо groupBy результат у зручний об'єкт { '1': 42, '2': 17, ... }
    const statusCounts: Record<string, number> = {};
    for (const group of statusGroups) {
      if (group.status !== null) {
        statusCounts[group.status] = group._count.status;
      }
    }

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      statusCounts,
      metadata: {
        fetchedAt: new Date().toISOString(),
        filters: {
          excludedChannel: 'nk-food.shop',
          search: search || null
        },
        sorting: {
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Error fetching SalesDrive orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/check
 * Перевірка наявності замовлень в Dilovod та оновлення локальної бази
 */
router.post('/salesdrive/orders/check', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { orderNumbers, auto, limit, offset, forceAll } = req.body;
    const dilovodService = new DilovodService();

    // AUTO MODE - автоматична перевірка замовлень з неповними даними
    if (auto === true) {
      const isForceAll = forceAll === true;
      console.log(`=== API [AUTO${isForceAll ? '/FORCE_ALL' : ''}]: Перевірка замовлень в Dilovod (limit: ${limit || 100}, offset: ${offset || 0}) ===`, undefined, true);
      
      const result = await dilovodService.checkOrderStatuses(limit || 100, offset || 0, isForceAll);
      return res.json(result);
    }

    // MANUAL MODE - перевірка конкретних номерів замовлень
    if (!Array.isArray(orderNumbers)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'orderNumbers must be an array or auto: true must be provided'
      });
    }

    console.log(`=== API: Перевірка замовлень ${orderNumbers} в Dilovod ===`, undefined, true);

    const result = await dilovodService.checkOrdersByNumbers(orderNumbers);
    return res.json(result);

  } catch (error) {
    const errorMessage = handleDilovodApiError(error, 'Order check');
    console.log('API: Помилка перевірки замовлення в Dilovod:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Dilovod API error',
      message: errorMessage
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/reset-and-check
 * Примусове скидання всіх Dilovod-полів + повторна перевірка в Dilovod API
 * Очищує: dilovodDocId, dilovodExportDate, dilovodCashInDate, dilovodSaleExportDate, dilovodCashInLastChecked, dilovodReturnDate, dilovodReturnDocsCount
 */
router.post('/salesdrive/orders/reset-and-check', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const { orderNumbers } = req.body;

    if (!Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'orderNumbers must be a non-empty array'
      });
    }

    console.log(`=== API: Примусове скидання та перевірка замовлень ${orderNumbers} в Dilovod ===`, undefined, true);

    // Скидаємо всі Dilovod-поля для вказаних замовлень
    const resetResult = await prisma.order.updateMany({
      where: { orderNumber: { in: orderNumbers } },
      data: {
        dilovodDocId: null,
        dilovodExportDate: null,
        dilovodCashInDate: null,
        dilovodSaleExportDate: null,
        dilovodSaleDocsCount: null,
        dilovodCashInLastChecked: null,
        dilovodReturnDate: null,
        dilovodReturnDocsCount: null
      }
    });

    console.log(`Скинуто Dilovod-поля для ${resetResult.count} замовлень`);

    // Запускаємо перевірку в Dilovod API (тепер поля чисті — буде повний пошук)
    const dilovodService = new DilovodService();
    const checkResult = await dilovodService.checkOrdersByNumbers(orderNumbers);

    return res.json({
      ...checkResult,
      resetCount: resetResult.count,
      message: `Скинуто поля для ${resetResult.count} замовлень. ${checkResult.message}`
    });

  } catch (error) {
    const errorMessage = handleDilovodApiError(error, 'Reset and check');
    console.log('API: Помилка примусової перевірки замовлення в Dilovod:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Dilovod API error',
      message: errorMessage
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/:orderId/reset-duplicate-count
 * Скидання лічильника дублікатів відвантаження до 1 (помилка "кілька документів знайдено")
 */
router.post('/salesdrive/orders/:orderId/reset-duplicate-count', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) {
      return res.status(400).json({ success: false, error: 'Invalid orderId' });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, dilovodSaleDocsCount: true } });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { dilovodSaleDocsCount: 1 }
    });

    console.log(`API: Скинуто лічильник дублікатів для замовлення ${order.orderNumber} (було: ${order.dilovodSaleDocsCount} → стало: 1)`);

    return res.json({
      success: true,
      message: `Лічильник дублікатів для замовлення ${order.orderNumber} скинуто до 1`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('API: Помилка скидання лічильника дублікатів:', errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/:orderId/validate
 * Валідувати готовність замовлення до експорту в Dilovod
 */
router.post('/salesdrive/orders/:orderId/validate', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderNum = await orderDatabaseService.getOrderNumberFromId(Number(orderId));

    // Early-exit: перевіряємо локальну БД — якщо вже є dilovodDocId, не витрачаємо час на формування payload
    const localOrder = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: { dilovodDocId: true, dilovodExportDate: true }
    });
    if (localOrder?.dilovodDocId) {
      console.log(`ℹ️ Validate: замовлення ${orderNum} (id: ${orderId}) вже експортовано (baseDocId: ${localOrder.dilovodDocId}) — валідація пропускається`);
      return res.json({
        success: true,
        alreadyExported: true,
        message: `Замовлення ${orderNum} вже експортовано в Dilovod`,
        data: {
          orderId,
          isReadyForExport: false,
          validatedAt: new Date().toISOString()
        },
        metadata: {
          orderNumber: orderNum,
          dilovodDocId: localOrder.dilovodDocId,
          dilovodExportDate: localOrder.dilovodExportDate
        }
      });
    }

    console.log(`=== API: Валідація замовлення ${orderNum} (id: ${orderId}) для експорту в Dilovod ===`, undefined, true);

    // Імпортуємо DilovodExportBuilder
    const { dilovodExportBuilder } = await import('../services/dilovod/DilovodExportBuilder.js');

    try {
      // Спробуємо сформувати payload у dry-run режимі - якщо вдається, то все ОК
      // Виконуємо dry-run, але дозволяємо створювати контрагентів під час валідації
      // щоб кешований payload можна було безпосередньо використовувати при експорті
      const { payload, warnings } = await dilovodExportBuilder.buildExportPayload(orderId, { dryRun: true, allowCreatePerson: true });

      // Збережемо payload у тимчасовий кеш щоб уникнути дублювання створення контрагентів
      const { payloadCacheService } = await import('../services/dilovod/PayloadCacheService.js');
      const token = payloadCacheService.save({ payload, warnings }, 600); // default 10 min

      console.log(`✅ Валідація замовлення ${orderNum} (id: ${orderId}) пройдена успішно`);

      // Валідація успішна
      res.json({
        success: true,
        message: 'Замовлення готове до експорту в Dilovod',
        data: {
          orderId,
          isReadyForExport: true,
          warnings: warnings.length > 0 ? warnings : undefined,
          validatedAt: new Date().toISOString()
        },
        metadata: {
          orderNumber: payload.header.number,
          totalItems: payload.tableParts.tpGoods.length,
          warningsCount: warnings.length,
          token
        }
      });

    } catch (validationError) {
      const errorMessage = validationError instanceof Error ? validationError.message : 'Unknown error';

      // Якщо канал не налаштований для експорту
      if (errorMessage.includes('не налаштований для експорту через Dilovod')) {
        console.log(`❌ Замовлення ${orderNum} (id: ${orderId}) не підлягає експорту через цей інструмент`);

        return res.status(200).json({
          success: false,
          message: 'Замовлення не підлягає експорту через цей інструмент',
          data: {
            orderId,
            isReadyForExport: false,
            validatedAt: new Date().toISOString()
          },
          error: 'channel_not_configured',
          details: errorMessage,
          type: 'channel_configuration_error',
          action_required: 'Це замовлення вивантажується автоматично або іншим способом'
        });
      }

      // Якщо це критична помилка валідації
      if (errorMessage.includes('Експорт заблоковано через критичні помилки:')) {
        console.log(`❌ Валідація замовлення ${orderNum} (id: ${orderId}) не пройдена`);

        return res.status(200).json({
          success: false,
          message: 'Замовлення не готове до експорту',
          data: {
            orderId,
            isReadyForExport: false,
            validatedAt: new Date().toISOString()
          },
          error: 'validation_failed',
          details: errorMessage,
          type: 'critical_validation_error',
          action_required: 'Виправте налаштування Dilovod перед експортом'
        });
      }

      // Інші помилки
      throw validationError;
    }

  } catch (error) {
    console.error('Error validating order for Dilovod export:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/:orderId/export
 * Експортувати замовлення в Dilovod
 */
router.post('/salesdrive/orders/:orderId/export', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderNum = await orderDatabaseService.getOrderNumberFromId(Number(orderId));

    // Перевірка наявності локального запису (dilovodDocId)
    const existingOrder = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: {
        dilovodDocId: true,
        dilovodExportDate: true,
        dilovodSaleExportDate: true,
        dilovodSaleDocsCount: true,
        dilovodCashInDate: true
      }
    });

    if (existingOrder?.dilovodDocId) {
      // Якщо вже є dilovodDocId — не робимо повторний експорт
      console.log(`ℹ️ Замовлення ${orderNum} (id: ${orderId}) вже експортовано в Dilovod (baseDocId: ${existingOrder.dilovodDocId})`);

      // Якщо відсутній dilovodExportDate — синхронізуємо його з Dilovod API синхронно (замовлення вже відоме по DocId)
      let exportDate = existingOrder.dilovodExportDate;
      if (!exportDate) {
        try {
          console.log(`🔄 Відновлення dilovodExportDate для замовлення ${orderNum} (DocId: ${existingOrder.dilovodDocId})...`);
          const { dilovodService: dilovodServiceSync } = await import('../services/dilovod/DilovodService.js');
          const found = (await dilovodServiceSync.getOrderByNumber([orderNum])).flat();
          if (found.length > 0 && found[0].date) {
            exportDate = new Date(found[0].date);
            await prisma.order.update({
              where: { id: parseInt(orderId) },
              data: { dilovodExportDate: exportDate }
            });
            console.log(`✅ dilovodExportDate відновлено: ${exportDate}`);
          }
        } catch (syncErr) {
          console.log(`⚠️ Не вдалося відновити dilovodExportDate: ${syncErr instanceof Error ? syncErr.message : syncErr}`);
        }
      }

      // Запускаємо фонову синхронізацію додаткових полів (sale, cashIn) — не блокуємо відповідь
      const missingAdditional = !existingOrder.dilovodSaleExportDate || !existingOrder.dilovodSaleDocsCount || !existingOrder.dilovodCashInDate;
      if (missingAdditional) {
        console.log(`🔄 Запускаємо фонову синхронізацію додаткових Dilovod-полів для замовлення ${orderNum}`);
        import('../services/dilovod/DilovodService.js')
          .then(({ dilovodService }) => dilovodService.checkOrdersByNumbers([orderNum]))
          .catch(err => console.log(`⚠️ Фонова синхронізація Dilovod-полів не вдалась: ${err instanceof Error ? err.message : err}`));
      }

      return res.json({
        success: true,
        message: `Замовлення ${orderNum} вже експортовано в Dilovod. Нових даних не було оновлено.`,
        exported: false,
        dilovodId: existingOrder.dilovodDocId,
        dilovodExportDate: exportDate,
        data: {
          orderId,
          exportResult: null,
          warnings: []
        },
        metadata: {
          exportedAt: exportDate,
          documentType: null,
          orderNumber: orderNum,
          totalItems: null,
          warningsCount: 0,
          saleToken: null
        }
      });
    }

    // Перевірка в Dilovod API: чи вже існує замовлення (захист від race condition та пропущеного локального стану)
    console.log(`🔍 Перевіряємо в Dilovod API наявність замовлення ${orderNum} перед експортом...`);
    try {
      const { dilovodService: dilovodServiceCheck } = await import('../services/dilovod/DilovodService.js');
      const existingInDilovod = (await dilovodServiceCheck.getOrderByNumber([orderNum])).flat();
      if (existingInDilovod.length > 0) {
        const dilovodDoc = existingInDilovod[0];
        console.log(`⚠️ Замовлення ${orderNum} вже існує в Dilovod (id: ${dilovodDoc.id}) — синхронізуємо локальну БД та блокуємо повторний експорт`);
        // Синхронізуємо локальну БД, щоб наступного разу блокування спрацювало на рівні БД
        await prisma.order.update({
          where: { id: parseInt(orderId) },
          data: {
            dilovodDocId: dilovodDoc.id,
            dilovodExportDate: new Date(dilovodDoc.date || new Date()).toISOString()
          }
        });
        return res.status(409).json({
          success: false,
          error: 'already_exists_in_dilovod',
          message: `Замовлення ${orderNum} вже існує в Dilovod (baseDoc: ${dilovodDoc.id}). Локальну БД синхронізовано. Повторний експорт заблоковано.`,
          data: { dilovodId: dilovodDoc.id, dilovodExportDate: dilovodDoc.date }
        });
      }
    } catch (checkError) {
      // Якщо перевірка не вдалася — логуємо, але не блокуємо (щоб не зупиняти роботу при недоступності API)
      console.log(`⚠️ Не вдалося перевірити наявність замовлення ${orderNum} в Dilovod API: ${checkError instanceof Error ? checkError.message : checkError}. Продовжуємо експорт.`);
    }

    console.log(`=== API: Експорт замовлення ${orderNum} (id: ${orderId}) в Dilovod ===`);

    // Імпортуємо DilovodExportBuilder
    const { dilovodExportBuilder } = await import('../services/dilovod/DilovodExportBuilder.js');

    // Перевіряємо, чи є token для повторного використання payload з validation
    const { token } = req.body || {};
    let payload: any;
    let warnings: string[] = [];

    if (token) {
      const { payloadCacheService } = await import('../services/dilovod/PayloadCacheService.js');
      const cached = payloadCacheService.get(token, true); // single-use
      if (cached && cached.payload) {
        payload = cached.payload;
        warnings = cached.warnings || [];
        console.log(`🧩 Використовуємо cached payload для токена ${token}`);
        // Для кешованого payload ми більше не створюємо контрагентів у коді експортного маршруту.
        // Тепер person буде створений під час валідації (validate) і записаний у кеш.
        if (!payload?.header?.person?.id) {
          console.log(`⚠️ Cached payload для токена ${token} не містить person.id — перевірте, що запускалася validate з allowCreatePerson`);
        }
      } else {
        console.log(`⚠️ Token ${token} не знайдено або вже використаний — будуємо payload заново`);
        const result = await dilovodExportBuilder.buildExportPayload(orderId);
        payload = result.payload;
        warnings = result.warnings;
      }
    } else {
      // Формуємо payload через ExportBuilder
      const result = await dilovodExportBuilder.buildExportPayload(orderId);
      payload = result.payload;
      warnings = result.warnings;
    }

    console.log(`✅ Payload для замовлення ${orderNum} (id: ${orderId}) успішно сформовано`);

    // Відправляємо payload в Dilovod через DilovodService
    try {
      // Використовуємо коректний singleton import
      const { dilovodService } = await import('../services/dilovod/DilovodService.js');
      const exportResult = await dilovodService.exportOrderToDilovod(payload);

      // Визначаємо статус відповіді
      const isExportError = isDilovodExportError(exportResult);
      const exportErrorMessage = isExportError ? getDilovodExportErrorMessage(exportResult) : '';

      // Якщо експорт успішний і є baseDoc ID - зберігаємо в БД
      if (!isExportError && exportResult?.id) {
        try {
          await prisma.order.updateMany({
            where: { id: parseInt(orderId) },
            data: {
              dilovodDocId: exportResult.id,
              dilovodExportDate: new Date().toISOString()
            }
          });
          console.log(`✅ baseDoc ID (${exportResult.id}) збережено для замовлення ${orderNum} (id: ${orderId})`);
        } catch (dbError) {
          console.log(`❌ Помилка збереження baseDoc ID в БД:`, dbError);
        }
      }

      // Після успішного експорту зберігаємо короткочасний токен для документа sale
      // в payloadCacheService щоб unique sale flow міг використати baseDoc та personId без повторного побудування
      let saleToken: string | undefined;
      if (!isExportError && exportResult?.id) {
        try {
          const { payloadCacheService } = await import('../services/dilovod/PayloadCacheService.js');
          const saleData = {
            baseDocId: exportResult.id,
            personId: payload?.header?.person?.id
          };
          saleToken = payloadCacheService.save(saleData, 600); // same default TTL
          console.log(`🔐 Згенеровано sale token ${saleToken} для замовлення ${orderNum} (orderId: ${orderId}, baseDoc: ${exportResult.id})`);
          console.log('🔒 sale token data:', saleData);
        } catch (err) {
          console.log('❌ Помилка при створенні sale token:', err);
        }
      }

      // Логування в MetaLog
      // Для помилок: записуємо коротку версію в message, повну в data.error
      // Для message збережемо коротку, читабельну версію помилки (назва + артикул)
      let metaLogMessage = isExportError
        ? (exportResult?.error ? cleanDilovodErrorMessageShort(String(exportResult.error)) || `Помилка експорту замовлення ${orderNum}` : `Помилка експорту замовлення ${orderNum}`)
        : `Замовлення ${orderNum} експортовано успішно`;

      const metaLogData: any = {
        orderId,
        orderNumber: orderNum,
        payload,
        exportResult,
        warnings: warnings.length > 0 ? warnings : undefined
      };

      // Якщо помилка від Dilovod — додаємо повну версію в data.error
      if (isExportError && exportResult?.error) {
        metaLogData.error = cleanDilovodErrorMessageFull(String(exportResult.error));
      }

      await dilovodService.logMetaDilovodExport({
        title: 'Dilovod export result',
        status: isExportError ? 'error' : 'success',
        message: metaLogMessage,
        initiatedBy: req.user ? String(req.user.userId) : 'unknown',
        data: metaLogData
      });

      const mainMessage = isExportError
        ? `Помилка експорту замовлення ${orderNum} в Dilovod: ${exportErrorMessage}`
        : `Замовлення ${orderNum} експортовано в Dilovod успішно`;

      res.json({
        success: !isExportError,
        message: mainMessage,
        exported: !isExportError,
        dilovodId: exportResult?.id,
        dilovodExportDate: !isExportError ? new Date().toISOString() : undefined,
        data: {
          orderId,
          exportResult,
          warnings: warnings.length > 0 ? warnings : undefined
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          documentType: payload.header.id,
          orderNum,
          totalItems: payload.tableParts.tpGoods.length,
          warningsCount: warnings.length,
          saleToken
        }
      });
    } catch (exportError) {
      console.error('Помилка експорту замовлення в Dilovod:', exportError);
      res.status(500).json({
        success: false,
        error: 'Dilovod export error',
        message: exportError instanceof Error ? exportError.message : 'Unknown error',
        data: {
          orderId,
          payload,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      });
    }

  } catch (error) {
    console.error('Error exporting order to Dilovod:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Якщо канал не налаштований для експорту
    if (errorMessage.includes('не налаштований для експорту через Dilovod')) {
      return res.status(400).json({
        success: false,
        error: 'channel_not_configured',
        message: 'Замовлення не підлягає експорту через цей інструмент',
        details: errorMessage,
        type: 'channel_configuration_error',
        action_required: 'Це замовлення вивантажується автоматично або іншим способом'
      });
    }

    // Перевіряємо, чи це критична помилка валідації
    if (errorMessage.includes('Експорт заблоковано через критичні помилки:')) {
      // Логуємо в meta_logs
      const exportOrderId = req.params.orderId;
      try {
        const { dilovodService: dilovodServiceLog } = await import('../services/dilovod/DilovodService.js');
        const { orderDatabaseService: ods } = await import('../services/orderDatabaseService.js');
        const exportOrderNum = await ods.getOrderNumberFromId(Number(exportOrderId)).catch(() => null);
        await dilovodServiceLog.logMetaDilovodExport({
          title: 'Manual export error (saleOrder)',
          status: 'error',
          message: `[Ручний] Помилка export замовлення ${exportOrderNum || exportOrderId}: ${errorMessage}`,
          initiatedBy: `manual:user:${req.user?.email || req.user?.role || 'unknown'}`,
          data: { orderId: exportOrderId, orderNumber: exportOrderNum, errorMessage }
        });
      } catch { /* ігноруємо помилку логування */ }

      // Критична помилка валідації - повертаємо статус 400 (Bad Request)
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Експорт заблоковано через критичні помилки конфігурації',
        details: errorMessage,
        type: 'critical_validation_error',
        action_required: 'Виправте налаштування Dilovod перед повторною спробою експорту'
      });
    }

    // Інші помилки - внутрішня помилка сервера
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: errorMessage
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/:orderId/shipment
 * Створити документ відвантаження в Dilovod на основі baseDoc
 */
router.post('/salesdrive/orders/:orderId/shipment', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderNum = await orderDatabaseService.getOrderNumberFromId(Number(orderId));

    console.log(`=== API: Створення документа відвантаження для замовлення ${orderNum} (id: ${orderId}) в Dilovod ===`, undefined, true);

    // Отримуємо замовлення з БД
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Замовлення ${orderNum} (id: ${orderId}) не знайдено в базі даних`
      });
    }

    // Дозволяємо передавати token щоб повторно використати baseDoc/person з export
    const { token } = req.body || {};
    let cached: any = null;
    if (token) {
      const { payloadCacheService } = await import('../services/dilovod/PayloadCacheService.js');
      cached = payloadCacheService.get(token, true);
      if (cached && cached.baseDocId) {
        // Використовуємо baseDoc з кеша (single-use)
        order.dilovodDocId = cached.baseDocId;
        console.log(`🔁 Використовуємо sale token ${token} -> baseDoc ${cached.baseDocId}`);
        if (cached.personId) {
          console.log(`🔁 sale token містить personId: ${cached.personId} — буде передано у buildSalePayload`);
        } else {
          console.log(`🔁 sale token ${token} не містить personId (буде побудовано на основі бази)`);
        }
      }
      // Якщо в кеші є personId — можна його додатково зберегти/використати в buildSalePayload, але наразі переходимо далі
    }

    // Перевіряємо наявність baseDoc ID
    if (!order.dilovodDocId) {
      return res.status(400).json({
        success: false,
        error: 'No baseDoc ID',
        message: `Замовлення ${orderNum} (id: ${orderId}) ще не експортоване в Діловод (відсутній baseDoc ID)`,
        action_required: 'Спочатку експортуйте замовлення в Діловод'
      });
    }

    // Перевіряємо, чи вже створений документ відвантаження (локальна БД)
    if (order.dilovodSaleExportDate) {
      return res.status(409).json({
        success: false,
        error: 'Already shipped',
        message: `Документ відвантаження для замовлення ${orderNum} (id: ${orderId}) вже створений (${new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA')})`,
        data: {
          dilovodSaleExportDate: order.dilovodSaleExportDate
        }
      });
    }

    // Перевірка в Dilovod API: чи вже існує documents.sale (захист від дублів при порожній локальній даті)
    console.log(`🔍 Перевіряємо в Dilovod API наявність документа відвантаження для замовлення ${orderNum} (baseDoc: ${order.dilovodDocId}) перед відправкою...`);
    try {
      const { dilovodService: dilovodServiceCheck } = await import('../services/dilovod/DilovodService.js');
      const existingSaleDocs = await dilovodServiceCheck.getDocuments([order.dilovodDocId!], 'sale');
      if (existingSaleDocs.length > 0) {
        const saleDoc = existingSaleDocs[0];
        const saleCount = existingSaleDocs.length;
        console.log(`⚠️ В Dilovod вже існує ${saleCount} документ(ів) відвантаження для замовлення ${orderNum} (sale id: ${saleDoc.id}) — синхронізуємо та блокуємо`);
        // Синхронізуємо локальну БД
        await prisma.order.update({
          where: { id: parseInt(orderId) },
          data: {
            dilovodSaleExportDate: new Date(saleDoc.date || new Date()).toISOString(),
            dilovodSaleDocsCount: saleCount
          }
        });
        return res.status(409).json({
          success: false,
          error: 'already_shipped_in_dilovod',
          message: `В Dilovod вже існує ${saleCount} документ(ів) відвантаження для замовлення ${orderNum}${saleCount > 1 ? ' (ДУБЛІКАТИ!)' : ''}. Локальну БД синхронізовано. Повторне відвантаження заблоковано.`,
          data: {
            saleDocId: saleDoc.id,
            saleDocDate: saleDoc.date,
            saleDocsCount: saleCount
          }
        });
      }
    } catch (checkError) {
      // Якщо перевірка не вдалася — логуємо, але не блокуємо
      console.log(`⚠️ Не вдалося перевірити наявність documents.sale для замовлення ${orderNum} в Dilovod API: ${checkError instanceof Error ? checkError.message : checkError}. Продовжуємо відвантаження.`);
    }

    // Імпортуємо DilovodExportBuilder для створення payload відвантаження
    const { dilovodExportBuilder } = await import('../services/dilovod/DilovodExportBuilder.js');

    // Формуємо payload для документа відвантаження (documents.sale)
    const { payload: salePayload, warnings } = await dilovodExportBuilder.buildSalePayload(orderId, order.dilovodDocId, { personId: cached?.personId });

    console.log(`✅ Payload для документа відвантаження ${orderNum} (id: ${orderId}) успішно сформовано`);

    // Відправляємо payload в Dilovod через DilovodService
    try {
      const { dilovodService } = await import('../services/dilovod/DilovodService.js');
      const exportResult = await dilovodService.exportOrderToDilovod(salePayload);

      const isExportError = isDilovodExportError(exportResult);
      const exportErrorMessage = isExportError ? getDilovodExportErrorMessage(exportResult) : '';
      const orderNumber = orderNum || orderId;

      // Якщо експорт успішний - оновлюємо дату відвантаження — ТІЛЬКИ якщо немає жодної помилки
      if (!isExportError && exportResult?.id) {
        try {
          // Використовуємо readyToShipAt, якщо воно встановлено, інакше поточну дату
          const shipmentDate = order.readyToShipAt 
            ? new Date(order.readyToShipAt).toISOString()
            : new Date().toISOString();
          
          await prisma.order.updateMany({
            where: { id: parseInt(orderId) },
            data: {
              dilovodSaleExportDate: shipmentDate
            }
          });
          
          const dateSource = order.readyToShipAt ? 'з readyToShipAt' : 'поточна дата';
          console.log(`✅ Дату відвантаження (${dateSource}) збережено для замовлення #${orderNumber} (id: ${orderId})`);
        } catch (dbError) {
          console.log(`❌ Помилка збереження дати відвантаження в БД:`, dbError);
        }
      } else if (isExportError) {
        console.log(`❌ Відвантаження для замовлення #${orderNumber} НЕ збережено в БД: ${exportErrorMessage}`);
      }

      // Логування в MetaLog
      // Для помилок: записуємо коротку версію в message, повну в data.error
      // Для message збережемо коротку, читабельну версію помилки (назва + артикул)
      let metaLogMessage = isExportError
        ? (exportResult?.error ? cleanDilovodErrorMessageShort(String(exportResult.error)) || exportErrorMessage : exportErrorMessage)
        : 'Shipment created successfully';

      const metaLogData: any = {
        orderId,
        orderNumber,
        baseDoc: order.dilovodDocId,
        payload: salePayload,
        exportResult,
        warnings: warnings.length > 0 ? warnings : undefined
      };

      // Якщо помилка від Dilovod — додаємо повну версію в data.error
      if (isExportError && exportResult?.error) {
        metaLogData.error = cleanDilovodErrorMessageFull(String(exportResult.error));
      }

      await dilovodService.logMetaDilovodExport({
        title: 'Dilovod shipment export result',
        status: isExportError ? 'error' : 'success',
        message: metaLogMessage,
        initiatedBy: req.user ? String(req.user.userId) : 'unknown',
        data: metaLogData
      });

      const mainMessage = isExportError
        ? `Помилка створення відвантаження для замовлення ${orderNumber}: ${exportErrorMessage}`
        : `Документ відвантаження для замовлення ${orderNumber} успішно створений`;

      res.json({
        success: !isExportError,
        created: !isExportError,
        message: mainMessage,
        dilovodSaleExportDate: !isExportError ? new Date().toISOString() : undefined,
        data: {
          orderId,
          baseDoc: order.dilovodDocId,
          exportResult,
          warnings: warnings.length > 0 ? warnings : undefined
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          documentType: 'documents.sale',
          orderNumber,
          warningsCount: warnings.length
        }
      });

    } catch (exportError) {
      console.error('Помилка створення відвантаження в Dilovod:', exportError);
      res.status(500).json({
        success: false,
        error: 'Dilovod export error',
        message: exportError instanceof Error ? exportError.message : 'Unknown error',
        data: {
          orderId,
          baseDoc: order.dilovodDocId,
          payload: salePayload,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      });
    }

  } catch (error) {
    console.error('Error creating shipment in Dilovod:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: errorMessage
    });
  }
});

/**
 * GET /api/dilovod/salesdrive/payment-methods
 * Отримати список методів оплати з SalesDrive API
 * 
 * Використовується в UI для налаштування мапінгу каналів оплати
 */
router.get('/salesdrive/payment-methods', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    const { salesDriveService } = await import('../services/salesDriveService.js');
    const paymentMethods = await salesDriveService.fetchPaymentMethods();

    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('❌ [API] Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment methods',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/dilovod/cache/status
 * Отримати статус кешу довідників Dilovod
 */
router.get('/cache/status', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    const { dilovodCacheService } = await import('../services/dilovod/DilovodCacheService.js');

    const status = await dilovodCacheService.getAllCacheStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ [API] Error getting cache status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/dilovod/cache/refresh
 * Примусово оновити кеш довідників Dilovod
 */
router.post('/cache/refresh', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
  try {
    const { user } = req as any;

    console.log('=== API: Примусове оновлення кешу довідників Dilovod ===');

    const dilovodService = new DilovodService();

    // Оновлюємо весь кеш (НЕ паралельно, щоб уникнути multithreadApiSession blocked)
    const result = await dilovodService.refreshAllDirectoriesCache();

    console.log('API: Кеш оновлено успішно');
    res.json({
      success: true,
      data: result,
      message: 'Кеш довідників успішно оновлено'
    });
  } catch (error) {
    console.log('API: Помилка оновлення кешу довідників Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Невідома помилка'
    });
  }
});

/**
 * GET /api/dilovod/cache/fresh-skus
 * Отримати свіжі SKU напряму з WordPress (без використання кешу)
 */
router.get('/cache/fresh-skus', authenticateToken, async (req, res) => {
  try {
    const { DilovodCacheManager } = await import('../services/dilovod/DilovodCacheManager.js');
    const manager = new DilovodCacheManager();
    const skus = await manager.fetchFreshSkusFromWordPress();
    res.json({ success: true, data: skus });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export { router as dilovodRouter };