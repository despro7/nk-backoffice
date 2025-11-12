import { Router } from 'express';
import { buildDilovodPayload } from '../../shared/utils/dilovodPayloadBuilder';
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
    
    // Перевіряємо права доступу (тільки ADMIN і BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
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
    
    // Перевіряємо права доступу (тільки ADMIN і BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
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
    
    // Перевіряємо права доступу (тільки ADMIN і BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
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
    
    // Перевіряємо права доступу (тільки ADMIN і BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    logWithTimestamp('=== API: Отримання налаштувань Dilovod ===');
    
    // Отримуємо налаштування з settings_base
    const settings = await getDilovodSettings();
    
    logWithTimestamp('API: Налаштування Dilovod отримано');
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
    
    // Перевіряємо права доступу (тільки ADMIN і BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
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
    
    // Перевіряємо права доступу (тільки ADMIN і BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    logWithTimestamp('=== API: Отримання довідників Dilovod ===');
    
    const dilovodService = new DilovodService();
    
    logWithTimestamp('API: Початок послідовного завантаження довідників (через обмеження Dilovod API)...');
    
    // Dilovod API блокує паралельні запити ('multithreadApiSession multithread api request blocked')
    // Тому робимо запити послідовно з обробкою помилок
    let storagesResult: any[] = [];
    let accountsResult: any[] = [];
    let paymentFormsResult: any[] = [];
    let firmsResult: any[] = [];
    
    try {
      logWithTimestamp('Отримання списку складів з Dilovod');
      storagesResult = await dilovodService.getStorages();
      logWithTimestamp(`API: ✅ Склади завантажено: ${storagesResult.length} записів`);
      if (storagesResult.length > 0) {
        logWithTimestamp(`API: Перший склад: ${JSON.stringify(storagesResult[0])}`);
      }
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання складів:', error);
    }
    
    try {
      logWithTimestamp('Отримання списку рахунків з Dilovod');
      accountsResult = await dilovodService.getCashAccounts();
      logWithTimestamp(`API: ✅ Рахунки завантажено: ${accountsResult.length} записів`);
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання рахунків:', error);
    }
    
    try {
      logWithTimestamp('Отримання списку форм оплати з Dilovod');  
      paymentFormsResult = await dilovodService.getPaymentForms();
      logWithTimestamp(`API: ✅ Форми оплати завантажено: ${paymentFormsResult.length} записів`);
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання форм оплати:', error);
    }
    
    try {
      logWithTimestamp('Отримання списку фірм з Dilovod');
      firmsResult = await dilovodService.getFirms();
      logWithTimestamp(`API: ✅ Фірми завантажено: ${firmsResult.length} записів`);
    } catch (error) {
      logWithTimestamp('API: ❌ Помилка отримання фірм:', error);
    }
    
    logWithTimestamp('API: Завантаження довідників завершено.');
    
    const directories: DilovodDirectories = {
      storages: storagesResult,
      cashAccounts: accountsResult,
      paymentForms: paymentFormsResult,
      firms: firmsResult
    };
    
    logWithTimestamp('API: Довідники Dilovod отримано');
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
    if (!req.user || !['admin', 'boss', 'ads-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, ads-manager'
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
    if (!req.user || !['admin', 'boss', 'ads-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, ads-manager'
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

    logWithTimestamp(`=== API: Перевірка замовлень ${orderNumbers} в Dilovod ===`);

    // Використовуємо DilovodService для пошуку замовлень
    const dilovodService = new DilovodService();
    const dilovodOrders = (await dilovodService.getOrderByNumber(orderNumbers)).flat(); // Повертає массив об’єктів замовлень (з flatt'ингом для обробки вкладених масивів)

    const results = [];

    // Цикл 1: Оновлюємо базову інформацію та збираємо baseDoc для батч-запиту
    const baseDocIds: string[] = [];
    const orderMap = new Map<string, { normalizedNumber: string; dilovodId: string; dilovodExportDate: string }>();

    for (const dilovodOrder of dilovodOrders) {
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

    // Цикл 2: Єдиний батч-запит для documents.sale і documents.cashIn (передаємо масив baseDocIds напряму)
    if (baseDocIds.length > 0) {
      try {
        logWithTimestamp(`Виконуємо один запит getDocuments() для ${baseDocIds.length} baseDoc (sale)...`);
        const saleDocuments = await dilovodService.getDocuments(baseDocIds, 'sale');

        logWithTimestamp(`Виконуємо один запит getDocuments() для ${baseDocIds.length} baseDoc (cashIn)...`);
        const cashInDocuments = await dilovodService.getDocuments(baseDocIds, 'cashIn');

        // Групуємо за baseDoc (беремо перший документ якщо їх кілька)
        const groupByBaseDoc = (docs: any[]) => {
          const map = new Map<string, any>();
            for (const d of docs) {
              if (!d?.baseDoc) continue;
              if (!map.has(d.baseDoc)) {
                map.set(d.baseDoc, d);
              } else {
                // Якщо вже є — можна замінити якщо дата новіша (опціонально). Зараз залишаємо перший.
              }
            }
          return map;
        };

        const saleByBaseDoc = groupByBaseDoc(saleDocuments);
        const cashInByBaseDoc = groupByBaseDoc(cashInDocuments);

        for (const baseDoc of baseDocIds) {
          const orderInfo = orderMap.get(baseDoc);
          if (!orderInfo) continue;

          const saleDoc = saleByBaseDoc.get(baseDoc);
          const cashInDoc = cashInByBaseDoc.get(baseDoc);

          const updateData: any = {};
          if (saleDoc?.date) {
            updateData.dilovodSaleExportDate = new Date(saleDoc.date).toISOString();
          }
          if (cashInDoc?.date) {
            updateData.dilovodCashInDate = new Date(cashInDoc.date).toISOString();
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
                dilovodSaleExportDate: saleDoc?.date,
                dilovodCashInDate: cashInDoc?.date
              };
            }
          }
        }
        logWithTimestamp('Єдиний батч-оновлення документів Sale/CashIn завершено');
      } catch (err) {
        logWithTimestamp('Помилка під час єдиного батч-запиту Sale/CashIn:', err);
      }
    }



    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    const hasError = errorCount > 0;

    const errorDetails = hasError
      ? results.filter(r => !r.success).map(r => ({
          orderNumber: r.orderNumber,
          dilovodId: r.dilovodId,
          error: r.error
        }))
      : undefined;

    const message = hasError
      ? `Перевірка завершена з помилками (оновлено ${successCount} замовлень, ${errorCount} з помилками)`
      : `Перевірка завершена (оновлено ${results.length} замовлень)`;

    res.json({
      success: !hasError,
      data: results,
      message,
      errors: errorDetails
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
 * Експортувати замовлення в Dilovod (поки заглушка)
 */
router.post('/salesdrive/orders/:orderId/export', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'ads-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, ads-manager'
      });
    }

    const { orderId } = req.params;

    logWithTimestamp(`=== API: Експорт замовлення ${orderId} в Dilovod (заглушка) ===`);

    // Заглушка - імітуємо експорт в Dilovod
    setTimeout(() => {
      // Випадковий результат для демонстрації
      const exported = Math.random() > 0.3; // 70% успіху
      
      if (exported) {
        // Оновлюємо статус в базі даних (заглушка)
        res.json({
          success: true,
          exported: true,
          orderId,
          message: `Замовлення ${orderId} успішно вивантажено в Діловод`,
          mockData: {
            dilovodId: `DLV-${Math.floor(Math.random() * 10000)}`,
            exportedAt: new Date().toISOString()
          }
        });
      } else {
        res.json({
          success: false,
          exported: false,
          orderId,
          error: 'Помилка вивантаження в Діловод',
          message: `Не вдалося вивантажити замовлення ${orderId}`,
          mockData: {
            errorCode: 'DILOVOD_API_ERROR',
            errorDetails: 'Temporary API unavailable'
          }
        });
      }
    }, 2000); // Імітація затримки API

  } catch (error) {
    console.error('Error exporting order to Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/dilovod/salesdrive/orders/:orderId/shipment
 * Створити документ відвантаження в Dilovod (поки заглушка)
 */
router.post('/salesdrive/orders/:orderId/shipment', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'ads-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, ads-manager'
      });
    }

    const { orderId } = req.params;

    logWithTimestamp(`=== API: Створення документа відвантаження для замовлення ${orderId} в Dilovod (заглушка) ===`);

    // Заглушка - імітуємо створення документа відвантаження в Dilovod
    setTimeout(() => {
      // Випадковий результат для демонстрації
      const created = Math.random() > 0.2; // 80% успіху
      
      if (created) {
        res.json({
          success: true,
          created: true,
          orderId,
          message: `Документ відвантаження для замовлення ${orderId} створено в Діловоді`,
          mockData: {
            shipmentId: `SHP-${Math.floor(Math.random() * 10000)}`,
            documentNumber: `DOC-${Math.floor(Math.random() * 10000)}`,
            createdAt: new Date().toISOString()
          }
        });
      } else {
        res.json({
          success: false,
          created: false,
          orderId,
          error: 'Помилка створення документу відвантаження',
          message: `Не вдалося створити документ відвантаження для замовлення ${orderId}`,
          mockData: {
            errorCode: 'SHIPMENT_CREATE_ERROR',
            errorDetails: 'Order not found or already shipped'
          }
        });
      }
    }, 1500); // Імітація затримки API

  } catch (error) {
    console.error('Error creating shipment in Dilovod:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as dilovodRouter };