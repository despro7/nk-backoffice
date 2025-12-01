import { Router } from 'express';
import { buildDilovodPayload } from '../../shared/utils/dilovodPayloadBuilder.js';
import { authenticateToken } from '../middleware/auth.js';
import { DilovodService, logWithTimestamp } from '../services/dilovod/index.js';
import { handleDilovodApiError, clearConfigCache } from '../services/dilovod/DilovodUtils.js';
import { PrismaClient } from '@prisma/client';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
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
    storageIdsList: parseJsonSafe(settingsMap.get('dilovod_storage_ids_list'), []),
    storageId: settingsMap.get('dilovod_storage_id'),
    synchronizationInterval: (settingsMap.get('dilovod_synchronization_interval') as DilovodSettings['synchronizationInterval']) || 'daily',
    synchronizationRegularPrice: parseBool(settingsMap.get('dilovod_synchronization_regular_price')),
    synchronizationSalePrice: parseBool(settingsMap.get('dilovod_synchronization_sale_price')),
    synchronizationStockQuantity: parseBool(settingsMap.get('dilovod_synchronization_stock_quantity')),
    autoSendOrder: parseBool(settingsMap.get('dilovod_auto_send_order')),
    cronSendOrder: parseBool(settingsMap.get('dilovod_cron_send_order')),
    autoSendListSettings: parseJsonSafe(settingsMap.get('dilovod_auto_send_list_settings'), []),
    unloadOrderNumberAs: (settingsMap.get('dilovod_unload_order_number_as') as DilovodSettings['unloadOrderNumberAs']) || 'dilovod',
    unloadOrderAs: (settingsMap.get('dilovod_unload_order_as') as DilovodSettings['unloadOrderAs']) || 'sale',
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
    { key: 'dilovod_storage_ids_list', value: JSON.stringify(settings.storageIdsList || []), description: 'Список ID складів' },
    { key: 'dilovod_storage_id', value: settings.storageId || '', description: 'Основний склад для списання' },
    { key: 'dilovod_synchronization_interval', value: settings.synchronizationInterval || 'daily', description: 'Інтервал синхронізації' },
    { key: 'dilovod_synchronization_regular_price', value: String(settings.synchronizationRegularPrice ?? false), description: 'Синхронізація звичайних цін' },
    { key: 'dilovod_synchronization_sale_price', value: String(settings.synchronizationSalePrice ?? false), description: 'Синхронізація акційних цін' },
    { key: 'dilovod_synchronization_stock_quantity', value: String(settings.synchronizationStockQuantity ?? false), description: 'Синхронізація залишків' },
    { key: 'dilovod_auto_send_order', value: String(settings.autoSendOrder ?? false), description: 'Автоматичне відправлення замовлень' },
    { key: 'dilovod_cron_send_order', value: String(settings.cronSendOrder ?? false), description: 'Cron відправлення замовлень' },
    { key: 'dilovod_auto_send_list_settings', value: JSON.stringify(settings.autoSendListSettings || []), description: 'Статуси для автовідправки' },
    { key: 'dilovod_unload_order_number_as', value: settings.unloadOrderNumberAs || 'dilovod', description: 'Формат номера замовлення' },
    { key: 'dilovod_unload_order_as', value: settings.unloadOrderAs || 'sale', description: 'Тип документа замовлення' },
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
router.get('/test-connection', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    logWithTimestamp('=== API: test-connection викликано ===');

    const dilovodService = new DilovodService();
    const result = await dilovodService.testConnection();

    logWithTimestamp('API: Результат тестування підключення отримано:', result);
    res.json(result);
  } catch (error) {
    logWithTimestamp('Error testing connection:', error);
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
router.post('/orders/test', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    logWithTimestamp('=== API: dilovod/orders/test викликано ===');

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

    logWithTimestamp(`API: Пошук документу типу ${documentType} з номером: ${orderNumber}`);

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

    logWithTimestamp(`API: Знайдено ${orders.length} документів типу ${documentType}`);

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
    logWithTimestamp('API: Помилка в dilovod/orders/test:', errorMessage);
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
router.get('/orders/:orderId/details', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'ID замовлення обов\'язковий'
      });
    }

    logWithTimestamp(`=== API: Отримання деталей замовлення ID: ${orderId} ===`);

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
    logWithTimestamp('API: Помилка отримання деталей замовлення:', errorMessage);
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
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    // Отримуємо налаштування з settings_base
    const settings = await getDilovodSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logWithTimestamp('API: Помилка отримання налаштувань Dilovod:', error);
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
router.post('/settings', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    logWithTimestamp('=== API: Збереження налаштувань Dilovod ===');

    const settingsData: DilovodSettingsRequest = req.body;

    // Зберігаємо налаштування через допоміжну функцію
    const savedSettings = await saveDilovodSettings(settingsData);

    // Оновлюємо конфігурацію в DilovodService після збереження
    const dilovodService = new DilovodService();
    await dilovodService.reloadApiConfig();

    logWithTimestamp('API: Налаштування Dilovod збережено і конфігурацію оновлено');
    res.json({
      success: true,
      data: savedSettings,
      message: 'Налаштування успішно збережено'
    });
  } catch (error) {
    logWithTimestamp('API: Помилка збереження налаштувань Dilovod:', error);
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
router.get('/directories', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    logWithTimestamp('=== API: Отримання довідників Dilovod ===');

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
      logWithTimestamp('API: ❌ Помилка отримання складів:', error);
    }

    try {
      accountsResult = await dilovodService.getCashAccounts();
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання рахунків:', error);
    }

    try {
      paymentFormsResult = await dilovodService.getPaymentForms();
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання форм оплати:', error);
    }

    try {
      firmsResult = await dilovodService.getFirms();
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання фірм:', error);
    }

    try {
      tradeChanelsResult = await dilovodService.getTradeChanels();
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання каналів продажів:', error);
    }

    try {
      deliveryMethodsResult = await dilovodService.getDeliveryMethods();
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання способів доставки:', error);
    }

    // Отримуємо товари з products (будемо використовувати поле products.dilovodGood)
    let goodsResult: any[] = [];
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const products = await prisma.product.findMany({
        where: ({ dilovodGood: { not: null } } as any),
        orderBy: { sku: 'asc' }
      });

      // Map to expected shape for directories endpoint
      goodsResult = products.map(p => ({
        id: p.id,
        good_id: (p as any).dilovodGood,
        productNum: p.sku,
        name: p.name || null,
        parent: null
      }));

      await prisma.$disconnect();
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання товарів з кешу:', error);
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
    logWithTimestamp('API: Помилка отримання довідників Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Невідома помилка'
    });
  }
});

