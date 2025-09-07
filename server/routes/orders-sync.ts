import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import { syncSettingsService } from '../services/syncSettingsService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';

const router = express.Router();
const prisma = new PrismaClient();

// Хелпер функция для сериализации логов с BigInt полями
const serializeSyncLog = (log: any) => ({
  ...log,
  duration: log.duration ? Number(log.duration) : null
});

// Хелпер функция для сериализации массива логов
const serializeSyncLogs = (logs: any[]) => logs.map(serializeSyncLog);

// Cache for sync previews (in-memory cache)
const syncPreviewCache = new Map<string, { data: any; timestamp: number; expiresAt: number }>();
const PREVIEW_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Предварительный анализ синхронизации
router.post('/sync/preview', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date is required'
      });
    }

    const cacheKey = `${startDate}_${endDate || 'now'}`;
    const now = Date.now();

    // Check cache first
    const cached = syncPreviewCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      console.log(`🔍 [SYNC PREVIEW] Using cached result for ${cacheKey}`);
      return res.json({
        success: true,
        preview: cached.data,
        cached: true
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const { orderDatabaseService } = await import('../services/orderDatabaseService.js');

    console.log(`🔍 [SYNC PREVIEW] Analyzing orders from ${startDate} to ${endDate || 'now'}...`);

    // Получаем заказы из SalesDrive
    const salesDriveResponse = await salesDriveService.fetchOrdersFromDateRangeParallel(startDate, endDate);

    if (!salesDriveResponse.success || !salesDriveResponse.data) {
      throw new Error(salesDriveResponse.error || 'Failed to fetch orders from SalesDrive');
    }

    const salesDriveOrders = salesDriveResponse.data;
    console.log(`📊 [SYNC PREVIEW] Found ${salesDriveOrders.length} orders in SalesDrive`);

    const preview = {
      totalFromSalesDrive: salesDriveOrders.length,
      newOrders: [],
      existingOrders: [],
      skippedOrders: [],
      stats: {
        new: 0,
        update: 0,
        skip: 0
      }
    };

    // Анализируем каждый заказ
    for (const order of salesDriveOrders) {
      try {
        const existingOrder = await orderDatabaseService.getOrderByExternalId(order.orderNumber);

        if (!existingOrder) {
          // Новый заказ
          preview.newOrders.push({
            orderNumber: order.orderNumber,
            customerName: order.customerName || 'N/A',
            totalPrice: order.totalPrice || 0,
            status: order.status || 'unknown',
            orderDate: order.orderDate,
            action: 'create',
            color: 'green'
          });
          preview.stats.new++;
        } else {
          // Проверяем изменения
          const changes = orderDatabaseService.detectOrderChanges(existingOrder, order);

          if (changes.length === 0) {
            // Без изменений
            preview.skippedOrders.push({
              orderNumber: order.orderNumber,
              customerName: order.customerName || 'N/A',
              totalPrice: order.totalPrice || 0,
              status: order.status || 'unknown',
              orderDate: order.orderDate,
              action: 'skip',
              color: 'blue',
              reason: 'No changes'
            });
            preview.stats.skip++;
          } else {
            // Есть изменения
            preview.existingOrders.push({
              orderNumber: order.orderNumber,
              customerName: order.customerName || 'N/A',
              totalPrice: order.totalPrice || 0,
              status: order.status || 'unknown',
              orderDate: order.orderDate,
              action: 'update',
              color: 'yellow',
              changes: changes
            });
            preview.stats.update++;
          }
        }
      } catch (error) {
        console.error(`❌ [SYNC PREVIEW] Error analyzing order ${order.orderNumber}:`, error);
        preview.skippedOrders.push({
          orderNumber: order.orderNumber,
          customerName: order.customerName || 'N/A',
          totalPrice: order.totalPrice || 0,
          status: order.status || 'unknown',
          orderDate: order.orderDate,
          action: 'error',
          color: 'red',
          reason: 'Analysis error'
        });
      }
    }

    console.log(`✅ [SYNC PREVIEW] Analysis completed:`);
    console.log(`   🆕 New orders: ${preview.stats.new}`);
    console.log(`   🔄 Updates: ${preview.stats.update}`);
    console.log(`   ⏭️ Skips: ${preview.stats.skip}`);

    // Cache the result
    syncPreviewCache.set(cacheKey, {
      data: preview,
      timestamp: now,
      expiresAt: now + PREVIEW_CACHE_TTL
    });

    // Clean up expired cache entries
    for (const [key, value] of syncPreviewCache.entries()) {
      if (value.expiresAt <= now) {
        syncPreviewCache.delete(key);
      }
    }

    console.log(`💾 [SYNC PREVIEW] Cached result for ${cacheKey} (${syncPreviewCache.size} items in cache)`);

    res.json({
      success: true,
      preview,
      cached: false
    });

  } catch (error) {
    console.error('❌ [SYNC PREVIEW] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze sync preview'
    });
  }
});

