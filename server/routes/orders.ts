import { Router } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { syncHistoryService } from '../services/syncHistoryService.js';
import { authenticateToken } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const router = Router();

// Add this simple test endpoint to server/routes/orders.ts

/**
 * GET /api/orders/test
 * Simple test to check SalesDrive API configuration
 */
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Testing SalesDrive configuration...');
    
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
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const { status, sync, sortBy, sortOrder, limit } = req.query;

  console.log('🚀 [SERVER] GET /api/orders: Request received');
  console.log('📋 [SERVER] GET /api/orders: Query params:', {
    status,
    sync,
    sortBy: sortBy || 'createdAt',
    sortOrder: sortOrder || 'desc',
    limit: parseInt(limit as string) || 1000
  });

  try {
    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 [SERVER] GET /api/orders: Sync requested, starting synchronization...');
      const syncStartTime = Date.now();

      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      const syncDuration = Date.now() - syncStartTime;
      console.log(`✅ [SERVER] GET /api/orders: Sync completed in ${syncDuration}ms:`, {
        success: syncResult.success,
        synced: syncResult.synced,
        errors: syncResult.errors
      });

      if (!syncResult.success) {
        console.warn('⚠️ [SERVER] GET /api/orders: Sync completed with errors:', syncResult.errors);
      }
    } else {
      console.log('⏭️ [SERVER] GET /api/orders: No sync requested, proceeding with local data');
    }

    // Получаем заказы из локальной БД с сортировкой
    console.log('📦 [SERVER] GET /api/orders: Fetching orders from database...');
    const dbStartTime = Date.now();

    const orders = await orderDatabaseService.getOrders({
      status: status as string,
      limit: parseInt(limit as string) || 100,
      offset: parseInt(req.query.offset as string) || 0,
      sortBy: (sortBy as 'orderDate' | 'createdAt' | 'lastSynced' | 'orderNumber') || 'createdAt',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc'
    });

    // Получаем общее количество заказов для пагинации
    const totalCount = await orderDatabaseService.getOrdersCount({
      status: status as string
    });

    // Получаем счетчики по статусам для табов
    const statusCounts = await orderDatabaseService.getStatusCounts();

    const dbDuration = Date.now() - dbStartTime;
    console.log(`✅ [SERVER] GET /api/orders: Database fetch completed in ${dbDuration}ms, orders count: ${orders.length}`);

    const totalDuration = Date.now() - startTime;
    console.log(`🏁 [SERVER] GET /api/orders: Total processing time: ${totalDuration}ms`);

    const response = {
      success: true,
      data: orders,
      metadata: {
        source: 'local_database',
        totalOrders: totalCount,
        ordersOnPage: orders.length,
        fetchedAt: new Date().toISOString(),
        lastSynced: orders.length > 0 ? orders[0].lastSynced : null,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc',
        limit: parseInt(limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0,
        processingTimeMs: totalDuration,
        dbFetchTimeMs: dbDuration,
        statusCounts: statusCounts
      }
    };

    console.log('📤 [SERVER] GET /api/orders: Sending response with', orders.length, 'orders');
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

/**
 * POST /api/orders/sync
 * Синхронизировать заказы из SalesDrive с локальной БД
 */
router.post('/sync', async (req, res) => {
  try {
    // Проверяем, включена ли синхронизация заказов
    const { syncSettingsService } = await import('../services/syncSettingsService.js');
    const isEnabled = await syncSettingsService.isSyncEnabled('orders');

    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Синхронизация заказов отключена в настройках'
      });
    }

    const result = await salesDriveService.syncOrdersWithDatabase();

    res.json({
      success: result.success,
      message: `Синхронизовано: ${result.synced}, Ошибок: ${result.errors}`,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error syncing orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/sync/status
 * Получить статус последней синхронизации
 */
router.get('/sync/status', async (req, res) => {
  try {
    // Получаем статистику заказов (включая время последней синхронизации)
    const stats = await orderDatabaseService.getOrderStats();
    
    // Получаем информацию о последней синхронизации
    const lastSyncedOrder = await orderDatabaseService.getLastSyncedOrder();
    
    res.json({
      success: true,
      data: {
        lastSync: lastSyncedOrder?.lastSynced || null,
        totalOrders: stats.total,
        ordersByStatus: stats.byStatus,
        syncStatus: 'success'
      }
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/:externalId
 * Получить детали конкретного заказа по externalId (номеру заказа из SalesDrive)
 */
router.get('/:externalId', async (req, res) => {
  try {
    const { externalId } = req.params; // Изменили с id на externalId
    
    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: 'Order external ID is required'
      });
    }

    console.log(`🔍 Fetching order details for external ID: ${externalId}`);
    
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
 * PUT /api/orders/:externalId/status
 * Обновить статус заказа в SalesDrive
 */
router.put('/:externalId/status', async (req, res) => {
  try {
    const { externalId } = req.params; // Изменили с id на externalId
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    // Получаем заказ для получения orderNumber
    const order = await orderDatabaseService.getOrderByExternalId(externalId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Обновляем статус в SalesDrive
    const result = await salesDriveService.updateSalesDriveOrderStatus(order.orderNumber, status);

    if (result) {
      console.log(`✅ Successfully updated order ${order.orderNumber} status to ${status} in SalesDrive`);
      res.json({
        success: true,
        message: 'Order status updated successfully in SalesDrive',
        externalId: externalId,
        orderNumber: order.orderNumber,
        newStatus: status,
        salesDriveUpdated: true,
        updatedAt: new Date().toISOString()
      });
    } else {
      console.warn(`⚠️ Failed to update order ${order.orderNumber} status in SalesDrive`);
      res.status(500).json({
        success: false,
        error: 'Failed to update order status in SalesDrive',
        externalId: externalId,
        orderNumber: order.orderNumber,
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
 * GET /api/orders/stats/summary
 * Получить статистику по заказам из локальной БД
 */
router.get('/stats/summary', async (req, res) => {
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
router.get('/raw/all', async (req, res) => {
  try {
    const allOrders = await salesDriveService.fetchOrdersFromDate();
    
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
router.get('/debug/raw', async (req, res) => {
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
router.get('/period', async (req, res) => {
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
      console.log('🔄 Sync requested for period, starting synchronization...');
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
router.get('/products/stats/test', async (req, res) => {
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
router.post('/fix-items-data', async (req, res) => {
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
              await orderDatabaseService.updateOrder(order.id, {
                items: items
              });
              fixedCount++;
              console.log(`Fixed order ${order.externalId}`);
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
 * POST /api/orders/preprocess-all
 * Предварительно рассчитать статистику для всех заказов
 */
router.post('/preprocess-all', async (req, res) => {
  try {
    const { user } = req as any;

    // Проверяем права доступа (только ADMIN)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    console.log('🚀 Starting preprocessing for all orders...');

    const BATCH_SIZE = 50; // Обрабатываем по 50 заказов за раз
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalOrders = 0;

    // Сначала получаем общее количество заказов
    const allOrders = await orderDatabaseService.getOrders({ limit: 10000 });
    totalOrders = allOrders.length;
    console.log(`📊 Found ${totalOrders} orders to process`);

    // Обрабатываем заказы пачками
    for (let batchStart = 0; batchStart < totalOrders; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalOrders);
      const batchOrders = allOrders.slice(batchStart, batchEnd);

      console.log(`🔄 Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(totalOrders / BATCH_SIZE)}: orders ${batchStart + 1}-${batchEnd}`);

      // Обрабатываем заказы в текущей пачке
      const batchPromises = batchOrders.map(async (order) => {
        try {
          const success = await (orderDatabaseService as any).updateProcessedItems(order.id);
          return success ? 'success' : 'error';
        } catch (error) {
          console.error(`❌ Error processing order ${order.externalId}:`, error);
          return 'error';
        }
      });

      // Ждем завершения всех заказов в пачке
      const batchResults = await Promise.all(batchPromises);

      // Подсчитываем результаты пачки
      const batchProcessed = batchResults.filter(result => result === 'success').length;
      const batchErrors = batchResults.filter(result => result === 'error').length;

      totalProcessed += batchProcessed;
      totalErrors += batchErrors;

      console.log(`✅ Batch completed: ${batchProcessed} processed, ${batchErrors} errors (${totalProcessed}/${totalOrders} total)`);

      // Небольшая пауза между пачками для снижения нагрузки
      if (batchEnd < totalOrders) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`🎉 Preprocessing completed: ${totalProcessed} processed, ${totalErrors} errors`);

    res.json({
      success: true,
      message: `Preprocessed ${totalProcessed} orders in ${Math.ceil(totalOrders / BATCH_SIZE)} batches, ${totalErrors} errors`,
      stats: {
        totalOrders,
        processedCount: totalProcessed,
        errorCount: totalErrors,
        batchesProcessed: Math.ceil(totalOrders / BATCH_SIZE),
        batchSize: BATCH_SIZE
      }
    });
  } catch (error) {
    console.error('Error in preprocess-all:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/:externalId/cache
 * Заполнить кеш для конкретного заказа (временно без авторизации для тестирования)
 */
router.post('/:externalId/cache', async (req, res) => {
  try {
    const { externalId } = req.params;

    // Временно убираем проверку авторизации для тестирования
    console.log(`Processing cache for order ${externalId}...`);

    const success = await (orderDatabaseService as any).updateProcessedItems(externalId);

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
 * GET /api/orders/products/stats/demo
 * Демонстрация работы кешированной статистики с тестовыми данными
 */
router.get('/products/stats/demo', async (req, res) => {
  try {
    console.log('🚀 Demo endpoint: Simulating cached product statistics...');

    // Имитируем работу с кешированными данными
    const mockCachedStats = [
      {
        name: "Борщ з телятиною",
        sku: "01001",
        orderedQuantity: 15,
        stockBalances: { "1": 50, "3": 30, "4": 20 }
      },
      {
        name: "Плов зі свининою",
        sku: "03002",
        orderedQuantity: 25,
        stockBalances: { "1": 40, "3": 25 }
      },
      {
        name: "Каша гречана зі свининою",
        sku: "03003",
        orderedQuantity: 18,
        stockBalances: { "1": 35, "3": 22, "4": 15 }
      },
      {
        name: "Печеня зі свининою",
        sku: "03001",
        orderedQuantity: 12,
        stockBalances: { "1": 28, "3": 18 }
      }
    ];

    console.log(`✅ Demo: Processed ${mockCachedStats.length} products from cache`);

    res.json({
      success: true,
      data: mockCachedStats,
      metadata: {
        source: 'cached_data_demo',
        filters: {
          status: 'all',
          dateRange: null
        },
        totalProducts: mockCachedStats.length,
        totalOrders: 5,
        fetchedAt: new Date().toISOString(),
        note: 'Demo data showing how cached statistics work - much faster than real-time calculation!'
      }
    });
  } catch (error) {
    console.error('Error in demo endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/sync/manual
 * Ручная синхронизация заказов с указанным диапазоном дат
 */
router.post('/sync/manual', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate is required'
      });
    }

    console.log(`🔄 [MANUAL SYNC] Starting manual sync from: ${startDate} to: ${endDate || 'current date'}`);

    // Синхронизируем заказы в указанном диапазоне дат
    const syncResult = await salesDriveService.syncOrdersWithDatabaseManual(startDate, endDate);

    console.log(`✅ [MANUAL SYNC] Completed: ${syncResult.synced} synced, ${syncResult.errors} errors`);

    res.json({
      success: true,
      message: `Ручна синхронізація завершена: ${syncResult.synced} синхронізовано, ${syncResult.errors} помилок`,
      data: syncResult
    });

  } catch (error) {
    console.error('❌ Manual sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка ручної синхронізації'
    });
  }
});

/**
 * GET /api/orders/sync/history
 * Получить историю синхронизаций
 */
router.get('/sync/history', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const syncType = req.query.type as string;

    console.log(`📋 [SYNC HISTORY] Getting sync history (limit: ${limit}, type: ${syncType || 'all'})`);

    let history;
    if (syncType && ['manual', 'automatic', 'background'].includes(syncType)) {
      history = await syncHistoryService.getSyncHistoryByType(syncType as 'manual' | 'automatic' | 'background', limit);
    } else {
      history = await syncHistoryService.getSyncHistory(limit);
    }

    // Получаем статистику
    const stats = await syncHistoryService.getSyncStatistics();

    res.json({
      success: true,
      data: {
        history: history,
        statistics: stats
      }
    });

  } catch (error) {
    console.error('❌ Error getting sync history:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка отримання історії синхронізацій'
    });
  }
});

/**
 * GET /api/orders/sync/history/:id
 * Получить детальную информацию о конкретной синхронизации
 */
router.get('/sync/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📋 [SYNC HISTORY] Getting sync details for ID: ${id}`);

    // Находим запись в истории по ID
    const historyRecord = await prisma.syncHistory.findUnique({
      where: { id: id }
    });

    if (!historyRecord) {
      return res.status(404).json({
        success: false,
        error: 'Запис синхронізації не знайдено'
      });
    }

    res.json({
      success: true,
      data: historyRecord
    });

  } catch (error) {
    console.error('❌ Error getting sync details:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка отримання деталей синхронізації'
    });
  }
});

/**
 * GET /api/orders/products/stats
 * Получить статистику по товарам из заказов с фильтрами
 */
router.get('/products/stats', async (req, res) => {
  try {
    const { status, startDate, endDate, sync } = req.query;
    // console.log('🔍 SERVER RECEIVED:', { status, startDate, endDate, sync });

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 Sync requested for products stats, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Получаем заказы с фильтрами
    const orders = await orderDatabaseService.getOrders({
      status: status as string,
      limit: 1000, // Обрабатываем до 1000 заказов для полной статистики
      sortBy: 'orderDate',
      sortOrder: 'desc'
    });

    // Фильтруем по дате если указаны даты
    let filteredOrders = orders;
    if (startDate && endDate) {
      const originalCount = orders.length;
      const start = new Date(startDate as string + ' 00:00:00');
      const end = new Date(endDate as string + ' 23:59:59');

      console.log(`📅 Filtering by date range: ${start.toISOString()} to ${end.toISOString()}`);

      filteredOrders = orders.filter(order => {
        if (!order.orderDate) return false;
        const orderDate = new Date(order.orderDate);
        const matches = orderDate >= start && orderDate <= end;

        if (filteredOrders.length < 10) { // Логируем только первые несколько заказов для отладки
          console.log(`📅 Order ${order.externalId}: ${orderDate.toISOString()} - ${matches ? '✅' : '❌'}`);
        }

        return matches;
      });
      console.log(`📅 Date filtering: ${originalCount} -> ${filteredOrders.length} orders`);
    }

    // Собираем статистику по товарам из кешированных данных
    const productStats: { [key: string]: { name: string; sku: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};

    console.log(`Processing ${filteredOrders.length} orders from cache...`);

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
        const processedItems = order.processedItems;
        if (processedItems && typeof processedItems === 'string') {
          const cachedStats = JSON.parse(processedItems);
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
        dateRange: startDate && endDate ? { startDate, endDate } : null
      }
    });

    res.json({
      success: true,
      data: productStatsArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: startDate && endDate ? { startDate, endDate } : null
        },
        totalProducts: productStatsArray.length,
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    });
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
router.get('/products/stats/dates', async (req, res) => {
  try {
    const { sku, status, startDate, endDate, sync } = req.query;

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

    // Получаем заказы с фильтрами
    const orders = await orderDatabaseService.getOrders({
      status: status as string,
      limit: 1000,
      sortBy: 'orderDate',
      sortOrder: 'asc' // Для корректной последовательности дат
    });

    // Фильтруем по дате если указаны даты
    let filteredOrders = orders;
    if (startDate && endDate) {
      const start = new Date(startDate as string + ' 00:00:00');
      const end = new Date(endDate as string + ' 23:59:59');

      filteredOrders = orders.filter(order => {
        if (!order.orderDate) return false;
        const orderDate = new Date(order.orderDate);
        return orderDate >= start && orderDate <= end;
      });
    }

    // Собираем статистику по датам для конкретного товара
    const dateStats: { [date: string]: { date: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};

    console.log(`Processing ${filteredOrders.length} orders for product ${sku}...`);

    for (const order of filteredOrders) {
      try {
        const processedItems = order.processedItems;
        if (processedItems && typeof processedItems === 'string') {
          const cachedStats = JSON.parse(processedItems);
          if (Array.isArray(cachedStats)) {
            // Ищем товар с указанным SKU
            const productItem = cachedStats.find(item => item && item.sku === sku);
            if (productItem) {
              // Форматируем дату в YYYY-MM-DD
              const orderDate = new Date(order.orderDate);
              const dateKey = orderDate.toISOString().split('T')[0];

              if (dateStats[dateKey]) {
                dateStats[dateKey].orderedQuantity += productItem.orderedQuantity || 0;
                // Обновляем остатки на складах (берем последние данные)
                dateStats[dateKey].stockBalances = productItem.stockBalances || {};
              } else {
                dateStats[dateKey] = {
                  date: dateKey,
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
        const processedItems = order.processedItems;
        if (processedItems && typeof processedItems === 'string') {
          const cachedStats = JSON.parse(processedItems);
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
        dateRange: startDate && endDate ? { startDate, endDate } : null
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
          dateRange: startDate && endDate ? { startDate, endDate } : null
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
 * GET /api/orders/cache/info
 * Получить информацию о состоянии кеша
 */
router.get('/cache/info', async (req, res) => {
  try {
    const cacheInfo = salesDriveService.getCacheInfo();

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
router.post('/cache/clear', async (req, res) => {
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
router.delete('/cache/:key', async (req, res) => {
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
 * GET /api/orders/sync-statistics
 * Получить статистику по загружаемым данным
 */
router.get('/sync-statistics', async (req, res) => {
  try {
    const { startDate, endDate, includeProductStats, includeOrderDetails } = req.query;

    const options: any = {};

    if (startDate) options.startDate = startDate as string;
    if (endDate) options.endDate = endDate as string;
    if (includeProductStats === 'true') options.includeProductStats = true;
    if (includeOrderDetails === 'true') options.includeOrderDetails = true;

    console.log('📊 Sync statistics request:', options);

    const result = await salesDriveService.getSyncStatistics(options);

    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in sync statistics endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/advanced-filter
 * Получить заказы с расширенными фильтрами
 */
router.get('/advanced-filter', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      statusIds,
      minAmount,
      maxAmount,
      paymentMethods,
      shippingMethods,
      cities,
      limit,
      offset,
      sync
    } = req.query;

    // Если запрошена синхронизация, сначала синхронизируем
    if (sync === 'true') {
      console.log('🔄 Sync requested for advanced filter, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Парсим параметры фильтров
    const filters: any = {};

    if (startDate) filters.startDate = startDate as string;
    if (endDate) filters.endDate = endDate as string;

    if (statusIds) {
      filters.statusIds = Array.isArray(statusIds) ? statusIds as string[] : [statusIds as string];
    }

    if (minAmount) filters.minAmount = parseFloat(minAmount as string);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);

    if (paymentMethods) {
      filters.paymentMethods = Array.isArray(paymentMethods) ? paymentMethods as string[] : [paymentMethods as string];
    }

    if (shippingMethods) {
      filters.shippingMethods = Array.isArray(shippingMethods) ? shippingMethods as string[] : [shippingMethods as string];
    }

    if (cities) {
      filters.cities = Array.isArray(cities) ? cities as string[] : [cities as string];
    }

    if (limit) filters.limit = parseInt(limit as string);
    if (offset) filters.offset = parseInt(offset as string);

    console.log('🔍 Advanced filter request:', filters);

    const result = await salesDriveService.fetchOrdersWithFilters(filters);

    res.json({
      success: result.success,
      data: result.data,
      metadata: result.metadata,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in advanced filter endpoint:', error);
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
router.get('/products/chart', async (req, res) => {
  try {
    const { status, startDate, endDate, sync, groupBy = 'day', products } = req.query;

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

    // Получаем заказы с фильтрами
    const orders = await orderDatabaseService.getOrders({
      status: status as string,
      limit: 1000,
      sortBy: 'orderDate',
      sortOrder: 'asc'
    });

    // Фильтруем по дате
    const start = new Date(startDate as string + ' 00:00:00');
    const end = new Date(endDate as string + ' 23:59:59');

    // console.log(`📅 Filtering chart data by date range: ${start.toISOString()} to ${end.toISOString()}`);

    const filteredOrders = orders.filter(order => {
      if (!order.orderDate) return false;
      const orderDate = new Date(order.orderDate);
      return orderDate >= start && orderDate <= end;
    });

    console.log(`📊 Processing ${filteredOrders.length} orders for chart`);

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

    // Собираем данные по товарам с разбивкой по датам
    const chartData: { [dateKey: string]: { [sku: string]: { name: string; quantity: number } } } = {};
    const productInfo: { [sku: string]: string } = {};

    for (const order of filteredOrders) {
      try {
        const processedItems = order.processedItems;
        if (processedItems && typeof processedItems === 'string') {
          const cachedStats = JSON.parse(processedItems);
          if (Array.isArray(cachedStats)) {
            // Группируем по выбранному периоду
            const orderDate = new Date(order.orderDate);
            let dateKey: string;

            // Конвертируем дату в Киевское время
            // Сначала получаем локальный offset, затем добавляем разницу до Киевского времени
            const localOffset = orderDate.getTimezoneOffset() * 60000; // в миллисекундах
            const kyivOffset = 3 * 60 * 60 * 1000; // UTC+3 для лета
            const kyivTime = new Date(orderDate.getTime() + localOffset + kyivOffset);

            switch (groupBy) {
              case 'hour':
                dateKey = kyivTime.toISOString().slice(0, 13); // YYYY-MM-DDTHH
                break;
              case 'day':
                dateKey = kyivTime.toISOString().slice(0, 10); // YYYY-MM-DD
                break;
              case 'week':
                const weekStart = new Date(kyivTime);
                weekStart.setDate(kyivTime.getDate() - kyivTime.getDay() + 1); // Понедельник
                dateKey = weekStart.toISOString().slice(0, 10);
                break;
              case 'month':
                dateKey = kyivTime.toISOString().slice(0, 7); // YYYY-MM
                break;
              default:
                dateKey = kyivTime.toISOString().slice(0, 10);
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

    res.json({
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
          groups: filterGroups
        },
        totalPoints: totalDataArray.length,
        totalProducts: actualProductCount, // Реальное количество товаров в данных
        totalProductsInfo: Object.keys(productInfo).length, // Общее количество товаров в словаре
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting products chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