/**
 * GET /api/dilovod/salesdrive/orders
 * Отримання замовлень SalesDrive (крім каналу nk-food.shop) для моніторингу вивантаження в Dilovod
 */
router.get('/salesdrive/orders', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    // Параметри пагінації
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = req.query.sortBy as string || 'orderDate';
    const sortOrder = req.query.sortOrder as string || 'desc';
    const search = req.query.search as string;

    const offset = (page - 1) * limit;

    // Побудова умов запиту
    let whereCondition: any = {
      // Виключаємо канал продажів "nk-food.shop" (sajt: "19") І статуси 6, 7, 8
      NOT: [
        { sajt: '19' },
        { status: { in: ['6', '7', '8'] } }
      ]
    };

    // Додаємо пошук, якщо вказано
    if (search) {
      whereCondition = {
        ...whereCondition,
        OR: [
          { orderNumber: { contains: search } },
          { customerName: { contains: search } },
          { customerPhone: { contains: search } }
        ]
      };
    }

    // Отримуємо замовлення з пагінацією
    const orders = await prisma.order.findMany({
      where: whereCondition,
      orderBy: {
        [sortBy]: sortOrder
      },
      skip: offset,
      take: limit,
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        orderDate: true,
        updatedAt: true,
        status: true,
        statusText: true,
        paymentMethod: true,
        shippingMethod: true,
        sajt: true, // канал продажів
        dilovodDocId: true,
        dilovodSaleExportDate: true,
        dilovodExportDate: true,
        dilovodCashInDate: true,
        customerName: true,
        customerPhone: true,
        deliveryAddress: true,
        totalPrice: true,
        quantity: true,
        items: true,
        rawData: true
      }
    });

    // Підраховуємо загальну кількість для пагінації
    const totalCount = await prisma.order.count({
      where: whereCondition
    });

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
router.post('/salesdrive/orders/check', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { orderNumbers } = req.body;
    if (!Array.isArray(orderNumbers)) {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'orderNumbers must be an array'
      });
    }

    logWithTimestamp(`=== API: Перевірка замовлень ${orderNumbers} в Dilovod ===`, undefined, true);

    const results = [];
    const baseDocIds: string[] = [];
    const orderMap = new Map<string, { normalizedNumber: string; dilovodId: string; dilovodExportDate: string | Date }>();

    // Спочатку перевіряємо в локальній базі, які замовлення вже мають dilovodDocId
    const checks = await Promise.all(
      orderNumbers
        .filter(num => num)
        .map(async num => {
          const normalized = String(num).replace(/[^\d]/g, "");
          const existing = await orderDatabaseService.getOrderByExternalId(normalized);

          return {
            num,
            baseDocId: existing?.dilovodDocId || null,
            dilovodExportDate: existing?.dilovodExportDate || null,
            dilovodSaleExportDate: existing?.dilovodSaleExportDate || null,
            dilovodCashInDate: existing?.dilovodCashInDate || null
          };
        })
    );

    const validOrders = checks.filter(item => !item.baseDocId).map(item => item.num);
    const passedOrders = checks.filter(item => item.baseDocId);

    // Обробляємо замовлення, які вже мають dilovodDocId в локальній базі
    for (const item of passedOrders) {
      logWithTimestamp(`API [dilovod.ts]: Пропускаємо замовлення ${item.num} — вже має dilovodDocId в локальній базі`);

      const normalizedNumber = String(item.num).replace(/[^\d]/g, "");

      baseDocIds.push(item.baseDocId);
      orderMap.set(item.baseDocId, {
        normalizedNumber,
        dilovodId: item.baseDocId,
        dilovodExportDate: item.dilovodExportDate
      });

      results.push({
        orderNumber: item.num,
        dilovodId: item.baseDocId,
        dilovodExportDate: item.dilovodExportDate,
        dilovodSaleExportDate: item.dilovodSaleExportDate,
        dilovodCashInDate: item.dilovodCashInDate,
        updatedCount: 0,
        success: true,
        warnings: ['Замовлення вже має dilovodDocId в локальній базі — пропущено']
      });
    }

    // Використовуємо DilovodService для пошуку замовлень
    const dilovodService = new DilovodService();
    const dilovodOrders = validOrders.length > 0 ? (await dilovodService.getOrderByNumber(validOrders)).flat() : []; // Повертає массив об’єктів замовлень (з flatt'ингом для обробки вкладених масивів)

    // Цикл 1: Оновлюємо базову інформацію та збираємо baseDoc для батч-запиту
    for (const dilovodOrder of dilovodOrders) {

      // Перевіряємо наявність orderNumber
      if (!dilovodOrder.number) {
        results.push({
          orderNumber: dilovodOrder.number || 'unknown',
          error: 'Missing number or id in Dilovod order',
          success: false
        });
        continue;
      }

      // Нормалізуємо номер (прибираємо префікси/суфікси)
      const normalizedNumber = String(dilovodOrder.number).replace(/[^\d]/g, "");
      const baseDoc = dilovodOrder.id;

      try {
        // Оновлюємо запис у локальній базі з базовою інформацією
        const updateData: any = {
          dilovodExportDate: new Date(dilovodOrder.date).toISOString(),
          dilovodDocId: baseDoc
        };

        const updatedOrder = await prisma.order.updateMany({
          where: { orderNumber: normalizedNumber },
          data: updateData
        });

        if (updatedOrder.count > 0) {
          // Зберігаємо baseDoc для батч-запиту
          baseDocIds.push(baseDoc);
          orderMap.set(baseDoc, {
            normalizedNumber,
            dilovodId: dilovodOrder.id,
            dilovodExportDate: dilovodOrder.date
          });

          results.push({
            orderNumber: normalizedNumber,
            dilovodId: dilovodOrder.id,
            dilovodExportDate: dilovodOrder.date,
            updatedCount: updatedOrder.count,
            success: true
          });
        } else {
          results.push({
            orderNumber: normalizedNumber,
            dilovodId: dilovodOrder.id,
            error: 'Order not found in local database',
            success: false
          });
        }
      } catch (err) {
        results.push({
          orderNumber: normalizedNumber,
          dilovodId: dilovodOrder.id,
          error: err instanceof Error ? err.message : String(err),
          success: false
        });
      }
    }

    // Оптимізована перевірка: спочатку шукаємо існуючі sale/cashIn документи в локальній базі
    if (baseDocIds.length > 0) {
      try {
        // Отримуємо існуючі записи з локальної бази
        const existingOrders = await prisma.order.findMany({
          where: {
            dilovodDocId: { in: baseDocIds }
          },
          select: {
            orderNumber: true,
            dilovodDocId: true,
            dilovodSaleExportDate: true,
            dilovodCashInDate: true
          }
        });

        // Визначаємо, для яких baseDocIds потрібен запит до Dilovod API
        const needSaleRequest = baseDocIds.filter(id => {
          const order = existingOrders.find(o => o.dilovodDocId === id);
          return !order || !order.dilovodSaleExportDate;
        });
        const needCashInRequest = baseDocIds.filter(id => {
          const order = existingOrders.find(o => o.dilovodDocId === id);
          return !order || !order.dilovodCashInDate;
        });

        let saleDocuments: any[] = [];
        let cashInDocuments: any[] = [];

        if (needSaleRequest.length > 0) {
          logWithTimestamp(`Виконуємо запит getDocuments() для ${needSaleRequest.length} baseDoc (sale)...`);
          saleDocuments = await dilovodService.getDocuments(needSaleRequest, 'sale');
        }
        if (needCashInRequest.length > 0) {
          logWithTimestamp(`Виконуємо запит getDocuments() для ${needCashInRequest.length} baseDoc (cashIn)...`);
          cashInDocuments = await dilovodService.getDocuments(needCashInRequest, 'cashIn');
        }

        // Групуємо за baseDoc (беремо перший документ якщо їх кілька)
        const groupByBaseDoc = (docs: any[]) => {
          const map = new Map<string, any>();
          for (const d of docs) {
            if (!d?.baseDoc) continue;
            if (!map.has(d.baseDoc)) {
              map.set(d.baseDoc, d);
            }
          }
          return map;
        };

        const saleByBaseDoc = groupByBaseDoc(saleDocuments);
        const cashInByBaseDoc = groupByBaseDoc(cashInDocuments);

        for (const baseDoc of baseDocIds) {
          const orderInfo = orderMap.get(baseDoc);
          if (!orderInfo) continue;

          // Перевіряємо, чи вже є дані в локальній базі
          const localOrder = existingOrders.find(o => o.dilovodDocId === baseDoc);
          const updateData: any = {};

          // Якщо немає або неактуальні дані — оновлюємо
          if (!localOrder?.dilovodSaleExportDate && saleByBaseDoc.get(baseDoc)?.date) {
            updateData.dilovodSaleExportDate = new Date(saleByBaseDoc.get(baseDoc).date).toISOString();
          }
          if (!localOrder?.dilovodCashInDate && cashInByBaseDoc.get(baseDoc)?.date) {
            updateData.dilovodCashInDate = new Date(cashInByBaseDoc.get(baseDoc).date).toISOString();
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.order.updateMany({
              where: { orderNumber: orderInfo.normalizedNumber },
              data: updateData
            });

            const resultIndex = results.findIndex(r => r.orderNumber === orderInfo.normalizedNumber);
            if (resultIndex !== -1) {
              results[resultIndex] = {
                ...results[resultIndex],
                dilovodSaleExportDate: updateData.dilovodSaleExportDate || localOrder?.dilovodSaleExportDate,
                updatedCountSale: updateData.dilovodSaleExportDate ? 1 : 0,
                dilovodCashInDate: updateData.dilovodCashInDate || localOrder?.dilovodCashInDate,
                updatedCountCashIn: updateData.dilovodCashInDate ? 1 : 0
              };
            }

            results.push({
              orderNumber: orderInfo.normalizedNumber,
              updatedCount: updateData.dilovodSaleExportDate || updateData.dilovodCashInDate ? 1 : 0,
              success: true
            });
          }
        }
        logWithTimestamp('Оновлення документів Sale/CashIn завершено (запити лише для відсутніх)');
      } catch (err) {
        logWithTimestamp('Помилка під час оновлення Sale/CashIn:', err);
      }
    }

    // Підсумовуємо результати
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    const hasError = errorCount > 0;
    const updatedCount = results.reduce((acc, r) => acc + (r.updatedCount || 0), 0);

    const errorDetails = hasError
      ? results.filter(r => !r.success).map(r => ({
        orderNumber: r.orderNumber,
        dilovodId: r.dilovodId,
        error: r.error
      }))
      : undefined;

    let message = '';
    if (hasError) {
      message = `Перевірка завершена з помилками (оновлено ${successCount} замовлень, ${errorCount} з помилками)`;
    } else if (updatedCount === 0) {
      message = 'Перевірка завершена: жодних нових даних не було оновлено.';
    } else {
      message = `Перевірка завершена (оновлено ${updatedCount} ${updatedCount < 5 ? 'замовлення' : 'замовлень'}`;
    }

    res.json({
      success: !hasError,
      message,
      updatedCount: updatedCount,
      errors: errorDetails,
      data: results,
    });

  } catch (error) {
    const errorMessage = handleDilovodApiError(error, 'Order check');
    logWithTimestamp('API: Помилка перевірки замовлення в Dilovod:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Dilovod API error',
      message: errorMessage
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/:orderId/export
 * Експортувати замовлення в Dilovod
 */
router.post('/salesdrive/orders/:orderId/export', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { orderId } = req.params;
    const orderNum = await orderDatabaseService.getDisplayOrderNumber(Number(orderId));

    // Перевірка наявності локального запису (dilovodDocId)
    const existingOrder = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: {
        dilovodDocId: true,
        dilovodExportDate: true
      }
    });

    if (existingOrder?.dilovodDocId) {
      // Якщо вже є dilovodDocId — не робимо запит до Dilovod API
      logWithTimestamp(`ℹ️ Замовлення #${orderNum} (id: ${orderId}) вже експортовано в Dilovod (baseDocId: ${existingOrder.dilovodDocId})`);
      return res.json({
        success: true,
        message: `Замовлення ${orderNum} вже експортовано в Dilovod. Нових даних не було оновлено.`,
        exported: false,
        dilovodId: existingOrder.dilovodDocId,
        dilovodExportDate: existingOrder.dilovodExportDate,
        data: {
          orderId,
          exportResult: null,
          warnings: []
        },
        metadata: {
          exportedAt: existingOrder.dilovodExportDate,
          documentType: null,
          orderNumber: orderNum,
          totalItems: null,
          warningsCount: 0,
          saleToken: null
        }
      });
    }

    logWithTimestamp(`=== API: Експорт замовлення #${orderNum} (id: ${orderId}) в Dilovod ===`);

    // ...existing code for payload, export, and response...
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
        logWithTimestamp(`🧩 Використовуємо cached payload для токена ${token}`);
        // Для кешованого payload ми більше не створюємо контрагентів у коді експортного маршруту.
        // Тепер person буде створений під час валідації (validate) і записаний у кеш.
        if (!payload?.header?.person?.id) {
          logWithTimestamp(`⚠️ Cached payload для токена ${token} не містить person.id — перевірте, що запускалася validate з allowCreatePerson`);
        }
      } else {
        logWithTimestamp(`⚠️ Token ${token} не знайдено або вже використаний — будуємо payload заново`);
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

    logWithTimestamp(`✅ Payload для замовлення #${orderNum} (id: ${orderId}) успішно сформовано`);

    // Відправляємо payload в Dilovod через DilovodService
    try {
      // Використовуємо коректний singleton import
      const { dilovodService } = await import('../services/dilovod/DilovodService.js');
      const exportResult = await dilovodService.exportOrderToDilovod(payload);

      // Визначаємо статус відповіді
      const isExportError = !!(exportResult && (exportResult.error || exportResult.status === 'error'));
      const orderNumber = orderNum || orderId;

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
          logWithTimestamp(`✅ baseDoc ID (${exportResult.id}) збережено для замовлення #${orderNum} (id: ${orderId})`);
        } catch (dbError) {
          logWithTimestamp(`❌ Помилка збереження baseDoc ID в БД:`, dbError);
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
          logWithTimestamp(`🔐 Згенеровано sale token ${saleToken} для замовлення #${orderNum} (orderId: ${orderId}, baseDoc: ${exportResult.id})`);
          logWithTimestamp('🔒 sale token data:', saleData);
        } catch (err) {
          logWithTimestamp('❌ Помилка при створенні sale token:', err);
        }
      }

      // Логування в MetaLog
      await dilovodService.logMetaDilovodExport({
        title: 'Dilovod export result',
        status: isExportError ? 'error' : 'success',
        message: exportResult?.message || (isExportError ? 'Export failed' : 'Export successful'),
        data: {
          orderId,
          orderNumber,
          payload,
          exportResult,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      });

      const mainMessage = isExportError
        ? `Помилка експорту замовлення ${orderNumber} в Dilovod: ${exportResult?.error || exportResult?.message || 'невідома помилка'}`
        : `Замовлення ${orderNumber} експортовано в Dilovod успішно`;

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
          orderNumber,
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

    // Перевіряємо, чи це критична помилка валідації
    if (errorMessage.includes('Експорт заблоковано через критичні помилки:')) {
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
 * POST /api/dilovod/salesdrive/orders/:orderId/validate
 * Валідувати готовність замовлення до експорту в Dilovod
 */
router.post('/salesdrive/orders/:orderId/validate', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { orderId } = req.params;
    const orderNum = await orderDatabaseService.getDisplayOrderNumber(Number(orderId));

    logWithTimestamp(`=== API: Валідація замовлення #${orderNum} (id: ${orderId}) для експорту в Dilovod ===`, undefined, true);

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

      logWithTimestamp(`✅ Валідація замовлення #${orderNum} (id: ${orderId}) пройдена успішно`);

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

      // Якщо це критична помилка валідації
      if (errorMessage.includes('Експорт заблоковано через критичні помилки:')) {
        logWithTimestamp(`❌ Валідація замовлення #${orderNum} (id: ${orderId}) не пройдена`);

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
 * POST /api/dilovod/salesdrive/orders/:orderId/shipment
 * Створити документ відвантаження в Dilovod на основі baseDoc
 */
router.post('/salesdrive/orders/:orderId/shipment', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { orderId } = req.params;
    const orderNum = await orderDatabaseService.getDisplayOrderNumber(Number(orderId));

    logWithTimestamp(`=== API: Створення документа відвантаження для замовлення #${orderNum} (id: ${orderId}) в Dilovod ===`, undefined, true);

    // Отримуємо замовлення з БД
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Замовлення #${orderNum} (id: ${orderId}) не знайдено в базі даних`
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
        logWithTimestamp(`🔁 Використовуємо sale token ${token} -> baseDoc ${cached.baseDocId}`);
        if (cached.personId) {
          logWithTimestamp(`🔁 sale token містить personId: ${cached.personId} — буде передано у buildSalePayload`);
        } else {
          logWithTimestamp(`🔁 sale token ${token} не містить personId (буде побудовано на основі бази)`);
        }
      }
      // Якщо в кеші є personId — можна його додатково зберегти/використати в buildSalePayload, але наразі переходимо далі
    }

    // Перевіряємо наявність baseDoc ID
    if (!order.dilovodDocId) {
      return res.status(400).json({
        success: false,
        error: 'No baseDoc ID',
        message: `Замовлення #${orderNum} (id: ${orderId}) ще не експортоване в Діловод (відсутній baseDoc ID)`,
        action_required: 'Спочатку експортуйте замовлення в Діловод'
      });
    }

    // Перевіряємо, чи вже створений документ відвантаження
    if (order.dilovodSaleExportDate) {
      return res.status(400).json({
        success: false,
        error: 'Already shipped',
        message: `Документ відвантаження для замовлення #${orderNum} (id: ${orderId}) вже створений (${new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA')})`,
        data: {
          dilovodSaleExportDate: order.dilovodSaleExportDate
        }
      });
    }

    // Імпортуємо DilovodExportBuilder для створення payload відвантаження
    const { dilovodExportBuilder } = await import('../services/dilovod/DilovodExportBuilder.js');

    // Формуємо payload для документа відвантаження (documents.sale)
    const { payload: salePayload, warnings } = await dilovodExportBuilder.buildSalePayload(orderId, order.dilovodDocId, { personId: cached?.personId });

    logWithTimestamp(`✅ Payload для документа відвантаження #${orderNum} (id: ${orderId}) успішно сформовано`);

    // Відправляємо payload в Dilovod через DilovodService
    try {
      const { dilovodService } = await import('../services/dilovod/DilovodService.js');
      const exportResult = await dilovodService.exportOrderToDilovod(salePayload);

      const isExportError = !!(exportResult && (exportResult.error || exportResult.status === 'error'));
      const orderNumber = orderNum || orderId;

      // Якщо експорт успішний - оновлюємо дату відвантаження
      if (!isExportError && exportResult?.id) {
        try {
          await prisma.order.updateMany({
            where: { id: parseInt(orderId) },
            data: {
              dilovodSaleExportDate: new Date().toISOString()
            }
          });
          logWithTimestamp(`✅ Дату відвантаження збережено для замовлення #${orderNumber} (id: ${orderId})`);
        } catch (dbError) {
          logWithTimestamp(`❌ Помилка збереження дати відвантаження в БД:`, dbError);
        }
      }

      // Логування в MetaLog
      await dilovodService.logMetaDilovodExport({
        title: 'Dilovod shipment export result',
        status: isExportError ? 'error' : 'success',
        message: exportResult?.message || (isExportError ? 'Shipment creation failed' : 'Shipment created successfully'),
        data: {
          orderId,
          orderNumber,
          baseDoc: order.dilovodDocId,
          payload: salePayload,
          exportResult,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      });

      const mainMessage = isExportError
        ? `Помилка створення відвантаження для замовлення ${orderNumber}: ${exportResult?.error || exportResult?.message || 'невідома помилка'}`
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
router.get('/salesdrive/payment-methods', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

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
router.get('/cache/status', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

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
router.post('/cache/refresh', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    logWithTimestamp('=== API: Примусове оновлення кешу довідників Dilovod ===');

    const dilovodService = new DilovodService();

    // Оновлюємо весь кеш (НЕ паралельно, щоб уникнути multithreadApiSession blocked)
    const result = await dilovodService.refreshAllDirectoriesCache();

    logWithTimestamp('API: Кеш оновлено успішно');
    res.json({
      success: true,
      data: result,
      message: 'Кеш довідників успішно оновлено'
    });
  } catch (error) {
    logWithTimestamp('API: Помилка оновлення кешу довідників Dilovod:', error);
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