// Выборочная синхронизация выбранных заказов
router.post('/sync/selective', authenticateToken, async (req, res) => {
  try {
    const { selectedOrders, startDate, endDate } = req.body;

    if (!selectedOrders || !Array.isArray(selectedOrders) || selectedOrders.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected orders array is required and cannot be empty'
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const { orderDatabaseService } = await import('../services/orderDatabaseService.js');

    console.log(`🔄 [SELECTIVE SYNC] Starting selective sync for ${selectedOrders.length} orders...`);

    // Получаем заказы из SalesDrive для выбранных номеров
    const salesDriveResponse = await salesDriveService.fetchOrdersFromDateRangeParallel(startDate, endDate);

    if (!salesDriveResponse.success || !salesDriveResponse.data) {
      throw new Error(salesDriveResponse.error || 'Failed to fetch orders from SalesDrive');
    }

    const salesDriveOrders = salesDriveResponse.data;

    // Фильтруем только выбранные заказы
    const selectedSalesDriveOrders = salesDriveOrders.filter(order =>
      selectedOrders.includes(order.orderNumber)
    );

    console.log(`📊 [SELECTIVE SYNC] Found ${selectedSalesDriveOrders.length} selected orders in SalesDrive`);

    if (selectedSalesDriveOrders.length === 0) {
      return res.json({
        success: true,
        totalProcessed: 0,
        totalUpdated: 0,
        totalSkipped: 0,
        totalErrors: 0,
        message: 'No selected orders found in SalesDrive'
      });
    }

    // Готовим данные для пакетного обновления
    const ordersToUpdate = selectedSalesDriveOrders.map(order => ({
      orderNumber: order.orderNumber,
      status: order.status,
      statusText: order.statusText,
      items: order.items,
      rawData: order.rawData,
      ttn: order.ttn,
      quantity: order.quantity,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      totalPrice: order.totalPrice,
      orderDate: order.orderDate,
      shippingMethod: order.shippingMethod,
      paymentMethod: order.paymentMethod,
      cityName: order.cityName,
      provider: order.provider,
      pricinaZnizki: order.pricinaZnizki,
      sajt: order.sajt
    }));

    // Выполняем пакетное обновление
    const updateResult = await orderDatabaseService.updateOrdersBatchSmart(
      ordersToUpdate,
      { batchSize: 50, concurrency: 2 }
    );

    const totalCreated = (updateResult as any).totalCreated || 0;
    console.log(`✅ [SELECTIVE SYNC] Completed: ${totalCreated} created, ${updateResult.totalUpdated} updated, ${updateResult.totalSkipped} skipped, ${updateResult.totalErrors} errors`);

    res.json({
      success: true,
      totalProcessed: selectedSalesDriveOrders.length,
      totalCreated,
      totalUpdated: updateResult.totalUpdated,
      totalSkipped: updateResult.totalSkipped,
      totalErrors: updateResult.totalErrors,
      results: updateResult.results
    });

  } catch (error) {
    console.error('❌ [SELECTIVE SYNC] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run selective sync'
    });
  }
});

// Получить статистику синхронизаций
router.get('/sync/stats', authenticateToken, async (req, res) => {
  try {
    const { syncHistoryService } = await import('../services/syncHistoryService.js');

    const stats = await syncHistoryService.getSyncStatistics();

    // Получить последнюю синхронизацию
    const lastSync = stats.lastSync ? {
      id: stats.lastSync.id,
      syncType: stats.lastSync.syncType,
      status: stats.lastSync.status,
      totalOrders: stats.lastSync.totalOrders,
      newOrders: stats.lastSync.newOrders,
      updatedOrders: stats.lastSync.updatedOrders,
      skippedOrders: stats.lastSync.skippedOrders,
      errors: stats.lastSync.errors,
      duration: stats.lastSync.duration,
      createdAt: stats.lastSync.createdAt
    } : null;

    res.json({
      success: true,
      stats: {
        ...stats,
        lastSync
      }
    });
  } catch (error) {
    console.error('Error getting sync stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync statistics'
    });
  }
});

