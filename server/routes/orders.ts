import { Router } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';
import { authenticateToken } from '../middleware/auth.js';
import { prisma, getOrderSourceDetailed, getReportingDayStartHour, getReportingDate, getReportingDateRange, logServer } from '../lib/utils.js';
import { dilovodService } from '../services/dilovod/index.js';
import { getStatusText } from '../services/salesdrive/statusMapper.js';

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
 * Отримувати замовлення з локальної БД з можливістю синхронізації та сортування
 */
router.get('/', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const { status, sync, sortBy, sortOrder, limit, search } = req.query;
  const include = (req.query.include as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const fields = (req.query.fields as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];

  // Парсимо статуси: якщо рядок містить кому, розбиваємо на масив
  let parsedStatus: string | string[] | undefined = status as string;
  if (typeof status === 'string' && status.includes(',')) {
    parsedStatus = status.split(',').map(s => s.trim());
  }


  try {
    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      const syncStartTime = Date.now();
      const syncResult = await salesDriveService.syncOrdersWithDatabase();
      const syncDuration = Date.now() - syncStartTime;
      if (!syncResult.success) {
        console.warn('⚠️ [SERVER] GET /api/orders: Sync completed with errors:', syncResult.errors);
      }
    }

    // Отримуємо замовлення з локальної БД з сортуванням та фільтрацією
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

    // Отримуємо загальну кількість замовлень для пагінації
    const totalCount = await orderDatabaseService.getOrdersCount({
      status: parsedStatus,
      search: search as string
    });

    // Отримуємо лічильники по статусах для табів
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


// Кеш для статистики ваги (5 хвилин)
const weightStatsCache = new Map();
const WEIGHT_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 хвилин

/**
 * GET /api/orders/weight-stats
 * Отримати статистику ваги замовлень за статусами для комірника
 */
router.get('/weight-stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 [WEIGHT STATS] Запит статистики ваги замовлень (через CACHE)');
    const cacheKey = 'weight-stats';
    const cached = weightStatsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < WEIGHT_STATS_CACHE_TTL) {
      console.log('📊 [WEIGHT STATS] Повертаємо дані з кешу');
      return res.json(cached.data);
    }

    const aWeekAgo = new Date();
    aWeekAgo.setDate(aWeekAgo.getDate() - 7);
    aWeekAgo.setHours(0, 0, 0, 0);

    // Витягуємо тільки externalId + status за останній тиждень
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

    // Bulk отримаємо кеші
    const ordersCacheMap = await ordersCacheService.getMultipleOrderCaches(allExternalIds);

    // Агрегація по статусу
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
    console.error('❌ [WEIGHT STATS] Помилка отримання статистики ваги (через кеш):', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/stats/summary
 * Отримати статистику по замовленням із локальної БД
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    // Отримуємо статистику із локальної БД
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
 * Отримати всі замовлення у сирому вигляді для налагодження
 */
router.get('/raw/all', authenticateToken, async (req, res) => {
  try {
    // Використовуємо паралельне завантаження за останній місяць
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
 * Отримати сирі дані від SalesDrive API без обробки
 */
router.get('/debug/raw', authenticateToken, async (req, res) => {
  try {
    // Отримуємо сирі дані безпосередньо від SalesDrive API
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
 * Отримати замовлення за певний період з синхронізацією
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

    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Отримуємо замовлення за період
    const orders = await orderDatabaseService.getOrders({
      limit: 10000, // Великий ліміт для періоду
      sortBy: 'orderDate',
      sortOrder: 'desc'
    });

    // Фільтруємо по даті
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
 * POST /api/orders/fix-items-data
 * Виправити пошкоджені дані items у замовленнях
 */
router.post('/fix-items-data', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо права доступу (тільки ADMIN)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const orders = await orderDatabaseService.getOrders({ limit: 10000 });
    let fixedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      if (order.items === '[object Object]') {
        // Намагаємось відновити дані з rawData
        try {
          if (order.rawData && typeof order.rawData === 'string') {
            const rawData = JSON.parse(order.rawData);

            // Шукаємо items у rawData (структура може бути різною)
            let items = null;
            if (rawData.items) {
              items = rawData.items;
            } else if (rawData.data && rawData.data.items) {
              items = rawData.data.items;
            }

            if (items && Array.isArray(items)) {
              // Оновлюємо items у базі даних
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
 * Отримати деталі конкретного замовлення за externalId (номером замовлення з SalesDrive)
 */
router.get('/:externalId', authenticateToken, async (req, res) => {
  try {
    const { externalId } = req.params; // Змінили з id на externalId
    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: 'Order external ID is required'
      });
    }


    // Отримуємо деталі замовлення за externalId
    const orderDetails = await orderDatabaseService.getOrderByExternalId(externalId);

    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Повертаємо повні дані замовлення
    res.json({
      success: true,
      data: {
        id: orderDetails.id,
        externalId: orderDetails.externalId,
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
        lastSynced: orderDetails.lastSynced,
        rawData: orderDetails.rawData,
        previousOrderExternalId: orderDetails.previousOrderExternalId,
        previousOrderNumber: orderDetails.previousOrderNumber,
        nextOrderExternalId: orderDetails.nextOrderExternalId,
        nextOrderNumber: orderDetails.nextOrderNumber,
        dilovodDocId: orderDetails.dilovodDocId,
        sajt: orderDetails.sajt,
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
 * GET /api/orders/:id/status
 * Отримати статус замовлення з локальної бази даних
 */
router.get('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await orderDatabaseService.getOrderStatus(id);
    res.json({
      success: true,
      status: result
    });
  } catch (error) {
    console.error('❌ Error fetching order status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/:id/fiscal-receipt?index=0
 * Отримати фіскальний чек з Dilovod за ID замовлення
 * Query params:
 *   - index: номер чека (0-based), за замовчуванням 0
 */
router.get('/:id/fiscal-receipt', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const index = parseInt(req.query.index as string) || 0;

    console.log(`📄 [FISCAL RECEIPT] Запит фіскального чеку для замовлення ID: ${id}, індекс: ${index}`);

    // Отримуємо замовлення з БД для отримання dilovodDocId
    const order = await prisma.order.findFirst({
      where: {
        id: parseInt(id)
      },
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        dilovodDocId: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (!order.dilovodDocId) {
      return res.status(404).json({
        success: false,
        error: 'Fiscal receipt not generated yet',
        message: 'Чек ще не сформовано. Замовлення має бути експортоване в Dilovod.'
      });
    }

    // Отримуємо фіскальний чек з Dilovod
    const receipt = await dilovodService.getFiscalReceipt(order.dilovodDocId, index);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Fiscal receipt not found',
        message: `Чек з індексом ${index} не знайдено в системі Dilovod`
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        dilovodDocId: order.dilovodDocId,
        receiptIndex: index,
        receipt
      }
    });

  } catch (error) {
    console.error('❌ Error fetching fiscal receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fiscal receipt',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/:id/fiscal-receipts/list
 * Отримати список всіх доступних фіскальних чеків для замовлення
 */
router.get('/:id/fiscal-receipts/list', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📋 [FISCAL RECEIPTS LIST] Запит списку чеків для замовлення ID: ${id}`);

    // Отримуємо замовлення з БД
    const order = await prisma.order.findFirst({
      where: {
        id: parseInt(id)
      },
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        dilovodDocId: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (!order.dilovodDocId) {
      return res.status(404).json({
        success: false,
        error: 'Order not exported to Dilovod',
        message: 'Замовлення ще не експортоване в Dilovod'
      });
    }

    // Отримуємо список чеків
    const receiptsList = await dilovodService.getFiscalReceiptsList(order.dilovodDocId);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        dilovodDocId: order.dilovodDocId,
        ...receiptsList
      }
    });

  } catch (error) {
    console.error('❌ Error fetching fiscal receipts list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fiscal receipts list',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/orders/:id/status
 * Оновити статус замовлення в SalesDrive
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

    // Оновлюємо статус в SalesDrive
    const result = await salesDriveService.updateSalesDriveOrderStatus(id, status);

    if (result) {
      // Якщо статус змінився на "3" (Готове до відправки), записуємо дату
      if (status === '3') {
        try {
          await prisma.order.update({
            where: { id: parseInt(id) },
            data: { readyToShipAt: new Date() }
          });
          logServer(`✅ [Orders API] Order ${id} readyToShipAt set to current time`);
        } catch (dbError) {
          console.error(`⚠️ [Orders API] Failed to update readyToShipAt for order ${id}:`, dbError);
          // Не блокуємо відповідь, якщо не вдалося оновити дату
        }
      }

      // Тригер автоматичного export/відвантаження в Dilovod (фонова операція — не блокує відповідь)
      import('../services/dilovod/DilovodAutoExportService.js')
        .then(({ dilovodAutoExportService }) =>
          dilovodAutoExportService.processOrderStatusChange(
            parseInt(id),
            status,
            'manual:status_change'
          )
        )
        .catch(err =>
          console.warn('⚠️ [AutoExport] Manual status change trigger failed:', err instanceof Error ? err.message : err)
        );

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
 * Заповнити кеш для конкретного замовлення
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
 * Отримати статистику кешу
 */
router.get('/cache/stats', authenticateToken, async (req, res) => {
  try {
    const totalOrders = await prisma.order.count();

    // Отримуємо статистику кешу з orders_cache
    const cacheStats = await ordersCacheService.getCacheStatistics();
    const cachedOrders = cacheStats.totalEntries;
    const averageCacheTime = cacheStats.averageAge * 60 * 60 * 1000; // в миллисекунды

    // Отримати hit rate (відсоток замовлень з кешем)
    const cacheHitRate = totalOrders > 0 ? (cachedOrders / totalOrders) * 100 : 0;

    // Загальний розмір кешу - кількість замовлень з кешем
    const totalCacheSize = cachedOrders;

    // Отримати час останнього оновлення кешу
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
 * Отримати інформацію про стан кешу
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
 * Очистити весь кеш
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
 * Очистити конкретний запис з кешу
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

/**
 * POST /api/orders/cache/stats/clear
 * Очистити серверний кеш статистики
 */
router.post('/cache/stats/clear', authenticateToken, async (req, res) => {
  try {
    const sizeBefore = statsCache.size;
    statsCache.clear();
    
    logServer(`✅ [STATS CACHE] Cleared ${sizeBefore} cached statistics entries`);

    res.json({
      success: true,
      message: `Statistics cache cleared successfully`,
      data: {
        entriesCleared: sizeBefore,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error clearing statistics cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear statistics cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Допоміжні функції для порівняння товарів у замовленнях
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

    // Парсимо товари замовлення
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

// Розпарсити кешовані товари замовлення
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

// Порівняти товари в замовленнях
function compareOrderItems(currentItems: any[], cachedItems: any[]): boolean {
  if (!currentItems || !cachedItems) return true; // Якщо не можемо порівняти - вважаємо, що змінилися

  // Створюємо мапи за SKU для швидкого порівняння
  const currentMap = new Map();
  const cachedMap = new Map();

  // Нормалізуємо поточні товари
  currentItems.forEach(item => {
    if (item && item.sku) {
      currentMap.set(item.sku.toString().toLowerCase(), {
        sku: item.sku,
        quantity: item.orderedQuantity || item.quantity || 0,
        name: item.name || ''
      });
    }
  });

  // Нормалізуємо кешовані товари
  cachedItems.forEach(item => {
    if (item && item.sku) {
      cachedMap.set(item.sku.toString().toLowerCase(), {
        sku: item.sku,
        quantity: item.orderedQuantity || item.quantity || 0,
        name: item.name || ''
      });
    }
  });

  // Порівнюємо розміри
  if (currentMap.size !== cachedMap.size) {
    console.log(`📊 Items count changed: current=${currentMap.size}, cached=${cachedMap.size}`);
    return true; // Кількість товарів змінилася
  }

  // Порівнюємо кожен товар
  for (const [sku, currentItem] of currentMap) {
    const cachedItem = cachedMap.get(sku);

    if (!cachedItem) {
      console.log(`➕ New item found: ${sku}`);
      return true; // Новий товар
    }

    if (currentItem.quantity !== cachedItem.quantity) {
      console.log(`📈 Quantity changed for ${sku}: current=${currentItem.quantity}, cached=${cachedItem.quantity}`);
      return true; // Кількість змінилася
    }
  }

  // Перевіряємо зворотне - чи немає видалених товарів
  for (const [sku, cachedItem] of cachedMap) {
    if (!currentMap.has(sku)) {
      console.log(`➖ Item removed: ${sku}`);
      return true; // Товар видалений
    }
  }

  return false; // Товари не змінилися
}

/**
 * POST /api/orders/cache/validate
 * Валидировать и обновить кеш заказов
 */
router.post('/cache/validate', authenticateToken, async (req, res) => {
  try {
    // Params can come from body (JSON POST) or query string — support both
    const startDate = (req.body?.startDate ?? req.query.startDate) as string | undefined;
    const endDate = (req.body?.endDate ?? req.query.endDate) as string | undefined;
    const force = req.body?.force ?? req.query.force;
    const mode = (req.body?.mode ?? req.query.mode) as string | undefined;

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
              console.log(`📅 [CACHE VALIDATION] Order ${externalId} is stale by date (cached: ${cachedDate.toLocaleString('uk-UA')}, actual: ${actualDate.toLocaleString('uk-UA')})`);

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
      period: dateRangeFilter ? `${dateRangeFilter.startDate.toLocaleString('uk-UA')} - ${dateRangeFilter.endDate.toLocaleString('uk-UA')}` : 'all time',
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
          validationDate: new Date().toLocaleString('uk-UA')
        }
      },
      timestamp: new Date().toLocaleString('uk-UA')
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
    const { status, startDate, endDate, sync, shippedOnly } = req.query;

    const cacheKey = `stats-products-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${shippedOnly || 'false'}`;
    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached product stats for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Отримуємо час початку звітного дня
    const dayStartHour = await getReportingDayStartHour();
    // Для відвантажень використовуємо 00:00 (24-годинний цикл без зміщення), 
    // щоб 19.12 00:00 - 23:59 потрапляло в 19.12
    const effectiveDayStartHour = shippedOnly === 'true' ? 24 : dayStartHour;

    // Парсим статуси: якщо рядок містить кому, розбиваємо на масив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }
    // console.log('🔍 SERVER RECEIVED:', { status, startDate, endDate, sync });

    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      console.log('🔄 Sync requested for products stats, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фільтруємо за датою, якщо вказані дати (з урахуванням dayStartHour)
    let dateRangeFilter = undefined;
    let shippedDateRangeFilter = undefined;

    if (startDate && endDate) {
      const { start } = getReportingDateRange(startDate as string, effectiveDayStartHour);
      const { end } = getReportingDateRange(endDate as string, effectiveDayStartHour);

      if (shippedOnly === 'true') {
        shippedDateRangeFilter = { start, end };
      } else {
        dateRangeFilter = { start, end };
      }
    }

    // Отримуємо замовлення з фільтрами включно з датою
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: shippedOnly === 'true' ? 'dilovodSaleExportDate' : 'orderDate',
      sortOrder: 'desc',
      dateRange: dateRangeFilter,
      shippedOnly: shippedOnly === 'true',
      shippedDateRange: shippedDateRangeFilter
    });

    const filteredOrders = orders; // Вже відфільтровані в БД

    // Збираємо статистику по товарам з кешованих даних
    const productStats: { [key: string]: { name: string; sku: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};


    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    let processedOrders = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    // Проходимо по всіх замовленнях і збираємо статистику з кешу
    for (const order of filteredOrders) {
      if (processedOrders % 50 === 0) {
        console.log(`Processed ${processedOrders}/${filteredOrders.length} orders (${cacheHits} cache hits, ${cacheMisses} misses)`);
      }
      processedOrders++;

      try {
        // Перевіряємо, чи є кешовані дані
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            cacheHits++;

            // Додаємо кешовані дані до загальної статистики
            for (const item of cachedStats) {
              if (item && item.sku) {
                if (productStats[item.sku]) {
                  productStats[item.sku].orderedQuantity += item.orderedQuantity || 0;
                } else {
                  productStats[item.sku] = {
                    name: item.name || item.sku,
                    sku: item.sku,
                    orderedQuantity: item.orderedQuantity || 0,
                    stockBalances: {} // Ініціалізуємо порожнім, наповнимо пізніше актуальними даними
                  };
                }
              }
            }
          } else {
            // Кеш пошкоджено - пропускаємо це замовлення
            console.warn(`Invalid cached data format for order ${order.externalId}, skipping...`);
            cacheMisses++;
          }
        } else {
          // Кеша немає - пропускаємо це замовлення
          console.log(`No cached data for order ${order.externalId}, skipping...`);
          cacheMisses++;
        }
      } catch (error) {
        // Помилка при обробці кешу - пропускаємо це замовлення
        console.warn(`Error processing cached data for order ${order.externalId}, skipping:`, error);
        cacheMisses++;
      }
    }

    console.log(`✅ Cache processing completed: ${cacheHits} hits, ${cacheMisses} misses`);

    // --- Оновлюємо залишки АКТУАЛЬНИМИ даними з бази даних ---
    const allSkus = Object.keys(productStats);
    console.log(`🔄 Fetching actual stock balances for ${allSkus.length} products...`);
    
    for (const sku of allSkus) {
      try {
        const product = await orderDatabaseService.getProductBySku(sku);
        if (product && product.stockBalanceByStock) {
          const balances: { [warehouse: string]: number } = {};
          for (const [warehouseId, balance] of Object.entries(product.stockBalanceByStock)) {
            balances[warehouseId] = balance as number;
          }
          productStats[sku].stockBalances = balances;
        }
      } catch (error) {
        console.warn(`Failed to get actual stock balance for product ${sku}:`, error);
      }
    }
    console.log(`✅ Actual stock balances updated from database`);

    // Конвертуємо в масив для відповіді
    const productStatsArray = Object.values(productStats);

    console.log('✅ FINAL RESULT:', {
      totalProducts: productStatsArray.length,
      totalOrders: filteredOrders.length,
      filters: {
        status: status || 'all',
        dateRange: startDate && endDate ? { startDate, endDate } : null,
        dayStartHour: effectiveDayStartHour
      }
    });

    const response = {
      success: true,
      data: productStatsArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          shippedOnly: shippedOnly === 'true',
          dateRange: startDate && endDate ? { startDate, endDate } : null,
          dayStartHour: effectiveDayStartHour
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
 * GET /api/orders/products/orders
 * Отримати список замовлень, що містять конкретний товар
 */
router.get('/products/orders', authenticateToken, async (req, res) => {
  try {
    const { sku, status, startDate, endDate, shippedOnly } = req.query;

    if (!sku) {
      return res.status(400).json({ success: false, error: 'SKU is required' });
    }

    const dayStartHour = await getReportingDayStartHour();
    const effectiveDayStartHour = shippedOnly === 'true' ? 24 : dayStartHour;

    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    let dateRangeFilter = undefined;
    let shippedDateRangeFilter = undefined;

    if (startDate && endDate) {
      const { start } = getReportingDateRange(startDate as string, effectiveDayStartHour);
      const { end } = getReportingDateRange(endDate as string, effectiveDayStartHour);

      if (shippedOnly === 'true') {
        shippedDateRangeFilter = { start, end };
      } else {
        dateRangeFilter = { start, end };
      }
    }

    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 1000,
      sortBy: shippedOnly === 'true' ? 'dilovodSaleExportDate' : 'orderDate',
      sortOrder: 'asc',
      dateRange: dateRangeFilter,
      shippedOnly: shippedOnly === 'true',
      shippedDateRange: shippedDateRangeFilter,
      includeItems: true
    });

    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = orders.map(order => order.externalId);
    
    // Отримуємо всі кеші одним запитом (з розгорнутими комплектами)
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Фільтруємо замовлення, що містять SKU (використовуємо розгорнуті дані з кешу)
    const filteredOrders = orders.filter(order => {
      // Спочатку намагаємося використати кеш з розгорнутими комплектами
      const cacheData = orderCaches.get(order.externalId);
      if (cacheData && cacheData.processedItems) {
        try {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            const item = cachedStats.find((i: any) => i.sku === sku);
            if (item) {
              (order as any).productQuantity = item.orderedQuantity || 0;
              return true;
            }
          }
        } catch (e) {
          console.warn(`Error parsing cached data for order ${order.externalId}:`, e);
        }
      }
      
      // Якщо кешу немає, використовуємо стандартні items (без розгортання комплектів)
      let items = [];
      if (typeof order.items === 'string') {
        try { items = JSON.parse(order.items); } catch (e) { return false; }
      } else if (Array.isArray(order.items)) {
        items = order.items;
      }
      
      const item = items.find((i: any) => i.sku === sku);
      if (item) {
        (order as any).productQuantity = item.orderedQuantity || item.quantity || 0;
        return true;
      }
      return false;
    });

    res.json({
      success: true,
      data: filteredOrders,
      metadata: {
        totalOrders: filteredOrders.length,
        sku
      }
    });
  } catch (error) {
    console.error('Error getting product orders:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/orders/products/stats/dates
 * Отримати статистику по конкретному товару з розбивкою по датах
 */
router.get('/products/stats/dates', authenticateToken, async (req, res) => {
  try {
    const { sku, status, startDate, endDate, sync, shippedOnly } = req.query;

    // Отримуємо час початку звітного дня
    const dayStartHour = await getReportingDayStartHour();
    // Для відвантажень використовуємо 00:00 (24-годинний цикл без зміщення), 
    // щоб 19.12 00:00 - 23:59 потрапляло в 19.12
    const effectiveDayStartHour = shippedOnly === 'true' ? 24 : dayStartHour;

    // Парсим статуси: якщо рядок містить кому, розбиваємо на масив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!sku) {
      return res.status(400).json({
        success: false,
        error: 'SKU товару обов\'язковий для отримання статистики по датах'
      });
    }

    // Якщо запрошено синхронізацію, спочатку синхронізуємо
    if (sync === 'true') {
      console.log('🔄 Запитано синхронізацію для статистики по датах товару, починаємо синхронізацію...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Синхронізація завершена з помилками:', syncResult.errors);
      }
    }

    // Фільтруємо по даті, якщо вказані дати (з урахуванням dayStartHour)
    let dateRangeFilter = undefined;
    let shippedDateRangeFilter = undefined;

    if (startDate && endDate) {
      const { start } = getReportingDateRange(startDate as string, effectiveDayStartHour);
      const { end } = getReportingDateRange(endDate as string, effectiveDayStartHour);

      if (shippedOnly === 'true') {
        shippedDateRangeFilter = { start, end };
      } else {
        dateRangeFilter = { start, end };
      }
    }

    // Отримуємо замовлення з фільтрами включно з датою
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: shippedOnly === 'true' ? 'dilovodSaleExportDate' : 'orderDate',
      sortOrder: 'asc', // Для коректної послідовності дат
      dateRange: dateRangeFilter,
      shippedOnly: shippedOnly === 'true',
      shippedDateRange: shippedDateRangeFilter
    });

    const filteredOrders = orders; // Вже відфільтровані в БД

    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Збираємо статистику по датах для конкретного товару (використовуючи звітні дати)
    const dateStats: { [date: string]: { date: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};

    for (const order of filteredOrders) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            // Шукаємо товар з вказаним SKU
            const productItem = cachedStats.find(item => item && item.sku === sku);
            if (productItem) {
              // Використовуємо звітну дату замість простої дати
              // Якщо shippedOnly=true, використовуємо dilovodSaleExportDate для визначення звітної дати
              const dateToUse = (shippedOnly === 'true' && order.dilovodSaleExportDate)
                ? new Date(order.dilovodSaleExportDate)
                : order.orderDate;

              const reportingDate = getReportingDate(dateToUse, effectiveDayStartHour);

              if (dateStats[reportingDate]) {
                dateStats[reportingDate].orderedQuantity += productItem.orderedQuantity || 0;
              } else {
                dateStats[reportingDate] = {
                  date: reportingDate,
                  orderedQuantity: productItem.orderedQuantity || 0,
                  stockBalances: {} // Буде наповнено актуальними даними нижче
                };
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Помилка обробки кешованих даних для замовлення ${order.externalId}:`, error);
      }
    }

    // --- Оновлюємо залишки АКТУАЛЬНИМИ даними з бази даних ---
    try {
      const actualProduct = await orderDatabaseService.getProductBySku(sku as string);
      if (actualProduct && actualProduct.stockBalanceByStock) {
        const balances: { [warehouse: string]: number } = {};
        for (const [warehouseId, balance] of Object.entries(actualProduct.stockBalanceByStock)) {
          balances[warehouseId] = balance as number;
        }

        // Оновлюємо кожну дату актуальними залишками
        for (const dateKey of Object.keys(dateStats)) {
          dateStats[dateKey].stockBalances = balances;
        }
      }
    } catch (error) {
      console.warn(`Failed to get actual stock balance for product ${sku}:`, error);
    }

    // Конвертуємо в масив і сортуємо за датою
    const dateStatsArray = Object.values(dateStats).sort((a, b) => a.date.localeCompare(b.date));

    // Отримуємо інформацію про товар з останнього замовлення
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
        // Продовжуємо пошук
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
        dayStartHour: effectiveDayStartHour
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
          shippedOnly: shippedOnly === 'true',
          dateRange: startDate && endDate ? { startDate, endDate } : null,
          dayStartHour: effectiveDayStartHour
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
 * Отримати дані для графіка продажів за товарами з розбивкою за датами
 */
router.get('/products/chart', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync, groupBy = 'day', products } = req.query;

    // Отримуємо час початку звітного дня
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

    // Парсимо статуси: якщо рядок містить кому, розбиваємо на масив
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

    // Якщо запрошена синхронізація, спочатку синхронізуємо
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

    // Отримуємо замовлення з фільтрами, включаючи дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: 'orderDate',
      sortOrder: 'asc',
      dateRange: {
        start: start,
        end: end
      }
    });

    const filteredOrders = orders; // Вже відфільтровані в БД


    // Визначення груп товарів для API
    const productGroupOptions = [
      { key: "first_courses", label: "Перші страви" },
      { key: "main_courses", label: "Другі страви" },
    ];

    // Функція визначення групи товару
    const getProductGroup = (productName: string): string => {
      const name = productName.toLowerCase();
      if (name.includes('борщ') || name.includes('суп') || name.includes('бульйон') || name.includes('перший') || name.includes('перша')) {
        return 'first_courses';
      }
      // За замовчуванням всі інші товари вважаємо другими стравами
      return 'main_courses';
    };

    // Обробляємо фільтр за товарами
    let filterProducts: string[] = [];
    let filterGroups: string[] = [];

    if (products) {
      if (Array.isArray(products)) {
        filterProducts = products as string[];
      } else {
        filterProducts = [products as string];
      }

      // Розділяємо на групи та індивідуальні товари
      const individualProducts = filterProducts.filter(p => !p.startsWith('group_'));
      const groupFilters = filterProducts.filter(p => p.startsWith('group_'));

      filterProducts = individualProducts;
      filterGroups = groupFilters.map(g => g.replace('group_', ''));


    }

    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Збираємо дані по товарам з розбивкою по датах (використовуючи звітні дати)
    const chartData: { [dateKey: string]: { [sku: string]: { name: string; quantity: number } } } = {};
    const productInfo: { [sku: string]: string } = {};

    for (const order of filteredOrders) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            // Отримуємо звітну дату для цього замовлення
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

            // Обробляємо товари в замовленні
            for (const item of cachedStats) {
              if (item && item.sku && item.orderedQuantity > 0) {
                // Перевіряємо фільтр за товарами та групами
                let shouldInclude = false;

                if (filterProducts.length === 0 && filterGroups.length === 0) {
                  // Немає фільтрів - включаємо всі товари
                  shouldInclude = true;
                } else {
                  // Перевіряємо індивідуальні товари
                  if (filterProducts.includes(item.sku)) {
                    shouldInclude = true;
                  }

                  // Перевіряємо групи товарів
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

    // Конвертуємо в масив для відповіді
    const chartDataArray = Object.entries(chartData)
      .map(([dateKey, products]) => {
        // Форматуємо дату для відображення в залежності від groupBy
        let formattedDate = dateKey;
        let displayDate = dateKey;

        if (groupBy === 'hour') {
          // Для годин: "29.08 21:00"
          const date = new Date(dateKey + ':00:00');
          formattedDate = date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          displayDate = formattedDate;
        } else if (groupBy === 'day') {
          // Для днів: "29.08"
          const date = new Date(dateKey);
          formattedDate = date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit'
          });
          displayDate = formattedDate;
        } else if (groupBy === 'week') {
          // Для тижнів: "26.08 - 01.09"
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
          // Для місяців: "серпень 2025"
          const date = new Date(dateKey + '-01');
          formattedDate = date.toLocaleDateString('uk-UA', {
            month: 'long',
            year: 'numeric'
          });
          displayDate = formattedDate;
        }

        return {
          date: displayDate,
          rawDate: dateKey, // Зберігаємо сирі дату для сортування
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

    // Створюємо агреговані лінії для груп або загальну лінію
    const totalDataArray = chartDataArray.map(point => {
      const result = { ...point };

      // Якщо вибрані групи товарів - створюємо окремі лінії для кожної групи
      if (filterGroups.length > 0) {
        filterGroups.forEach((groupKey, index) => {
          // Знаходимо товари цієї групи
          const groupProducts = Object.keys(point).filter(key => {
            if (!key.startsWith('product_') || key.endsWith('_name')) return false;

            const productName = point[`${key}_name`];
            const productGroup = getProductGroup(productName);
            return productGroup === groupKey;
          });

          // Підсумовуємо продажі товарів цієї групи
          const groupTotal = groupProducts.reduce((sum, key) => sum + (point[key] || 0), 0);

          if (groupTotal > 0) {
            const groupLabel = productGroupOptions.find(opt => opt.key === groupKey)?.label || groupKey;
            result[`group_${groupKey}`] = groupTotal;
            result[`group_${groupKey}_name`] = groupLabel;
          }
        });
      }

      // Якщо вибрані індивідуальні товари - залишаємо тільки їх
      if (filterProducts.length > 0) {
        // Видаляємо всі товари, крім вибраних індивідуальних
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

      // Якщо нічого не вибрано - створюємо загальну лінію всіх товарів
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

    // Підраховуємо реальну кількість ліній у даних (товари + групи)
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
        totalProducts: actualProductCount, // Реальна кількість товарів у даних
        totalProductsInfo: Object.keys(productInfo).length, // Загальна кількість товарів у словнику
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

    if (startDate === endDate) {
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
    const salesData: {
      [dateKey: string]: {
        ordersCount: number;
        portionsCount: number;
        totalPrice: number;
        ordersByStatus: { [status: string]: number };
        portionsByStatus: { [status: string]: number };
        ordersBySource: { [source: string]: number };
        portionsBySource: { [source: string]: number };
        priceBySource: { [source: string]: number };
        ordersWithDiscountReason: number;
        portionsWithDiscountReason: number;
        priceWithDiscountReason: number;
        discountReasonText: string;
        orders: Array<{
          orderNumber: string;
          portionsCount: number;
          orderDate: string;
          externalId: string;
          status: string;
          source: string;
          // Detailed per-order fields so client can rely on real values
          totalPrice?: number | undefined;
          hasDiscount?: boolean;
          discountReasonCode?: string | null;
        }>;
      }
    } = {};

    for (const order of filteredOrders) {
      try {
        // Используем звітну дату вместо просто локальной даты
        const reportingDate = getReportingDate(order.orderDate, dayStartHour);
        const dateKey = reportingDate; // YYYY-MM-DD в форматі звітної дати

        if (!salesData[dateKey]) {
          salesData[dateKey] = {
            ordersCount: 0,
            portionsCount: 0,
            totalPrice: 0,
            ordersByStatus: {},
            portionsByStatus: {},
            ordersBySource: {},
            portionsBySource: {},
            priceBySource: {},
            ordersWithDiscountReason: 0,
            portionsWithDiscountReason: 0,
            priceWithDiscountReason: 0,
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
          salesData[dateKey].totalPrice += Number(order.totalPrice) || 0;

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
            salesData[dateKey].priceBySource[sourceName] = 0;
          }
          salesData[dateKey].ordersBySource[sourceName] += 1;
          salesData[dateKey].portionsBySource[sourceName] += orderPortions;
          salesData[dateKey].priceBySource[sourceName] += Number(order.totalPrice) || 0;

          // Статистика по pricinaZnizki (причина знижки)
          if (order.pricinaZnizki && order.pricinaZnizki.trim() !== '') {
            salesData[dateKey].ordersWithDiscountReason += 1;
            salesData[dateKey].portionsWithDiscountReason += orderPortions;
            salesData[dateKey].priceWithDiscountReason += Number(order.totalPrice) || 0;

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
            source: getOrderSourceDetailed(order.sajt || ''),
            totalPrice: order.totalPrice != null ? Number(order.totalPrice) : undefined,
            hasDiscount: !!(order.pricinaZnizki && String(order.pricinaZnizki).trim() !== ''),
            discountReasonCode: order.pricinaZnizki ? String(order.pricinaZnizki) : null,
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
        totalPrice: data.totalPrice,
        ordersByStatus: data.ordersByStatus,
        portionsByStatus: data.portionsByStatus,
        ordersBySource: data.ordersBySource,
        portionsBySource: data.portionsBySource,
        priceBySource: data.priceBySource,
        ordersWithDiscountReason: data.ordersWithDiscountReason,
        portionsWithDiscountReason: data.portionsWithDiscountReason,
        priceWithDiscountReason: data.priceWithDiscountReason,
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

export default router;
