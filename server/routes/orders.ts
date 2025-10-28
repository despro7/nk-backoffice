import { Router } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { syncHistoryService } from '../services/syncHistoryService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';
import { authenticateToken } from '../middleware/auth.js';
import { prisma, getOrderSourceDetailed, getOrderSourceCategory, getOrderSourceByLevel, getReportingDayStartHour, getReportingDate, getReportingDateRange } from '../lib/utils.js';

const router = Router();

// Cache for aggregated statistics to improve performance on repeated requests
const statsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/orders/test
 * Simple test to check SalesDrive API configuration
 */
router.get('/test', authenticateToken, async (req, res) => {
  try {
    
    // Check if environment variables are set
    const hasUrl = !!process.env.SALESDRIVE_API_URL;
    const hasKey = !!process.env.SALESDRIVE_API_KEY;
    
    const config = {
      hasUrl,
      hasKey,
      url: process.env.SALESDRIVE_API_URL || 'NOT_SET',
      keyPreview: hasKey ? 'SET (hidden)' : 'NOT_SET'
    };
    
    if (!hasUrl || !hasKey) {
      return res.json({
        success: false,
        message: '❌ SalesDrive API not configured',
        config,
        nextSteps: [
          'Create .env file in project root',
          'Add SALESDRIVE_API_URL=your_api_url',
          'Add SALESDRIVE_API_KEY=your_api_key'
        ]
      });
    }
    
    res.json({
      success: true,
      message: '✅ SalesDrive API configuration found!',
      config,
      nextSteps: [
        'Test API connection',
        'Fetch sample orders'
      ]
    });
    
  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders
 * Получить заказы из локальной БД с возможностью синхронизации и сортировки
 */
router.get('/', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const { status, sync, sortBy, sortOrder, limit, search } = req.query;
  const include = (req.query.include as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const fields = (req.query.fields as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];

  // Парсим статусы: если строка содержит запятую, разбиваем на массив
  let parsedStatus: string | string[] | undefined = status as string;
  if (typeof status === 'string' && status.includes(',')) {
    parsedStatus = status.split(',').map(s => s.trim());
  }


  try {
    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      const syncStartTime = Date.now();
      const syncResult = await salesDriveService.syncOrdersWithDatabase();
      const syncDuration = Date.now() - syncStartTime;
      if (!syncResult.success) {
        console.warn('⚠️ [SERVER] GET /api/orders: Sync completed with errors:', syncResult.errors);
      }
    }

    // Получаем заказы из локальной БД с сортировкой
    const dbStartTime = Date.now();

    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: parseInt(limit as string) || 100,
      offset: parseInt(req.query.offset as string) || 0,
      sortBy: (sortBy as 'orderDate' | 'createdAt' | 'lastSynced' | 'orderNumber') || 'orderDate',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      search: search as string,
      // @ts-ignore: extended filters with include flags supported by service
      includeItems: include.includes('items'),
      // @ts-ignore
      includeRaw: include.includes('rawData'),
      // @ts-ignore: dynamic fields whitelist supported by service
      fields
    });

    // Получаем общее количество заказов для пагинации
    const totalCount = await orderDatabaseService.getOrdersCount({
      status: parsedStatus,
      search: search as string
    });

    // Получаем счетчики по статусам для табов
    const statusCounts = await orderDatabaseService.getStatusCounts();

    const dbDuration = Date.now() - dbStartTime;

    const totalDuration = Date.now() - startTime;

    const response = {
      success: true,
      data: orders,
      metadata: {
        source: 'local_database',
        totalOrders: totalCount,
        ordersOnPage: orders.length,
        fetchedAt: new Date().toISOString(),
        lastSynced: orders.length > 0 ? orders[0].lastSynced : null,
        sortBy: sortBy || 'orderDate',
        sortOrder: sortOrder || 'desc',
        limit: parseInt(limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0,
        processingTimeMs: totalDuration,
        dbFetchTimeMs: dbDuration,
        statusCounts: statusCounts
      }
    };

    res.json(response);

  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`❌ [SERVER] GET /api/orders: Error after ${errorTime}ms:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      processingTimeMs: errorTime
    });
  }
});


// Кеш для статистики веса (5 минут)
const weightStatsCache = new Map();
const WEIGHT_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 минут

/**
 * GET /api/orders/weight-stats
 * Получить статистику веса заказов по статусам для комірника
 */
router.get('/weight-stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 [WEIGHT STATS] Запрос статистики веса заказов (через CACHE)');
    const cacheKey = 'weight-stats';
    const cached = weightStatsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < WEIGHT_STATS_CACHE_TTL) {
      console.log('📊 [WEIGHT STATS] Возвращаем данные из кеша');
      return res.json(cached.data);
    }

    const aWeekAgo = new Date();
    aWeekAgo.setDate(aWeekAgo.getDate() - 7);
    aWeekAgo.setHours(0, 0, 0, 0);

    // 1. Витягуємо тільки externalId + status за останній тиждень
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['2', '3', '4'] },
        orderDate: { gte: aWeekAgo },
      },
      select: { externalId: true, status: true }
    });

    const orderIdsByStatus: { [status: string]: string[] } = { '2': [], '3': [], '4': [] };
    for (const order of orders) {
      if (order.status && order.externalId) {
        if (!orderIdsByStatus[order.status]) orderIdsByStatus[order.status] = [];
        orderIdsByStatus[order.status].push(order.externalId);
      }
    }
    // Об'єднання всіх externalId для bulk кеш-запиту
    const allExternalIds = orders.map(o => o.externalId);

    // 2. Bulk отримаємо кеші
    const ordersCacheMap = await ordersCacheService.getMultipleOrderCaches(allExternalIds);

    // 3. Агрегація по статусу
    let confirmedWeightKg = 0;
    let readyToShipWeightKg = 0;
    let shippedWeightKg = 0;
    let confirmedCount = 0;
    let readyToShipCount = 0;
    let shippedCount = 0;

    for (const status of ['2', '3', '4']) {
      for (const externalId of orderIdsByStatus[status] || []) {
        const cache = ordersCacheMap.get(externalId);
        if (cache && cache.totalWeight != null && !isNaN(Number(cache.totalWeight))) {
          const w = Number(cache.totalWeight);
          if (status === '2') { confirmedWeightKg += w; confirmedCount++; }
          else if (status === '3') { readyToShipWeightKg += w; readyToShipCount++; }
          else if (status === '4') { shippedWeightKg += w; shippedCount++; }
        }
      }
    }
    // Новий total: тільки підтверджені + готові до відправки (без shipped)
    const activeTotalWeightKg = confirmedWeightKg + readyToShipWeightKg;
    const activeTotalCount = confirmedCount + readyToShipCount;
    const response = {
      success: true,
      data: {
        confirmed: {
          count: confirmedCount,
          weight: confirmedWeightKg,
          weightText: `${confirmedWeightKg.toFixed(2)} кг`
        },
        readyToShip: {
          count: readyToShipCount,
          weight: readyToShipWeightKg,
          weightText: `${readyToShipWeightKg.toFixed(2)} кг`
        },
        // shipped: {
        //   count: shippedCount,
        //   weight: shippedWeightKg,
        //   weightText: `${shippedWeightKg.toFixed(2)} кг`
        // },
        total: {
          count: activeTotalCount,
          weight: activeTotalWeightKg,
          weightText: `${activeTotalWeightKg.toFixed(2)} кг`
        }
      },
      metadata: {
        calculatedAt: new Date().toISOString(),
        totalOrdersProcessed: orders.length
      }
    };
    weightStatsCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
    res.json(response);
  } catch (error) {
    console.error('❌ [WEIGHT STATS] Ошибка получения статистики веса (через кеш):', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/stats/summary
 * Получить статистику по заказам из локальной БД
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    // Получаем статистику из локальной БД
    const stats = await orderDatabaseService.getOrdersStats();
    const lastSyncInfo = await orderDatabaseService.getLastSyncInfo();
    
    res.json({
      success: true,
      data: stats,
      metadata: {
        source: 'Local Database',
        lastSynced: lastSyncInfo,
        fetchedAt: new Date().toISOString(),
        note: 'Data from local database, updated via background sync'
      }
    });
  } catch (error) {
    console.error('Error getting order stats from database:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/raw/all
 * Получить все заказы в сыром виде для отладки
 */
router.get('/raw/all', authenticateToken, async (req, res) => {
  try {
    // Используем параллельную загрузку за последний месяц
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const allOrders = await salesDriveService.fetchOrdersFromDateRangeParallel(startDateStr, endDate);
    
    if (!allOrders.success) {
      return res.status(500).json({
        success: false,
        error: allOrders.error || 'Failed to fetch orders',
      });
    }

    res.json({
      success: true,
      data: allOrders.data,
      metadata: {
        fetchedAt: new Date().toISOString(),
        totalOrders: allOrders.data?.length || 0,
        note: 'Raw data from SalesDrive API for debugging purposes'
      }
    });
  } catch (error) {
    console.error('Error getting raw orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/debug/raw
 * Получить сырые данные от SalesDrive API без обработки
 */
router.get('/debug/raw', authenticateToken, async (req, res) => {
  try {
    // Получаем сырые данные напрямую от SalesDrive API
    const response = await fetch(`${process.env.SALESDRIVE_API_URL}?page=1&limit=5`, {
      method: 'GET',
      headers: {
        'Form-Api-Key': process.env.SALESDRIVE_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SalesDrive API error: ${response.status} - ${response.statusText}`);
    }

    const rawData = await response.json();
    
    res.json({
      success: true,
      rawData: rawData,
      metadata: {
        fetchedAt: new Date().toISOString(),
        apiUrl: process.env.SALESDRIVE_API_URL,
        note: 'Direct raw response from SalesDrive API without processing'
      }
    });
  } catch (error) {
    console.error('Error getting debug raw data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/period
 * Получить заказы за определенный период с синхронизацией
 */
router.get('/period', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, sync } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Получаем заказы за период
    const orders = await orderDatabaseService.getOrders({
      limit: 10000, // Большой лимит для периода
      sortBy: 'orderDate',
      sortOrder: 'desc'
    });

    // Фильтруем по дате
    const filteredOrders = orders.filter(order => {
      if (!order.orderDate) return false;
      const orderDate = new Date(order.orderDate);
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      return orderDate >= start && orderDate <= end;
    });

    res.json({
      success: true,
      data: filteredOrders,
      metadata: {
        source: 'local_database',
        period: { startDate, endDate },
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting orders for period:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/stats/test
 * Тестовый endpoint для проверки статистики с тестовыми данными
 */
router.get('/products/stats/test', authenticateToken, async (req, res) => {
  try {
    // Создаем тестовые данные для проверки
    const testData = [
      {
        name: "Борщ український",
        sku: "BORSCH-001",
        orderedQuantity: 25,
        stockBalances: { "1": 50, "3": 30, "4": 20 }
      },
      {
        name: "Вареники з картоплею",
        sku: "VARENYKY-001",
        orderedQuantity: 15,
        stockBalances: { "1": 40, "3": 25 }
      },
      {
        name: "Курча по-київськи",
        sku: "KYIV-CHICKEN-001",
        orderedQuantity: 8,
        stockBalances: { "1": 15, "3": 12, "4": 10 }
      }
    ];

    res.json({
      success: true,
      data: testData,
      metadata: {
        source: 'test_data',
        filters: {
          status: 'all',
          dateRange: null
        },
        totalProducts: testData.length,
        totalOrders: 1,
        fetchedAt: new Date().toISOString(),
        note: 'Test data for debugging purposes'
      }
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/fix-items-data
 * Исправить поврежденные данные items в заказах
 */
router.post('/fix-items-data', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Проверяем права доступа (только ADMIN)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const orders = await orderDatabaseService.getOrders({ limit: 10000 });
    let fixedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      if (order.items === '[object Object]') {
        // Пытаемся восстановить данные из rawData
        try {
          if (order.rawData && typeof order.rawData === 'string') {
            const rawData = JSON.parse(order.rawData);

            // Ищем items в rawData (структура может быть разной)
            let items = null;
            if (rawData.items) {
              items = rawData.items;
            } else if (rawData.data && rawData.data.items) {
              items = rawData.data.items;
            }

            if (items && Array.isArray(items)) {
              // Обновляем items в базе данных
              await orderDatabaseService.updateOrder(order.externalId, {
                items: items
              });
              fixedCount++;
            } else {
              console.warn(`Could not extract items from rawData for order ${order.externalId}`);
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        } catch (parseError) {
          console.warn(`Failed to parse rawData for order ${order.externalId}:`, parseError);
          skippedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Fixed ${fixedCount} orders, skipped ${skippedCount} orders`,
      stats: {
        totalOrders: orders.length,
        fixedCount,
        skippedCount
      }
    });
  } catch (error) {
    console.error('Error fixing items data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/calculate-actual-quantity
 * Тестовий ендпоінт для перевірки логіки calculateActualQuantity
 */
router.post('/calculate-actual-quantity', authenticateToken, async (req, res) => {
  try {
    const { items, initialQuantity } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'items must be an array' });
    }
    const result = await orderDatabaseService.calculateActualQuantityPublic(items, initialQuantity);
    res.json({ success: true, actualQuantity: result });
  } catch (error) {
    console.error('❌ Error in /api/orders/calculate-actual-quantity:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /api/orders/:externalId
 * Получить детали конкретного заказа по externalId (номеру заказа из SalesDrive)
 */
router.get('/:externalId', authenticateToken, async (req, res) => {
  try {
    const { externalId } = req.params; // Изменили с id на externalId
    
    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: 'Order external ID is required'
      });
    }

    
    // Получаем детали заказа по externalId
    const orderDetails = await orderDatabaseService.getOrderByExternalId(externalId);
    
    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Возвращаем полные данные заказа
    res.json({
      success: true,
      data: {
        id: orderDetails.id,
        externalId: orderDetails.externalId, // Добавили externalId в ответ
        orderNumber: orderDetails.orderNumber,
        ttn: orderDetails.ttn,
        quantity: orderDetails.quantity,
        status: orderDetails.status,
        statusText: orderDetails.statusText,
        items: orderDetails.items,
        customerName: orderDetails.customerName,
        customerPhone: orderDetails.customerPhone,
        deliveryAddress: orderDetails.deliveryAddress,
        totalPrice: orderDetails.totalPrice,
        createdAt: orderDetails.createdAt,
        orderDate: orderDetails.orderDate,
        shippingMethod: orderDetails.shippingMethod,
        paymentMethod: orderDetails.paymentMethod,
        cityName: orderDetails.cityName,
        provider: orderDetails.provider,
        rawData: orderDetails.rawData
      }
    });

  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/orders/:id/status
 * Обновить статус заказа в SalesDrive
 */
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    // Обновляем статус в SalesDrive
    const result = await salesDriveService.updateSalesDriveOrderStatus(id, status);

    if (result) {
      res.json({
        success: true,
        message: 'Order status updated successfully in SalesDrive',
        id: id,
        newStatus: status,
        salesDriveUpdated: true,
        updatedAt: new Date().toISOString()
      });
    } else {
      console.warn(`⚠️ Failed to update order ${id} status in SalesDrive`);
      res.status(500).json({
        success: false,
        error: 'Failed to update order status in SalesDrive',
        id: id,
        newStatus: status
      });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/:externalId/cache
 * Заполнить кеш для конкретного заказа
 */
router.post('/:externalId/cache', authenticateToken, async (req, res) => {
  try {
    const { externalId } = req.params;
    const success = await orderDatabaseService.updateOrderCache(externalId);

    if (success) {
      res.json({
        success: true,
        message: `Cache updated for order ${externalId}`
      });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to update cache for order ${externalId}`
      });
    }
  } catch (error) {
    console.error('Error updating cache:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/cache/stats
 * Получить статистику кеша
 */
router.get('/cache/stats', authenticateToken, async (req, res) => {
  try {
    const totalOrders = await prisma.order.count();

    // Получаем статистику кеша из orders_cache
    const cacheStats = await ordersCacheService.getCacheStatistics();
    const cachedOrders = cacheStats.totalEntries;
    const averageCacheTime = cacheStats.averageAge * 60 * 60 * 1000; // в миллисекунды

    // Получить hit rate (процент заказов с кешем)
    const cacheHitRate = totalOrders > 0 ? (cachedOrders / totalOrders) * 100 : 0;

    // Общий размер кеша - количество заказов с кешем
    const totalCacheSize = cachedOrders;

    // Получить время последнего обновления кеша
    const lastCacheUpdate = await prisma.ordersCache.findFirst({
      orderBy: { cacheUpdatedAt: 'desc' },
      select: { cacheUpdatedAt: true }
    });

    res.json({
      success: true,
      stats: {
        totalOrders,
        cachedOrders,
        cacheHitRate,
        lastCacheUpdate: lastCacheUpdate ? lastCacheUpdate.cacheUpdatedAt.toISOString() : new Date().toISOString(),
        averageCacheTime: cacheStats.averageAge, // в годинах
        totalCacheSize
      }
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cache stats'
    });
  }
});

/**
 * GET /api/orders/cache/info
 * Получить информацию о состоянии кеша
 */
router.get('/cache/info', authenticateToken, async (req, res) => {
  try {
    // TODO: Implement cache info endpoint
    const cacheInfo = {
      enabled: false,
      size: 0,
      maxSize: 0,
      entries: []
    };

    res.json({
      success: true,
      data: cacheInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache info:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/cache/clear
 * Очистить весь кеш
 */
router.post('/cache/clear', authenticateToken, async (req, res) => {
  try {
    const result = salesDriveService.clearCache();

    res.json({
      success: true,
      message: `Cache cleared successfully`,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/orders/cache/:key
 * Очистить конкретную запись из кеша
 */
router.delete('/cache/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const deleted = salesDriveService.clearCacheEntry(decodeURIComponent(key));

    res.json({
      success: true,
      message: deleted ? `Cache entry cleared` : `Cache entry not found`,
      data: { deleted, key },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache entry:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Вспомогательные функции для сравнения товаров в заказах
async function getOrderItemsForComparison(orderId: number): Promise<any[] | null> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { items: true, externalId: true }
    });

    if (!order || !order.items) {
      return null;
    }

    let orderItems: any[] = [];

    // Парсим товары заказа
    if (typeof order.items === 'string') {
      if (order.items === '[object Object]') {
        console.warn(`Order has invalid items data`);
        return null;
      }

      try {
        orderItems = JSON.parse(order.items);
      } catch (parseError) {
        console.warn(`Failed to parse items for order:`, parseError);
        return null;
      }
    } else if (Array.isArray(order.items)) {
      orderItems = order.items;
    }

    return orderItems;
  } catch (error) {
    console.error('Error getting order items for comparison:', error);
    return null;
  }
}

function parseCachedOrderItems(processedItems: string | null): any[] | null {
  if (!processedItems) return null;

  try {
    const cachedData = JSON.parse(processedItems);
    if (Array.isArray(cachedData)) {
      return cachedData;
    }
    return null;
  } catch (error) {
    console.warn('Failed to parse cached items:', error);
    return null;
  }
}

function compareOrderItems(currentItems: any[], cachedItems: any[]): boolean {
  if (!currentItems || !cachedItems) return true; // Если не можем сравнить - считаем, что изменились

  // Создаем мапы по SKU для быстрого сравнения
  const currentMap = new Map();
  const cachedMap = new Map();

  // Нормализуем текущие товары
  currentItems.forEach(item => {
    if (item && item.sku) {
      currentMap.set(item.sku.toString().toLowerCase(), {
        sku: item.sku,
        quantity: item.orderedQuantity || item.quantity || 0,
        name: item.name || ''
      });
    }
  });

  // Нормализуем кешированные товары
  cachedItems.forEach(item => {
    if (item && item.sku) {
      cachedMap.set(item.sku.toString().toLowerCase(), {
        sku: item.sku,
        quantity: item.orderedQuantity || item.quantity || 0,
        name: item.name || ''
      });
    }
  });

  // Сравниваем размеры
  if (currentMap.size !== cachedMap.size) {
    console.log(`📊 Items count changed: current=${currentMap.size}, cached=${cachedMap.size}`);
    return true; // Количество товаров изменилось
  }

  // Сравниваем каждый товар
  for (const [sku, currentItem] of currentMap) {
    const cachedItem = cachedMap.get(sku);

    if (!cachedItem) {
      console.log(`➕ New item found: ${sku}`);
      return true; // Новый товар
    }

    if (currentItem.quantity !== cachedItem.quantity) {
      console.log(`📈 Quantity changed for ${sku}: current=${currentItem.quantity}, cached=${cachedItem.quantity}`);
      return true; // Количество изменилось
    }
  }

  // Проверяем обратное - нет ли удаленных товаров
  for (const [sku, cachedItem] of cachedMap) {
    if (!currentMap.has(sku)) {
      console.log(`➖ Item removed: ${sku}`);
      return true; // Товар удален
    }
  }

  return false; // Товары не изменились
}

/**
 * POST /api/orders/cache/validate
 * Валидировать и обновить кеш заказов
 */
router.post('/cache/validate', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, force, mode } = req.query;

    console.log('🔍 [CACHE VALIDATION] Starting cache validation...', {
      startDate,
      endDate,
      force: force,
      mode: mode || 'full',
      hasStartDate: !!startDate,
      hasEndDate: !!endDate
    });

    let actualOrders: any[];
    let validationMode: string;
    let dateRangeFilter: { startDate: Date; endDate: Date } | null = null;

    if (mode === 'full' || (!startDate && mode !== 'period')) {
      // Полная валидация - проверяем заказы за последний год
      validationMode = 'full';

      console.log('🌐 [CACHE VALIDATION] Full validation mode - getting all orders from database...');

      // Получаем все заказы за последний год из базы данных
      const fullStartDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const fullEndDate = new Date();

      const ordersFromDb = await prisma.order.findMany({
        where: {
          orderDate: {
            gte: fullStartDate,
            lte: fullEndDate
          }
        },
        select: {
          id: true,
          externalId: true,
          orderDate: true,
          updatedAt: true
        }
      });

      actualOrders = ordersFromDb;
      console.log(`📊 [CACHE VALIDATION] Found ${ordersFromDb.length} orders in database for full validation`);

    } else {
      // Валидация за период - проверяем только заказы в выбранном диапазоне
      validationMode = 'period';
      const startDateObj = new Date(startDate as string + ' 00:00:00');
      const endDateObj = endDate ? new Date(endDate as string + ' 23:59:59') : new Date();
      dateRangeFilter = { startDate: startDateObj, endDate: endDateObj };

      const now = new Date();
      const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

      console.log('🌐 [CACHE VALIDATION] Period validation mode - getting orders from database...');
      console.log(`📅 [CACHE VALIDATION] Date range: ${daysDiff} days (${startDateObj.toISOString()} to ${endDateObj.toISOString()})`);

      // Проверки на корректность дат
      if (startDateObj > now) {
        console.warn(`⚠️ [CACHE VALIDATION] Start date is in the future: ${startDateObj.toISOString()}`);
      }
      if (endDateObj > now) {
        console.warn(`⚠️ [CACHE VALIDATION] End date is in the future: ${endDateObj.toISOString()}`);
      }
      if (daysDiff > 30) {
        console.warn(`⚠️ [CACHE VALIDATION] Large date range selected: ${daysDiff} days. Consider using a smaller period.`);
      }
      if (daysDiff <= 0) {
        throw new Error('Invalid date range: start date must be before end date');
      }

      // Получаем заказы из базы данных за выбранный период
      console.log(`📅 [CACHE VALIDATION] Searching for orders updated between ${startDateObj.toISOString()} and ${endDateObj.toISOString()}`);

      const ordersFromDb = await prisma.order.findMany({
        where: {
          orderDate: {
            gte: startDateObj,
            lte: endDateObj
          }
        },
        select: {
          id: true,
          externalId: true,
          orderDate: true,
          updatedAt: true
        },
        orderBy: {
          orderDate: 'desc'
        }
      });

      actualOrders = ordersFromDb;
      console.log(`📊 [CACHE VALIDATION] Found ${ordersFromDb.length} orders in database for period validation`);

      // Предупреждение если найдено много заказов
      if (ordersFromDb.length >= 500) {
        console.warn(`⚠️ [CACHE VALIDATION] Знайдено 500+ замовлень за обраний період. Подумайте над тим, щоб звузити діапазон дат для кращої продуктивності.`);
      }
    }

    const actualOrderIds = new Set(actualOrders.map(order => order.externalId));
    console.log(`📊 [CACHE VALIDATION] Found ${actualOrders.length} orders in database`);

    // Статистика обработки
    const stats = {
      totalCached: 0, // Будет рассчитано позже
      totalActual: actualOrders.length,
      cacheHits: 0,
      cacheMisses: 0,
      cacheStale: 0,
      itemsUnchanged: 0, // Товары не изменились, хотя дата была новее
      updated: 0,
      processed: 0,
      errors: 0
    };

    // Получаем кеш для всех найденных заказов
    const cachedOrdersMap = await ordersCacheService.getMultipleOrderCaches(Array.from(actualOrderIds));
    stats.totalCached = cachedOrdersMap.size;

    // Создаем мапу заказов из базы данных по externalId
    const actualOrdersMap = new Map();
    actualOrders.forEach(order => {
      actualOrdersMap.set(order.externalId, order);
    });

    // Проходим по всем заказам из базы данных
    const toUpdate: string[] = [];

    for (const actualOrder of actualOrders) {
      stats.processed++;

      try {
        const externalId = actualOrder.externalId;
        const cachedOrder = cachedOrdersMap.get(externalId);

        let needsUpdate = force === 'true';

        if (!needsUpdate) {
          if (!cachedOrder) {
            // Кеш не существует - нужно создать
            needsUpdate = true;
            stats.cacheMisses++;
            console.log(`⚠️ [CACHE VALIDATION] Cache missing for order ${externalId}`);
          } else {
            // Сравниваем даты обновления
            const cachedDate = new Date(cachedOrder.cacheUpdatedAt);
            const actualDate = new Date(actualOrder.updatedAt);

            if (actualDate > cachedDate) {
              // Дата обновления заказа новее даты кеша - проверяем, изменились ли товары
              console.log(`📅 [CACHE VALIDATION] Order ${externalId} is stale by date (cached: ${cachedDate.toLocaleString( 'uk-UA' )}, actual: ${actualDate.toLocaleString( 'uk-UA' )})`);

              // Получаем актуальные товары заказа
              const currentOrderItems = await getOrderItemsForComparison(actualOrder.id);
              const cachedOrderItems = parseCachedOrderItems(cachedOrder.processedItems);

              if (currentOrderItems && cachedOrderItems) {
                // Сравниваем товары
                const itemsChanged = compareOrderItems(currentOrderItems, cachedOrderItems);

                if (itemsChanged) {
                  needsUpdate = true;
                  stats.cacheStale++;
                  console.log(`📦 [CACHE VALIDATION] Order ${externalId} items changed - cache needs update`);
                } else {
                  // Товары не изменились, кеш все еще актуален (несмотря на более новую дату)
                  stats.itemsUnchanged++;
                  console.log(`✅ [CACHE VALIDATION] Order ${externalId} items unchanged - cache is still valid despite newer date`);
                }
              } else {
                // Не удалось получить или распарсить товары - обновляем кеш для безопасности
                needsUpdate = true;
                stats.cacheStale++;
                console.log(`⚠️ [CACHE VALIDATION] Could not compare items for order ${externalId} - updating cache anyway`);
              }
            } else {
              stats.cacheHits++;
              console.log(`✅ [CACHE VALIDATION] Order ${externalId} cache is up to date`);
            }
          }
        } else {
          console.log(`🔄 [CACHE VALIDATION] Force update enabled for order ${externalId}`);
        }

        if (needsUpdate) {
          toUpdate.push(externalId);
        }

      } catch (error) {
        console.error(`❌ [CACHE VALIDATION] Error processing order ${actualOrder.externalId}:`, error);
        stats.errors++;
      }
    }

    const batchesCount = Math.ceil(toUpdate.length / 50);
    console.log(`📊 [CACHE VALIDATION] Validation summary:`, {
      mode: validationMode,
      period: dateRangeFilter ? `${dateRangeFilter.startDate.toLocaleString( 'uk-UA' )} - ${dateRangeFilter.endDate.toLocaleString( 'uk-UA' )}` : 'all time',
      processed: stats.processed,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      cacheStale: stats.cacheStale,
      itemsUnchanged: stats.itemsUnchanged,
      toUpdate: toUpdate.length,
      batches: batchesCount,
      estimatedTime: `${Math.ceil(batchesCount * 0.5)}s (with 500ms pauses)`,
      efficiency: `${Math.round((stats.itemsUnchanged / (stats.processed - stats.cacheMisses)) * 100) || 0}% items unchanged despite newer dates`
    });

    console.log(`📊 [CACHE VALIDATION] Processing ${toUpdate.length} orders to update`);

    // Разделяем на пакеты для эффективной обработки
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      batches.push(toUpdate.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 [CACHE VALIDATION] Split into ${batches.length} batches of up to ${BATCH_SIZE} orders each`);

    // Обрабатываем каждый пакет
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 [CACHE VALIDATION] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} orders)`);

      // Обрабатываем заказы в пакете параллельно
      const batchPromises = batch.map(async (orderId) => {
        try {
          const cacheUpdated = await orderDatabaseService.updateOrderCache(orderId);
          if (cacheUpdated) {
            return { orderId, success: true };
          } else {
            console.warn(`⚠️ [CACHE VALIDATION] Failed to update cache for orderId ${orderId}`);
            return { orderId, success: false, error: 'Update failed' };
          }
        } catch (error) {
          console.error(`❌ [CACHE VALIDATION] Error updating cache for orderId ${orderId}:`, error);
          return { orderId, success: false, error: error.message };
        }
      });

      // Ждем завершения всех обновлений в пакете
      const batchResults = await Promise.all(batchPromises);

      const successCount = batchResults.filter(r => r.success).length;
      stats.updated += successCount;
      stats.errors += batchResults.filter(r => !r.success).length;

      console.log(`✅ [CACHE VALIDATION] Batch ${batchIndex + 1} completed: ${successCount}/${batch.length} successful`);

      // Небольшая пауза между пакетами (кроме последнего)
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ [CACHE VALIDATION] Waiting 500ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`🎉 [CACHE VALIDATION] All batches processed successfully`);

    // Получаем финальную статистику кеша
    const finalCacheStats = await ordersCacheService.getCacheStatistics();

    const result = {
      success: true,
      message: `Cache validation completed successfully`,
      data: {
        stats,
        finalCacheStats,
        summary: {
          processed: stats.processed,
          updated: stats.updated,
          errors: stats.errors,
          cacheHitRate: stats.totalCached > 0 ? Math.round((stats.cacheHits / stats.totalCached) * 100) : 0,
          batchesProcessed: batchesCount,
          batchSize: 50,
          estimatedProcessingTime: Math.ceil(batchesCount * 0.5),
          validationDate: new Date().toLocaleString( 'uk-UA' )
        }
      },
      timestamp: new Date().toLocaleString( 'uk-UA' )
    };

    console.log('✅ [CACHE VALIDATION] Validation completed:', result.data.summary);

    res.json(result);

  } catch (error) {
    console.error('❌ [CACHE VALIDATION] Error during cache validation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during cache validation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


/**
 * GET /api/orders/products/stats
 * Получить статистику по товарам из заказов с фильтрами
 */
router.get('/products/stats', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync } = req.query;

    const cacheKey = `stats-products-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}`;
    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached product stats for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Получаем час начала звітного дня
    const dayStartHour = await getReportingDayStartHour();

    // Парсим статусы: если строка содержит запятую, разбиваем на массив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }
    // console.log('🔍 SERVER RECEIVED:', { status, startDate, endDate, sync });

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 Sync requested for products stats, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фильтруем по дате если указаны даты (с учетом dayStartHour)
    let dateRangeFilter = undefined;
    if (startDate && endDate) {
      // startDate це звітна дата (YYYY-MM-DD)
      // Звітна дата 18.10 починається з 17.10 16:00:00
      // Тому віднімаємо один день перед отриманням діапазону
      const startDateObj = new Date(startDate as string);
      startDateObj.setDate(startDateObj.getDate() - 1);
      const startDateString = startDateObj.toISOString().split('T')[0];
      const { start } = getReportingDateRange(startDateString, dayStartHour);
      
      // endDate це остання звітна дата (YYYY-MM-DD)
      // Звітна дата 20.10 закінчується 20.10 15:59:59
      // (наступного дня 16:00 мінус 1 секунда)
      const { end } = getReportingDateRange(endDate as string, dayStartHour);
      
      dateRangeFilter = { start, end };
    }

    // Получаем заказы с фильтрами включая дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Увеличиваем лимит для получения большего количества данных
      sortBy: 'orderDate',
      sortOrder: 'desc',
      dateRange: dateRangeFilter
    });

    const filteredOrders = orders; // Уже отфильтрованы в БД

    // Собираем статистику по товарам из кешированных данных
    const productStats: { [key: string]: { name: string; sku: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};


    // Получаем все externalId для bulk-запроса к кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Получаем все кеши одним запросом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    let processedOrders = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    // Проходим по всем заказам и собираем статистику из кеша
    for (const order of filteredOrders) {
      if (processedOrders % 50 === 0) {
        console.log(`Processed ${processedOrders}/${filteredOrders.length} orders (${cacheHits} cache hits, ${cacheMisses} misses)`);
      }
      processedOrders++;

      try {
        // Проверяем, есть ли кешированные данные
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            cacheHits++;

            // Добавляем кешированные данные к общей статистике
            for (const item of cachedStats) {
              if (item && item.sku) {
                if (productStats[item.sku]) {
                  productStats[item.sku].orderedQuantity += item.orderedQuantity || 0;
                  // Обновляем остатки на складах (берем последние данные)
                  productStats[item.sku].stockBalances = item.stockBalances || {};
                } else {
                  productStats[item.sku] = {
                    name: item.name || item.sku,
                    sku: item.sku,
                    orderedQuantity: item.orderedQuantity || 0,
                    stockBalances: item.stockBalances || {}
                  };
                }
              }
            }
          } else {
            // Кеш поврежден - пропускаем этот заказ
            console.warn(`Invalid cached data format for order ${order.externalId}, skipping...`);
            cacheMisses++;
          }
        } else {
          // Кеша нет - пропускаем этот заказ
          console.log(`No cached data for order ${order.externalId}, skipping...`);
          cacheMisses++;
        }
      } catch (error) {
        // Ошибка при обработке кеша - пропускаем этот заказ
        console.warn(`Error processing cached data for order ${order.externalId}, skipping:`, error);
        cacheMisses++;
      }
    }

    console.log(`✅ Cache processing completed: ${cacheHits} hits, ${cacheMisses} misses`);

    // Конвертируем в массив для ответа
    const productStatsArray = Object.values(productStats);

    console.log('✅ FINAL RESULT:', {
      totalProducts: productStatsArray.length,
      totalOrders: filteredOrders.length,
      filters: {
        status: status || 'all',
        dateRange: startDate && endDate ? { startDate, endDate } : null,
        dayStartHour
      }
    });

    const response = {
      success: true,
      data: productStatsArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: startDate && endDate ? { startDate, endDate } : null,
          dayStartHour
        },
        totalProducts: productStatsArray.length,
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    console.log(`✅ [STATS CACHE] MISS: Calculated and cached product stats for key: ${cacheKey}`);

    res.json(response);
  } catch (error) {
    console.error('Error getting products stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/stats/dates
 * Получить статистику по конкретному товару с разбивкой по датам
 */
router.get('/products/stats/dates', authenticateToken, async (req, res) => {
  try {
    const { sku, status, startDate, endDate, sync } = req.query;

    // Получаем час начала звітного дня
    const dayStartHour = await getReportingDayStartHour();

    // Парсим статусы: если строка содержит запятую, разбиваем на массив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!sku) {
      return res.status(400).json({
        success: false,
        error: 'SKU товара обязателен'
      });
    }

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 Sync requested for product date stats, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фильтруем по дате если указаны даты (с учетом dayStartHour)
    let dateRangeFilter = undefined;
    if (startDate && endDate) {
      // startDate це звітна дата (YYYY-MM-DD)
      // Звітна дата 18.10 починається з 17.10 16:00:00
      // Тому віднімаємо один день перед отриманням діапазону
      const startDateObj = new Date(startDate as string);
      startDateObj.setDate(startDateObj.getDate() - 1);
      const startDateString = startDateObj.toISOString().split('T')[0];
      const { start } = getReportingDateRange(startDateString, dayStartHour);
      
      // endDate це остання звітна дата (YYYY-MM-DD)
      // Звітна дата 20.10 закінчується 20.10 15:59:59
      // (наступного дня 16:00 мінус 1 секунда)
      const { end } = getReportingDateRange(endDate as string, dayStartHour);
      
      dateRangeFilter = { start, end };
    }

    // Получаем заказы с фильтрами включая дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Увеличиваем лимит для получения большего количества данных
      sortBy: 'orderDate',
      sortOrder: 'asc', // Для корректной последовательности дат
      dateRange: dateRangeFilter
    });

    const filteredOrders = orders; // Уже отфильтрованы в БД

    // Получаем все externalId для bulk-запроса к кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Получаем все кеши одним запросом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Собираем статистику по датам для конкретного товара (используя звітні дати)
    const dateStats: { [date: string]: { date: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};

    for (const order of filteredOrders) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            // Ищем товар с указанным SKU
            const productItem = cachedStats.find(item => item && item.sku === sku);
            if (productItem) {
              // Используем звітну дату вместо простой даты
              const reportingDate = getReportingDate(order.orderDate, dayStartHour);

              if (dateStats[reportingDate]) {
                dateStats[reportingDate].orderedQuantity += productItem.orderedQuantity || 0;
                // Обновляем остатки на складах (берем последние данные)
                dateStats[reportingDate].stockBalances = productItem.stockBalances || {};
              } else {
                dateStats[reportingDate] = {
                  date: reportingDate,
                  orderedQuantity: productItem.orderedQuantity || 0,
                  stockBalances: productItem.stockBalances || {}
                };
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error processing cached data for order ${order.externalId}:`, error);
      }
    }

    // Конвертируем в массив и сортируем по дате
    const dateStatsArray = Object.values(dateStats).sort((a, b) => a.date.localeCompare(b.date));

    // Получаем информацию о товаре из последнего заказа
    let productInfo = { name: sku, sku: sku };
    for (const order of filteredOrders.slice().reverse()) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            const productItem = cachedStats.find(item => item && item.sku === sku);
            if (productItem) {
              productInfo = { name: productItem.name || sku, sku: productItem.sku };
              break;
            }
          }
        }
      } catch (error) {
        // Продолжаем поиск
      }
    }

    console.log('✅ PRODUCT DATE STATS RESULT:', {
      product: productInfo,
      totalDates: dateStatsArray.length,
      totalOrders: filteredOrders.length,
      filters: {
        sku,
        status: status || 'all',
        dateRange: startDate && endDate ? { startDate, endDate } : null,
        dayStartHour
      }
    });

    res.json({
      success: true,
      data: dateStatsArray,
      product: productInfo,
      metadata: {
        source: 'local_database',
        filters: {
          sku,
          status: status || 'all',
          dateRange: startDate && endDate ? { startDate, endDate } : null,
          dayStartHour
        },
        totalDates: dateStatsArray.length,
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting product date stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/chart
 * Получить данные для графика продаж по товарам с разбивкой по датам
 */
router.get('/products/chart', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync, groupBy = 'day', products } = req.query;

    // Получаем час начала звітного дня
    const dayStartHour = await getReportingDayStartHour();

    const productsKey = Array.isArray(products) ? [...products].sort().join(',') : products || 'all';
    const cacheKey = `stats-chart-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${groupBy}-${productsKey}-${dayStartHour}`;

    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached chart data for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Парсим статусы: если строка содержит запятую, разбиваем на массив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate и endDate обязательны'
      });
    }

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 Sync requested for products chart, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фільтруємо по даті (з урахуванням dayStartHour)
    // startDate та endDate вже правильно конвертовані на клієнті через convertCalendarRangeToReportingRange
    // Тому просто використовуємо їх безпосередньо
    const { start } = getReportingDateRange(startDate as string, dayStartHour);
    
    // endDate це звітна дата - закінчується в кінці звітного дня
    const { end } = getReportingDateRange(endDate as string, dayStartHour);

    // console.log(`📅 Filtering chart data by date range: ${start.toISOString()} to ${end.toISOString()}`);

    // Получаем заказы с фильтрами включая дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Увеличиваем лимит для получения большего количества данных
      sortBy: 'orderDate',
      sortOrder: 'asc',
      dateRange: {
        start: start,
        end: end
      }
    });

    const filteredOrders = orders; // Уже отфильтрованы в БД


    // Определения групп товаров для API
    const productGroupOptions = [
      { key: "first_courses", label: "Перші страви" },
      { key: "main_courses", label: "Другі страви" },
    ];

    // Функция определения группы товара
    const getProductGroup = (productName: string): string => {
      const name = productName.toLowerCase();
      if (name.includes('борщ') || name.includes('суп') || name.includes('бульйон') || name.includes('перший') || name.includes('перша')) {
        return 'first_courses';
      }
      // По умолчанию все остальные товары считаем вторыми блюдами
      return 'main_courses';
    };

    // Обрабатываем фильтр по товарам
    let filterProducts: string[] = [];
    let filterGroups: string[] = [];

    if (products) {
      if (Array.isArray(products)) {
        filterProducts = products as string[];
      } else {
        filterProducts = [products as string];
      }

      // Разделяем на группы и индивидуальные товары
      const individualProducts = filterProducts.filter(p => !p.startsWith('group_'));
      const groupFilters = filterProducts.filter(p => p.startsWith('group_'));

      filterProducts = individualProducts;
      filterGroups = groupFilters.map(g => g.replace('group_', ''));


    }

    // Получаем все externalId для bulk-запроса к кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Получаем все кеши одним запросом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Собираем данные по товарам с разбивкой по датам (используя звітні дати)
    const chartData: { [dateKey: string]: { [sku: string]: { name: string; quantity: number } } } = {};
    const productInfo: { [sku: string]: string } = {};

    for (const order of filteredOrders) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            // Получаем звітну дату для цього замовлення
            const reportingDate = getReportingDate(order.orderDate, dayStartHour);
            
            let dateKey: string;

            switch (groupBy) {
              case 'hour':
                // Для годин використовуємо реальну дату та час замовлення
                const realYear = order.orderDate.getFullYear();
                const realMonth = String(order.orderDate.getMonth() + 1).padStart(2, '0');
                const realDay = String(order.orderDate.getDate()).padStart(2, '0');
                const realHour = String(order.orderDate.getHours()).padStart(2, '0');
                dateKey = `${realYear}-${realMonth}-${realDay}T${realHour}`;
                break;
              case 'day':
                const orderDateForGrouping = new Date(reportingDate);
                dateKey = `${orderDateForGrouping.getFullYear()}-${String(orderDateForGrouping.getMonth() + 1).padStart(2, '0')}-${String(orderDateForGrouping.getDate()).padStart(2, '0')}`;
                break;
              case 'week':
                const orderDateForWeek = new Date(reportingDate);
                const weekStart = new Date(orderDateForWeek);
                weekStart.setDate(orderDateForWeek.getDate() - orderDateForWeek.getDay() + 1); // Понедельник
                dateKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
                break;
              case 'month':
                const orderDateForMonth = new Date(reportingDate);
                dateKey = `${orderDateForMonth.getFullYear()}-${String(orderDateForMonth.getMonth() + 1).padStart(2, '0')}`;
                break;
              default:
                const orderDateForDefault = new Date(reportingDate);
                dateKey = `${orderDateForDefault.getFullYear()}-${String(orderDateForDefault.getMonth() + 1).padStart(2, '0')}-${String(orderDateForDefault.getDate()).padStart(2, '0')}`;
            }

            if (!chartData[dateKey]) {
              chartData[dateKey] = {};
            }

            // Обрабатываем товары в заказе
            for (const item of cachedStats) {
              if (item && item.sku && item.orderedQuantity > 0) {
                // Проверяем фильтр по товарам и группам
                let shouldInclude = false;

                if (filterProducts.length === 0 && filterGroups.length === 0) {
                  // Нет фильтров - включаем все товары
                  shouldInclude = true;
                } else {
                  // Проверяем индивидуальные товары
                  if (filterProducts.includes(item.sku)) {
                    shouldInclude = true;
                  }

                  // Проверяем группы товаров
                  if (filterGroups.length > 0) {
                    const productGroup = getProductGroup(item.name || item.sku);
                    if (filterGroups.includes(productGroup)) {
                      shouldInclude = true;
                    }
                  }
                }

                if (shouldInclude) {
                  if (!productInfo[item.sku]) {
                    productInfo[item.sku] = item.name || item.sku;
                  }

                  if (!chartData[dateKey][item.sku]) {
                    chartData[dateKey][item.sku] = {
                      name: item.name || item.sku,
                      quantity: 0
                    };
                  }

                  chartData[dateKey][item.sku].quantity += item.orderedQuantity;
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error processing order ${order.externalId} for chart:`, error);
      }
    }

    // Конвертируем в массив для ответа
    const chartDataArray = Object.entries(chartData)
      .map(([dateKey, products]) => {
        // Форматируем дату для отображения в зависимости от groupBy
        let formattedDate = dateKey;
        let displayDate = dateKey;

        if (groupBy === 'hour') {
          // Для часов: "29.08 21:00"
          const date = new Date(dateKey + ':00:00');
          formattedDate = date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          displayDate = formattedDate;
        } else if (groupBy === 'day') {
          // Для дней: "29.08"
          const date = new Date(dateKey);
          formattedDate = date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit'
          });
          displayDate = formattedDate;
        } else if (groupBy === 'week') {
          // Для недель: "26.08 - 01.09"
          const weekStart = new Date(dateKey);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);

          const startStr = weekStart.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit'
          });
          const endStr = weekEnd.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit'
          });

          formattedDate = `${startStr} - ${endStr}`;
          displayDate = formattedDate;
        } else if (groupBy === 'month') {
          // Для месяцев: "серпень 2025"
          const date = new Date(dateKey + '-01');
          formattedDate = date.toLocaleDateString('uk-UA', {
            month: 'long',
            year: 'numeric'
          });
          displayDate = formattedDate;
        }

        return {
          date: displayDate,
          rawDate: dateKey, // Сохраняем сырую дату для сортировки
          ...Object.fromEntries(
            Object.entries(products).map(([sku, data]) => [
              `product_${sku}`,
              data.quantity
            ])
          ),
          ...Object.fromEntries(
            Object.entries(products).map(([sku, data]) => [
              `product_${sku}_name`,
              data.name
            ])
          )
        };
      })
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

    // Создаем агрегированные линии для групп или общую линию
    const totalDataArray = chartDataArray.map(point => {
      const result = { ...point };

      // Если выбраны группы товаров - создаем отдельные линии для каждой группы
      if (filterGroups.length > 0) {
        filterGroups.forEach((groupKey, index) => {
          // Находим товары этой группы
          const groupProducts = Object.keys(point).filter(key => {
            if (!key.startsWith('product_') || key.endsWith('_name')) return false;

            const productName = point[`${key}_name`];
            const productGroup = getProductGroup(productName);
            return productGroup === groupKey;
          });

          // Суммируем продажи товаров этой группы
          const groupTotal = groupProducts.reduce((sum, key) => sum + (point[key] || 0), 0);

          if (groupTotal > 0) {
            const groupLabel = productGroupOptions.find(opt => opt.key === groupKey)?.label || groupKey;
            result[`group_${groupKey}`] = groupTotal;
            result[`group_${groupKey}_name`] = groupLabel;
          }
        });
      }

      // Если выбраны индивидуальные товары - оставляем только их
      if (filterProducts.length > 0) {
        // Удаляем все товары, кроме выбранных индивидуальных
        Object.keys(result).forEach(key => {
          if (key.startsWith('product_') && !key.endsWith('_name') && key !== 'product_') {
            const sku = key.replace('product_', '');
            if (!filterProducts.includes(sku)) {
              delete result[key];
              delete result[`${key}_name`];
            }
          }
        });
      }

      // Если ничего не выбрано - создаем общую линию всех товаров
      if (filterGroups.length === 0 && filterProducts.length === 0) {
        const products = Object.keys(point).filter(key =>
          key.startsWith('product_') && !key.endsWith('_name') && key !== 'product_'
        );
        const total = products.reduce((sum, key) => sum + (point[key] || 0), 0);
        const productCount = products.length;

        (result as any).totalSales = total;
        (result as any).totalSales_name = `Всі товари (${productCount})`;
      }

      return result;
    });

    // Подсчитываем реальное количество линий в данных (товары + группы)
    const actualProductCount = totalDataArray.length > 0
      ? Object.keys(totalDataArray[0]).filter(key =>
          (key.startsWith('product_') || key.startsWith('group_')) &&
          !key.endsWith('_name') &&
          key !== 'product_' &&
          key !== 'totalSales'
        ).length
      : 0;

    // console.log(`✅ CHART DATA GENERATED: ${totalDataArray.length} points, ${actualProductCount} products in data, ${Object.keys(productInfo).length} total products info`);

    const response = {
      success: true,
      data: totalDataArray,
      products: productInfo,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: { startDate, endDate },
          groupBy,
          products: filterProducts,
          groups: filterGroups,
          dayStartHour
        },
        totalPoints: totalDataArray.length,
        totalProducts: actualProductCount, // Реальное количество товаров в данных
        totalProductsInfo: Object.keys(productInfo).length, // Общее количество товаров в словаре
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    console.log(`✅ [STATS CACHE] MISS: Calculated and cached chart data for key: ${cacheKey}`);

    res.json(response);
  } catch (error) {
    console.error('Error getting products chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/sales/report
 * Получить отчет продаж по дням для таблицы
 */
router.get('/sales/report', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync, products, singleDay } = req.query;

    // Получаем час начала звітного дня
    const dayStartHour = await getReportingDayStartHour();

    const productsKey = Array.isArray(products) ? [...products].sort().join(',') : products || 'all';
    const singleDayKey = singleDay === 'true' ? 'single' : 'range';
    const cacheKey = `stats-report-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${productsKey}-${dayStartHour}-${singleDayKey}`;

    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached sales report for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Парсим статусы: если строка содержит запятую, разбиваем на массив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate и endDate обязательны'
      });
    }

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 Sync requested for sales report, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фильтруем по дате (с учетом dayStartHour)
    let start: Date, end: Date;
    
    if (singleDay === 'true' && startDate === endDate) {
      // Для однієї дати: startDate це календарна дата, треба знайти правильний звітний день
      // Календарна дата 16.10 може належати до звітного дня 16.10 або 17.10 залежно від часу
      // Оскільки користувач вибрав 16.10, він хоче бачити дані за 16.10 як звітний день
      const calendarDateStr = startDate as string;
      const reportingRange = getReportingDateRange(calendarDateStr, dayStartHour);
      start = reportingRange.start;
      end = reportingRange.end;
      console.log(`📅 Single day mode: календарна дата ${startDate} → звітний день ${startDate}, range: ${start.toISOString()} - ${end.toISOString()}`);
    } else {
      // Для діапазону дат: startDate та endDate це календарні дати
      // Конвертуємо їх напряму без зсувів
      start = getReportingDateRange(startDate as string, dayStartHour).start;
      end = getReportingDateRange(endDate as string, dayStartHour).end;
      console.log(`📅 Date range mode: ${startDate} - ${endDate}, range: ${start.toISOString()} - ${end.toISOString()}`);
    }

    // Получаем заказы с фильтрами включая дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Увеличиваем лимит для получения большего количества данных
      sortBy: 'orderDate',
      sortOrder: 'asc',
      // Добавляем фильтр по дате в запрос к БД
      dateRange: {
        start: start,
        end: end
      }
    });

    const filteredOrders = orders; // Уже отфильтрованы в БД

    // Функция определения группы товара
    const getProductGroup = (productName: string): string => {
      const name = productName.toLowerCase();
      if (name.includes('борщ') || name.includes('суп') || name.includes('перший') || name.includes('перша')) {
        return 'first_courses';
      }
      // По умолчанию все остальные товары считаем вторыми блюдами
      return 'main_courses';
    };

    // Обрабатываем фильтр по товарам
    let filterProducts: string[] = [];
    let filterGroups: string[] = [];

    if (products) {
      if (Array.isArray(products)) {
        filterProducts = products as string[];
      } else {
        filterProducts = [products as string];
      }

      // Разделяем на группы и индивидуальные товары
      const individualProducts = filterProducts.filter(p => !p.startsWith('group_'));
      const groupFilters = filterProducts.filter(p => p.startsWith('group_'));

      filterProducts = individualProducts;
      filterGroups = groupFilters.map(g => g.replace('group_', ''));
    }

    // Карта для маппинга кодов сайтов в названия источников
    const sourceMapping: Record<string, string> = {
      '19': 'Сайт',
      '22': 'Розетка',
      '24': 'Пром',
      '28': 'Пром',
      '31': 'Інше'
    };

    // Получаем все externalId для bulk-запроса к кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Получаем все кеши одним запросом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Собираем данные по дням (используя звітні дати)
    const salesData: { [dateKey: string]: {
      ordersCount: number;
      portionsCount: number;
      ordersByStatus: { [status: string]: number };
      portionsByStatus: { [status: string]: number };
      ordersBySource: { [source: string]: number };
      portionsBySource: { [source: string]: number };
      ordersWithDiscountReason: number;
      portionsWithDiscountReason: number;
      discountReasonText: string;
      orders: Array<{
        orderNumber: string;
        portionsCount: number;
        orderDate: string;
        externalId: string;
        status: string;
        source: string;
      }>;
    } } = {};

    for (const order of filteredOrders) {
      try {
        // Используем звітну дату вместо просто локальной даты
        const reportingDate = getReportingDate(order.orderDate, dayStartHour);
        const dateKey = reportingDate; // YYYY-MM-DD в форматі звітної дати

        if (!salesData[dateKey]) {
          salesData[dateKey] = {
            ordersCount: 0,
            portionsCount: 0,
            ordersByStatus: {},
            portionsByStatus: {},
            ordersBySource: {},
            portionsBySource: {},
            ordersWithDiscountReason: 0,
            portionsWithDiscountReason: 0,
            discountReasonText: '',
            orders: []
          };
        }

        // Проверяем фильтр по товарам
        let shouldIncludeOrder = false;
        let orderPortions = 0;

        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            for (const item of cachedStats) {
              if (item && item.sku && item.orderedQuantity > 0) {
                let shouldInclude = false;

                if (filterProducts.length === 0 && filterGroups.length === 0) {
                  // Нет фильтров - включаем все товары
                  shouldInclude = true;
                } else {
                  // Проверяем индивидуальные товары
                  if (filterProducts.includes(item.sku)) {
                    shouldInclude = true;
                  }

                  // Проверяем группы товаров
                  if (filterGroups.length > 0) {
                    const productGroup = getProductGroup(item.name || item.sku);
                    if (filterGroups.includes(productGroup)) {
                      shouldInclude = true;
                    }
                  }
                }

                if (shouldInclude) {
                  orderPortions += item.orderedQuantity;
                  shouldIncludeOrder = true;
                }
              }
            }
          }
        }

        if (shouldIncludeOrder) {
          // Добавляем заказ к статистике дня
          salesData[dateKey].ordersCount += 1;
          salesData[dateKey].portionsCount += orderPortions;

          // Статистика по статусам
          const ordStatus = order.status;
          if (!salesData[dateKey].ordersByStatus[ordStatus]) {
            salesData[dateKey].ordersByStatus[ordStatus] = 0;
            salesData[dateKey].portionsByStatus[ordStatus] = 0;
          }
          salesData[dateKey].ordersByStatus[ordStatus] += 1;
          salesData[dateKey].portionsByStatus[ordStatus] += orderPortions;

          // Статистика по источникам
          const sourceCode = order.sajt || '';
          const sourceName = getOrderSourceDetailed(sourceCode) || 'Інше';

          if (!salesData[dateKey].ordersBySource[sourceName]) {
            salesData[dateKey].ordersBySource[sourceName] = 0;
            salesData[dateKey].portionsBySource[sourceName] = 0;
          }
          salesData[dateKey].ordersBySource[sourceName] += 1;
          salesData[dateKey].portionsBySource[sourceName] += orderPortions;

          // Статистика по pricinaZnizki (причина знижки)
          if (order.pricinaZnizki && order.pricinaZnizki.trim() !== '') {
            salesData[dateKey].ordersWithDiscountReason += 1;
            salesData[dateKey].portionsWithDiscountReason += orderPortions;

            // Определяем причину скидки
            if (order.pricinaZnizki === '33') {
              salesData[dateKey].discountReasonText = 'Військові/волонтери';
            }
          }

          salesData[dateKey].orders.push({
            orderNumber: order.orderNumber || order.externalId,
            portionsCount: orderPortions,
            orderDate: order.orderDate
              ? new Date(order.orderDate).toLocaleString('uk-UA', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : '',
            externalId: order.externalId,
            status: order.status,
            source: getOrderSourceDetailed(order.sajt || '')
          });
        }

      } catch (error) {
        console.warn(`Error processing order ${order.externalId} for sales report:`, error);
      }
    }

    // Конвертируем в массив для ответа
    const salesDataArray = Object.entries(salesData)
      .map(([dateKey, data]) => ({
        date: dateKey,
        ordersCount: data.ordersCount,
        portionsCount: data.portionsCount,
        ordersByStatus: data.ordersByStatus,
        portionsByStatus: data.portionsByStatus,
        ordersBySource: data.ordersBySource,
        portionsBySource: data.portionsBySource,
        ordersWithDiscountReason: data.ordersWithDiscountReason,
        portionsWithDiscountReason: data.portionsWithDiscountReason,
        discountReasonText: data.discountReasonText,
        orders: data.orders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime())
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`✅ SALES REPORT GENERATED: ${salesDataArray.length} days`);

    const response = {
      success: true,
      data: salesDataArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: { startDate, endDate },
          products: filterProducts,
          groups: filterGroups,
          dayStartHour
        },
        totalDays: salesDataArray.length,
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    console.log(`✅ [STATS CACHE] MISS: Calculated and cached sales report for key: ${cacheKey}`);

    res.json(response);
  } catch (error) {
    console.error('Error getting sales report data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/chart/status-details
 * Получить детальную информацию по статусам заказов за конкретную дату
 */
router.get('/products/chart/status-details', authenticateToken, async (req, res) => {
  try {
    const { date, startDate, endDate, groupBy = 'day' } = req.query;

    if (!date || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'date, startDate и endDate обязательны'
      });
    }

    // Фильтруем по дате
    const start = new Date(startDate as string + ' 00:00:00');
    const end = new Date(endDate as string + ' 23:59:59');

    // Получаем заказы за указанный период с фильтром по дате
    const orders = await orderDatabaseService.getOrders({
      limit: 10000,
      sortBy: 'orderDate',
      sortOrder: 'asc',
      dateRange: {
        start: start,
        end: end
      }
    });

    const filteredOrders = orders; // Уже отфильтрованы в БД

    // Определяем границы даты для группировки
    let dateStart: Date;
    let dateEnd: Date;

    if (groupBy === 'day') {
      dateStart = new Date(date as string + ' 00:00:00');
      dateEnd = new Date(date as string + ' 23:59:59');
    } else if (groupBy === 'week') {
      const targetDate = new Date(date as string);
      dateStart = new Date(targetDate);
      dateStart.setDate(targetDate.getDate() - targetDate.getDay() + 1); // Понедельник
      dateStart.setHours(0, 0, 0, 0);
      dateEnd = new Date(dateStart);
      dateEnd.setDate(dateStart.getDate() + 6);
      dateEnd.setHours(23, 59, 59, 999);
    } else if (groupBy === 'month') {
      const targetDate = new Date(date as string + '-01');
      dateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      dateEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
      dateEnd.setHours(23, 59, 59, 999);
    } else {
      // hour
      dateStart = new Date(date as string + ':00:00');
      dateEnd = new Date(date as string + ':59:59');
    }


    // Получаем все externalId для bulk-запроса к кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Получаем все кеши одним запросом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Группируем заказы по статусам для указанной даты
    const statusBreakdown: { [status: string]: { orders: any[], totalPortions: number, products: { [sku: string]: { name: string, quantity: number } } } } = {};

    for (const order of filteredOrders) {
      if (!order.orderDate) continue;

      const orderDate = new Date(order.orderDate);
      if (orderDate >= dateStart && orderDate <= dateEnd) {
        const status = order.status;

        if (!statusBreakdown[status]) {
          statusBreakdown[status] = {
            orders: [],
            totalPortions: 0,
            products: {}
          };
        }

        statusBreakdown[status].orders.push({
          id: order.externalId,
          orderDate: order.orderDate,
          quantity: order.quantity,
          statusText: order.statusText
        });

        // Парсим товары из кешированных данных
        try {
          const cacheData = orderCaches.get(order.externalId);
          if (cacheData && cacheData.processedItems) {
            const cachedStats = JSON.parse(cacheData.processedItems);
            if (Array.isArray(cachedStats)) {
              for (const item of cachedStats) {
                if (item && item.sku && item.orderedQuantity > 0) {
                  if (!statusBreakdown[status].products[item.sku]) {
                    statusBreakdown[status].products[item.sku] = {
                      name: item.name || item.sku,
                      quantity: 0
                    };
                  }
                  statusBreakdown[status].products[item.sku].quantity += item.orderedQuantity;
                  statusBreakdown[status].totalPortions += item.orderedQuantity;
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Error parsing cached data for order ${order.externalId}:`, error);
        }
      }
    }

    // Преобразуем в массив для ответа
    const statusArray = Object.entries(statusBreakdown).map(([status, data]) => ({
      status,
      statusText: getStatusText(status),
      orderCount: data.orders.length,
      totalPortions: data.totalPortions,
      products: Object.values(data.products),
      orders: data.orders.slice(0, 10) // Ограничиваем до 10 заказов для производительности
    }));

    // Сортируем по количеству порций (убывание)
    statusArray.sort((a, b) => b.totalPortions - a.totalPortions);

    const totalPortionsAll = statusArray.reduce((sum, item) => sum + item.totalPortions, 0);
    const totalOrdersAll = statusArray.reduce((sum, item) => sum + item.orderCount, 0);

    res.json({
      success: true,
      data: statusArray,
      metadata: {
        date: date,
        dateRange: { start: dateStart.toISOString(), end: dateEnd.toISOString() },
        groupBy,
        totalPortions: totalPortionsAll,
        totalOrders: totalOrdersAll,
        statusCount: statusArray.length,
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting status details:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Вспомогательная функция для получения текстового представления статуса
function getStatusText(status: string): string {
  const statusMap: { [key: string]: string } = {
    '1': 'Нове',
    '2': 'Підтверджене',
    '3': 'Готове до відправки',
    '4': 'Відправлено',
    '5': 'Продано',
    '6': 'Відмовлено',
    '7': 'Повернено',
    '8': 'Видалено'
  };
  return statusMap[status] || status;
}

export default router;