// Получить логи синхронизации
router.get('/sync/logs', authenticateToken, async (req, res) => {
  try {
    const { type, status, limit = 100, offset = 0 } = req.query;

    const where: any = {};

    if (type && type !== '') {
      where.type = type;
    }

    if (status && status !== '') {
      where.status = status;
    }

    const logs = await prisma.syncLogs.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    res.json({
      success: true,
      logs: serializeSyncLogs(logs)
    });
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sync logs'
    });
  }
});

// Создать лог синхронизации
router.post('/sync/logs', authenticateToken, async (req, res) => {
  try {
    const { type, status, message, details, recordsProcessed, errors } = req.body;

    const log = await prisma.syncLogs.create({
      data: {
        type,
        status,
        message,
        details,
        recordsProcessed,
        errors,
        startedAt: new Date()
      }
    });

    res.json({
      success: true,
      log: serializeSyncLog(log)
    });
  } catch (error) {
    console.error('Error creating sync log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sync log'
    });
  }
});

// Обновить лог синхронизации
router.put('/sync/logs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, message, finishedAt, duration, recordsProcessed, errors } = req.body;

    const updateData: any = {
      status,
      message,
      recordsProcessed,
      errors
    };

    if (finishedAt) updateData.finishedAt = new Date(finishedAt);
    if (duration) updateData.duration = BigInt(duration);

    const log = await prisma.syncLogs.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      log: serializeSyncLog(log)
    });
  } catch (error) {
    console.error('Error updating sync log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sync log'
    });
  }
});

// Получить настройки синхронизации
router.get('/sync/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await syncSettingsService.getSyncSettings();

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching sync settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sync settings'
    });
  }
});

// Сохранить настройки синхронизации
router.post('/sync/settings', authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    await syncSettingsService.saveSyncSettings(settings);

    res.json({
      success: true,
      message: 'Настройки синхронизации сохранены'
    });
  } catch (error) {
    console.error('Error saving sync settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save sync settings'
    });
  }
});

// Получить статистику кеша
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
        averageCacheTime: Math.round(averageCacheTime / 1000), // в секундах
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

// Очистить кеш
router.post('/cache/clear', authenticateToken, async (req, res) => {
  try {
    // Очищаем кеш в таблице orders_cache
    const result = await prisma.ordersCache.deleteMany({});

    res.json({
      success: true,
      message: `Кеш очищен: ${result.count} заказов обновлено`
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

// Глобальное состояние для отслеживания прогресса синхронизации
let activeSyncProgress: {
  logId: number;
  startTime: number;
  totalOrders?: number;
  processedOrders: number;
  currentBatch: number;
  totalBatches: number;
  stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error';
  message: string;
  errors: string[];
  lastAccessed?: number; // Время последнего доступа к прогрессу
  accessCount?: number; // Количество попыток доступа
} | null = null;

// Получить статус текущей синхронизации
router.get('/sync/progress', authenticateToken, async (req, res) => {
  try {
    if (!activeSyncProgress) {
      return res.json({
        success: true,
        active: false,
        message: 'Нет активной синхронизации'
      });
    }

    // Обновляем время последнего доступа и счетчик
    activeSyncProgress.lastAccessed = Date.now();
    activeSyncProgress.accessCount = (activeSyncProgress.accessCount || 0) + 1;

    const progress = {
      ...activeSyncProgress,
      elapsedTime: Date.now() - activeSyncProgress.startTime,
      progressPercent: activeSyncProgress.totalOrders && activeSyncProgress.totalOrders > 0
        ? Math.min(Math.round((activeSyncProgress.processedOrders / activeSyncProgress.totalOrders) * 100), 100)
        : activeSyncProgress.processedOrders > 0 ? 100 : 0
    };

    console.log(`📊 [SYNC PROGRESS] Progress requested: ${progress.stage} - ${progress.message} (${progress.progressPercent}%)`);

    res.json({
      success: true,
      active: true,
      progress
    });
  } catch (error) {
    console.error('Error getting sync progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync progress'
    });
  }
});

// Ручная синхронизация с массовой загрузкой и прогрессом
router.post('/sync/manual', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, batchSize = 100, maxConcurrent = 3 } = req.body;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'Дата начала обязательна'
      });
    }

    // Проверяем, нет ли уже активной синхронизации
    if (activeSyncProgress) {
      return res.status(409).json({
        success: false,
        error: 'Синхронизация уже выполняется'
      });
    }

    // Создаем лог о начале синхронизации
    const syncLog = await prisma.syncLogs.create({
      data: {
        type: 'orders',
        status: 'running',
        message: `Ручная синхронизация заказов с ${startDate}${endDate ? ` по ${endDate}` : ''}`,
        startedAt: new Date(),
        details: JSON.stringify({
          startDate,
          endDate,
          batchSize,
          maxConcurrent,
          operation: 'manual_mass_sync_progress'
        })
      }
    });

    // Инициализируем прогресс
    activeSyncProgress = {
      logId: syncLog.id,
      startTime: Date.now(),
      processedOrders: 0,
      currentBatch: 0,
      totalBatches: 1, // будет обновлено после получения общего количества
      stage: 'fetching',
      message: 'Начинаем получение данных из SalesDrive...',
      errors: [],
      lastAccessed: Date.now(),
      accessCount: 0
    };


    // Запускаем синхронизацию в фоне для избежания таймаутов
    setImmediate(async () => {
      try {
        const { salesDriveService } = await import('../services/salesDriveService.js');

        console.log(`🚀 [MANUAL SYNC] Starting mass sync from ${startDate} to ${endDate || 'current date'}`);

        // Обновляем прогресс
        activeSyncProgress!.stage = 'fetching';
        activeSyncProgress!.message = 'Получаем заказы из SalesDrive API...';

        // Функция для обновления прогресса
        const updateProgress = (stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error', message: string, processedOrders?: number, totalOrders?: number, currentBatch?: number, totalBatches?: number, errors?: string[]) => {
          if (activeSyncProgress) {
            activeSyncProgress.stage = stage;
            activeSyncProgress.message = message;
            if (processedOrders !== undefined) activeSyncProgress.processedOrders = processedOrders;
            if (totalOrders !== undefined) activeSyncProgress.totalOrders = totalOrders;
            if (currentBatch !== undefined) activeSyncProgress.currentBatch = currentBatch;
            if (totalBatches !== undefined) activeSyncProgress.totalBatches = totalBatches;
            if (errors !== undefined) activeSyncProgress.errors = errors;

            console.log(`🔄 [SYNC PROGRESS] Updated: ${stage} - ${message} (${processedOrders || 0}/${totalOrders || 0})`);
          }
        };

        // Инициализируем прогресс с общим количеством заказов
        activeSyncProgress!.totalOrders = 0; // будет обновлено после получения данных
        activeSyncProgress!.processedOrders = 0;
        activeSyncProgress!.currentBatch = 0;
        activeSyncProgress!.totalBatches = 1;
        activeSyncProgress!.stage = 'fetching';
        activeSyncProgress!.message = 'Начинаем получение данных из SalesDrive...';

        // Используем оптимизированную ручную синхронизацию с чанкингом
        const syncResult = await salesDriveService.syncOrdersWithDatabaseManual(startDate, endDate, {
          chunkSize: Math.min((req.body.chunkSize || 1000), 2000), // Размер чанка
          maxMemoryMB: 200, // Максимум 200MB памяти
          enableProgress: true,
          onProgress: updateProgress
        });

        // Обновляем прогресс
        activeSyncProgress!.stage = 'completed';
        activeSyncProgress!.processedOrders = syncResult.synced + syncResult.errors;
        activeSyncProgress!.message = 'Синхронизация завершена';

        // Обновляем лог как завершенный
        const duration = Date.now() - syncLog.startedAt.getTime();
        await prisma.syncLogs.update({
          where: { id: syncLog.id },
          data: {
            status: syncResult.success ? 'success' : (syncResult.errors > 0 ? 'partial' : 'error'),
            message: syncResult.success
              ? `Синхронизация завершена: ${syncResult.synced} заказов обработано`
              : `Синхронизация завершена с ошибками: ${syncResult.errors} ошибок`,
            finishedAt: new Date(),
            duration: BigInt(duration),
            recordsProcessed: syncResult.synced + syncResult.errors,
            details: JSON.stringify({
              ...syncResult.metadata,
              duration,
              success: syncResult.success,
              synced: syncResult.synced,
              errors: syncResult.errors
            }),
            errors: syncResult.errors > 0 ? JSON.stringify([`${syncResult.errors} заказов не удалось обработать`]) : null
          }
        });

        console.log(`✅ [MANUAL SYNC] Completed: ${syncResult.synced} synced, ${syncResult.errors} errors`);

        // Очищаем прогресс через 30 минут (увеличено время жизни)
        setTimeout(() => {
          console.log(`🧹 [SYNC PROGRESS] Cleaning up progress for log ${syncLog.id}`);
          activeSyncProgress = null;
        }, 30 * 60 * 1000);

      } catch (error) {
        console.error('❌ [MANUAL SYNC] Critical error:', error);

        // Обновляем прогресс
        activeSyncProgress!.stage = 'error';
        activeSyncProgress!.message = 'Критическая ошибка синхронизации';
        activeSyncProgress!.errors.push(error instanceof Error ? error.message : 'Unknown critical error');

        // Обновляем лог с ошибкой
        await prisma.syncLogs.update({
          where: { id: syncLog.id },
          data: {
            status: 'error',
            message: 'Критическая ошибка синхронизации',
            finishedAt: new Date(),
            duration: BigInt(Date.now() - syncLog.startedAt.getTime()),
            errors: JSON.stringify([error instanceof Error ? error.message : 'Unknown critical error'])
          }
        });

        // Очищаем прогресс через 10 минут при ошибке
        setTimeout(() => {
          console.log(`🧹 [SYNC PROGRESS] Cleaning up progress after error for log ${syncLog.id}`);
          activeSyncProgress = null;
        }, 10 * 60 * 1000);
      }
    });

    res.json({
      success: true,
      message: 'Ручная синхронизация запущена в фоне',
      logId: syncLog.id,
      log: serializeSyncLog(syncLog),
      progressAvailable: true
    });
  } catch (error) {
    console.error('Error starting manual sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start manual sync'
    });
  }
});

// Тест массовой синхронизации
router.post('/sync/test-batch', authenticateToken, async (req, res) => {
  try {
    const { orderDatabaseService } = await import('../services/orderDatabaseService.js');
    const { testOrdersCount = 10 } = req.body;

    console.log(`🧪 [TEST] Testing batch sync with ${testOrdersCount} test orders...`);

    // Создаем тестовые данные
    const testOrders = [];
    for (let i = 1; i <= testOrdersCount; i++) {
      testOrders.push({
        orderNumber: `TEST-${i.toString().padStart(3, '0')}`,
        status: '2', // Подтвержден
        statusText: 'Підтверджено',
        items: [{
          productName: `Test Product ${i}`,
          quantity: Math.floor(Math.random() * 5) + 1,
          price: Math.floor(Math.random() * 100) + 50,
          sku: `SKU-${i}`
        }],
        rawData: {
          orderNumber: `TEST-${i.toString().padStart(3, '0')}`,
          trackingNumber: `TTN-${i}`,
          quantity: Math.floor(Math.random() * 5) + 1,
          status: '2',
          statusText: 'Підтверджено'
        },
        ttn: `TTN-${i}`,
        quantity: Math.floor(Math.random() * 5) + 1,
        customerName: `Test Customer ${i}`,
        customerPhone: '+380501234567',
        deliveryAddress: `Test Address ${i}`,
        totalPrice: Math.floor(Math.random() * 500) + 100,
        orderDate: new Date().toISOString().split('T')[0],
        shippingMethod: 'Нова Пошта',
        paymentMethod: 'Післяплата',
        cityName: 'Київ'
      });
    }

    const startTime = Date.now();

    // Тестируем batch создание
    console.log(`📝 [TEST] Testing batch creation of ${testOrders.length} orders...`);
    const createResult = await orderDatabaseService.forceUpdateOrdersBatch(testOrders);
    const createDuration = Date.now() - startTime;

    console.log(`✅ [TEST] Batch creation completed in ${createDuration}ms:`);
    console.log(`   🆕 Created: ${createResult.totalCreated} orders`);
    console.log(`   🔄 Updated: ${createResult.totalUpdated} orders`);
    console.log(`   ❌ Errors: ${createResult.totalErrors} orders`);

    // Очищаем тестовые данные
    console.log(`🧹 [TEST] Cleaning up test data...`);
    for (const order of testOrders) {
      try {
        await prisma.order.deleteMany({
          where: { externalId: order.orderNumber }
        });
      } catch (e) {
        // Игнорируем ошибки очистки
      }
    }

    res.json({
      success: true,
      message: 'Тест массовой синхронизации завершен',
      results: {
        totalTestOrders: testOrdersCount,
        created: createResult.totalCreated,
        updated: createResult.totalUpdated,
        errors: createResult.totalErrors,
        duration: createDuration,
        ordersPerSecond: Math.round((testOrdersCount / createDuration) * 1000)
      }
    });

  } catch (error) {
    console.error('❌ [TEST] Error during batch test:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка тестирования массовой синхронизации'
    });
  }
});


// Удалить старые логи синхронизации
router.post('/sync/logs/cleanup', authenticateToken, async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.syncLogs.deleteMany({
      where: {
        startedAt: {
          lt: cutoffDate
        }
      }
    });

    res.json({
      success: true,
      message: `Удалено ${result.count} старых логов синхронизации`
    });
  } catch (error) {
    console.error('Error cleaning up sync logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup sync logs'
    });
  }
});






export default router;
