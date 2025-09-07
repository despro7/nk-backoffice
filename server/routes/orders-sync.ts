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

// Прогресс предварительного анализа (используем Map для хранения по sessionId)
const activePreviewProgressMap = new Map<string, {
  sessionId: string;
  startTime: number;
  processedOrders: number;
  totalOrders: number;
  stage: 'fetching' | 'analyzing' | 'completed' | 'error';
  message: string;
  errors: string[];
  lastAccessed: number;
  accessCount: number;
}>();

// Прогресс полной синхронизации (используем Map для хранения по sessionId)
const activeSyncProgressMap = new Map<string, {
  sessionId: string;
  logId?: number;
  startTime: number;
  processedOrders: number;
  totalOrders?: number;
  currentBatch: number;
  totalBatches: number;
  stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error';
  message: string;
  errors: string[];
  lastAccessed: number;
  accessCount: number;
}>();

// Cancellation flags for operations (используем Map для хранения по sessionId)
const cancelledOperations = new Map<string, boolean>();

// Результаты предварительного анализа
const previewResultsMap = new Map<string, {
  sessionId: string;
  preview: any;
  completedAt: number;
}>();

// Результаты полной синхронизации
const syncResultsMap = new Map<string, {
  sessionId: string;
  result: any;
  completedAt: number;
}>();

// Функция очистки устаревших прогрессов (старше 30 минут)
const cleanupOldProgress = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 минут

  // Очистка preview прогресса
  for (const [sessionId, progress] of activePreviewProgressMap.entries()) {
    if ((progress.stage === 'completed' || progress.stage === 'error') &&
        (now - progress.lastAccessed) > maxAge) {
      console.log(`🧹 [PREVIEW PROGRESS] Cleaning up old progress for session ${sessionId}`);
      activePreviewProgressMap.delete(sessionId);
    }
  }

  // Очистка sync прогресса
  for (const [sessionId, progress] of activeSyncProgressMap.entries()) {
    if ((progress.stage === 'completed' || progress.stage === 'error') &&
        (now - progress.lastAccessed) > maxAge) {
      console.log(`🧹 [SYNC PROGRESS] Cleaning up old progress for session ${sessionId}`);
      activeSyncProgressMap.delete(sessionId);
    }
  }

  // Очистка результатов preview
  for (const [sessionId, result] of previewResultsMap.entries()) {
    if ((now - result.completedAt) > maxAge) {
      console.log(`🧹 [PREVIEW RESULT] Cleaning up old result for session ${sessionId}`);
      previewResultsMap.delete(sessionId);
    }
  }

  // Очистка результатов синхронизации
  for (const [sessionId, result] of syncResultsMap.entries()) {
    if ((now - result.completedAt) > maxAge) {
      console.log(`🧹 [SYNC RESULT] Cleaning up old result for session ${sessionId}`);
      syncResultsMap.delete(sessionId);
    }
  }
};

// Запускаем очистку каждые 5 минут
setInterval(cleanupOldProgress, 5 * 60 * 1000);

// Предварительный анализ синхронизации
router.post('/sync/preview', authenticateToken, async (req, res) => {
  console.log('🚀 [PREVIEW REQUEST] Received preview request:', req.body);

  const { startDate, endDate } = req.body;
  const sessionId = `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log('🔑 [PREVIEW REQUEST] Generated sessionId:', sessionId);

  try {
    if (!startDate) {
      console.log('❌ [PREVIEW REQUEST] No startDate provided');
      return res.status(400).json({
        success: false,
        error: 'Start date is required'
      });
    }

    console.log('✅ [PREVIEW REQUEST] Starting preview analysis for:', { startDate, endDate });

    const cacheKey = `${startDate}_${endDate || 'now'}`;
    const now = Date.now();

    // Check cache first
    const cached = syncPreviewCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      console.log(`🔍 [SYNC PREVIEW] Using cached result for ${cacheKey}`);
      return res.json({
        success: true,
        preview: cached.data,
        cached: true,
        sessionId
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const { orderDatabaseService } = await import('../services/orderDatabaseService.js');

    console.log(`🔍 [SYNC PREVIEW] Analyzing orders from ${startDate} to ${endDate || 'now'}...`);

    // Инициализируем прогресс
    activePreviewProgressMap.set(sessionId, {
      sessionId,
      startTime: now,
      processedOrders: 0,
      totalOrders: 0,
      stage: 'fetching',
      message: 'Получаем заказы из SalesDrive...',
      errors: [],
      lastAccessed: now,
      accessCount: 0
    });

    // Возвращаем ответ клиенту сразу, чтобы он начал мониторинг
    res.json({
      success: true,
      sessionId,
      message: 'Анализ запущен, следите за прогрессом'
    });

    // Запускаем анализ в фоне
    (async () => {
      try {
        console.log(`🔄 [ASYNC PREVIEW] Starting background analysis for sessionId: ${sessionId}`);

        // Check for cancellation before starting
        if (cancelledOperations.get(sessionId)) {
          console.log(`🛑 [ASYNC PREVIEW] Operation ${sessionId} was cancelled before starting`);
          const progress = activePreviewProgressMap.get(sessionId);
          if (progress) {
            progress.stage = 'error';
            progress.message = 'Операція була скасована користувачем';
            progress.errors.push('Operation cancelled by user');
          }
          return;
        }

        // Получаем заказы из SalesDrive
        const salesDriveResponse = await salesDriveService.fetchOrdersFromDateRangeParallel(startDate, endDate);

        if (!salesDriveResponse.success || !salesDriveResponse.data) {
          // Ошибка получения данных
          const progress = activePreviewProgressMap.get(sessionId);
          if (progress) {
            progress.stage = 'error';
            progress.message = 'Ошибка получения данных из SalesDrive';
            progress.errors.push(salesDriveResponse.error || 'Failed to fetch orders');
          }
          console.error(`❌ [ASYNC PREVIEW] Failed to fetch orders for sessionId: ${sessionId}`);
          return;
        }

        const salesDriveOrders = salesDriveResponse.data;
        console.log(`📊 [ASYNC PREVIEW] Found ${salesDriveOrders.length} orders in SalesDrive for sessionId: ${sessionId}`);

        // Обновляем прогресс - этап анализа
        let analysisProgress = activePreviewProgressMap.get(sessionId);
        if (analysisProgress) {
          analysisProgress.stage = 'analyzing';
          analysisProgress.totalOrders = salesDriveOrders.length;
          analysisProgress.message = `Анализируем ${salesDriveOrders.length} заказов...`;
        }

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
        for (let i = 0; i < salesDriveOrders.length; i++) {
      const order = salesDriveOrders[i];

      try {
        // Обновляем прогресс каждые 10 заказов или на каждом заказе для небольших объемов
        if (i % Math.max(1, Math.floor(salesDriveOrders.length / 20)) === 0 || salesDriveOrders.length < 50) {
          const loopProgress = activePreviewProgressMap.get(sessionId);
          if (loopProgress) {
            loopProgress.processedOrders = i;
            loopProgress.message = `Анализируем заказы... ${i}/${salesDriveOrders.length}`;
          }
        }

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
        const errorProgress = activePreviewProgressMap.get(sessionId);
        if (errorProgress) {
          errorProgress.errors.push(`Ошибка анализа заказа ${order.orderNumber}`);
        }
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

        // Финализируем прогресс
        const finalProgress = activePreviewProgressMap.get(sessionId);
        if (finalProgress) {
          finalProgress.processedOrders = salesDriveOrders.length;
          finalProgress.stage = 'completed';
          finalProgress.message = 'Анализ завершён успешно';
        }

        console.log(`✅ [ASYNC PREVIEW] Analysis completed for sessionId: ${sessionId}:`);
        console.log(`   🆕 New orders: ${preview.stats.new}`);
        console.log(`   🔄 Updates: ${preview.stats.update}`);
        console.log(`   ⏭️ Skips: ${preview.stats.skip}`);

        // Сохраняем результат для клиента
        previewResultsMap.set(sessionId, {
          sessionId,
          preview,
          completedAt: Date.now()
        });

        console.log(`💾 [ASYNC PREVIEW] Result saved for sessionId: ${sessionId}`);

      } catch (asyncError) {
        console.error(`❌ [ASYNC PREVIEW] Background analysis error for sessionId: ${sessionId}:`, asyncError);

        // Устанавливаем ошибку в прогрессе
        const errorProgress = activePreviewProgressMap.get(sessionId);
        if (errorProgress) {
          errorProgress.stage = 'error';
          errorProgress.message = 'Критическая ошибка анализа';
          errorProgress.errors.push(asyncError instanceof Error ? asyncError.message : 'Unknown error');
        }
      }
    })();

  } catch (error) {
    console.error('❌ [SYNC PREVIEW] Error:', error);

    // Устанавливаем ошибку в прогрессе
    const errorProgress = activePreviewProgressMap.get(sessionId);
    if (errorProgress) {
      errorProgress.stage = 'error';
      errorProgress.message = 'Критическая ошибка анализа';
      errorProgress.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    res.status(500).json({
      success: false,
      error: 'Failed to analyze sync preview'
    });
  }
});

// Выборочная синхронизация выбранных заказов
router.post('/sync/selective', authenticateToken, async (req, res) => {
  try {
    const { selectedOrders, startDate, endDate, syncMode = 'smart' } = req.body;

    if (!selectedOrders || !Array.isArray(selectedOrders) || selectedOrders.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected orders array is required and cannot be empty'
      });
    }

    // Создаем sessionId для отслеживания прогресса
    const sessionId = `selective_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🔑 [SELECTIVE SYNC] Generated sessionId: ${sessionId}`);

    // Создаем лог о начале синхронизации
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const syncLog = await prisma.syncLogs.create({
      data: {
        type: 'orders',
        status: 'running',
        message: `Выборочная синхронизация заказов: ${selectedOrders.length} шт.`,
        startedAt: new Date(),
        details: JSON.stringify({
          selectedOrders,
          startDate,
          endDate,
          sessionId,
          operation: 'selective_sync_progress'
        })
      }
    });

    console.log(`📝 [SELECTIVE SYNC] Created sync log with ID: ${syncLog.id}`);

    // Возвращаем ответ клиенту сразу, чтобы он начал мониторинг
    res.json({
      success: true,
      sessionId,
      message: 'Выборочная синхронизация запущена, следите за прогрессом',
      logId: syncLog.id
    });

    console.log(`✅ [SELECTIVE SYNC] Sent immediate response to client for sessionId: ${sessionId}`);

    // Запускаем синхронизацию в фоне для избежания таймаутов
    setImmediate(async () => {
      try {
        const { salesDriveService } = await import('../services/salesDriveService.js');
        const { orderDatabaseService } = await import('../services/orderDatabaseService.js');

        console.log(`🚀 [ASYNC SELECTIVE SYNC] Starting selective sync from ${startDate} to ${endDate || 'current date'} for sessionId: ${sessionId}`);

        // Инициализируем прогресс в Map
        activeSyncProgressMap.set(sessionId, {
          sessionId,
          logId: syncLog.id,
          startTime: Date.now(),
          processedOrders: 0,
          totalOrders: selectedOrders.length,
          currentBatch: 0,
          totalBatches: 1,
          stage: 'fetching',
          message: 'Получаем выбранные заказы из SalesDrive...',
          errors: [],
          lastAccessed: Date.now(),
          accessCount: 0
        });

        // Получаем заказы из SalesDrive для выбранных номеров
        const salesDriveResponse = await salesDriveService.fetchOrdersFromDateRangeParallel(startDate, endDate);

        if (!salesDriveResponse.success || !salesDriveResponse.data) {
          // Обновляем прогресс с ошибкой
          const progress = activeSyncProgressMap.get(sessionId);
          if (progress) {
            progress.stage = 'error';
            progress.message = 'Ошибка получения данных из SalesDrive';
            progress.errors.push(salesDriveResponse.error || 'Failed to fetch orders');
          }
          console.error(`❌ [ASYNC SELECTIVE SYNC] Failed to fetch orders for sessionId: ${sessionId}`);
          return;
        }

        const salesDriveOrders = salesDriveResponse.data;

        // Фильтруем только выбранные заказы
        const selectedSalesDriveOrders = salesDriveOrders.filter(order =>
          selectedOrders.includes(order.orderNumber)
        );

        console.log(`📊 [ASYNC SELECTIVE SYNC] Found ${selectedSalesDriveOrders.length} selected orders in SalesDrive for sessionId: ${sessionId}`);

        if (selectedSalesDriveOrders.length === 0) {
          // Обновляем прогресс
          const progress = activeSyncProgressMap.get(sessionId);
          if (progress) {
            progress.stage = 'completed';
            progress.message = 'Выбранные заказы не найдены в SalesDrive';
            progress.processedOrders = 0;
          }

          // Сохраняем результат
          syncResultsMap.set(sessionId, {
            sessionId,
            result: {
              success: true,
              synced: 0,
              errors: 0,
              totalCreated: 0,
              totalUpdated: 0,
              totalSkipped: 0,
              totalErrors: 0,
              message: 'No selected orders found in SalesDrive'
            },
            completedAt: Date.now()
          });

          return;
        }

        // Обновляем прогресс - этап обработки
        const progress = activeSyncProgressMap.get(sessionId);
        if (progress) {
          progress.stage = 'processing';
          progress.message = `Обрабатываем ${selectedSalesDriveOrders.length} выбранных заказов...`;
          progress.totalOrders = selectedSalesDriveOrders.length;
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

        // Выполняем пакетное обновление в зависимости от режима
        let updateResult;
        if (syncMode === 'smart') {
          console.log(`🔄 [SELECTIVE SYNC] Using SMART sync for ${ordersToUpdate.length} selected orders`);
          updateResult = await orderDatabaseService.updateOrdersBatchSmart(
            ordersToUpdate,
            { batchSize: 50, concurrency: 2 }
          );
        } else {
          console.log(`🔄 [SELECTIVE SYNC] Using FORCE sync for ${ordersToUpdate.length} selected orders`);
          updateResult = await orderDatabaseService.forceUpdateOrdersBatch(ordersToUpdate);
        }

        const totalCreated = (updateResult as any).totalCreated || 0;

        // Финализируем прогресс
        const finalProgress = activeSyncProgressMap.get(sessionId);
        if (finalProgress) {
          finalProgress.stage = 'completed';
          finalProgress.processedOrders = selectedSalesDriveOrders.length;
          finalProgress.message = 'Выборочная синхронизация завершена успешно';
        }

        console.log(`✅ [ASYNC SELECTIVE SYNC] Completed for sessionId: ${sessionId} - ${totalCreated} created, ${updateResult.totalUpdated} updated, ${updateResult.totalSkipped} skipped, ${updateResult.totalErrors} errors`);

        // Сохраняем результат для клиента
        syncResultsMap.set(sessionId, {
          sessionId,
          result: {
            success: true,
            synced: updateResult.totalUpdated + totalCreated,
            errors: updateResult.totalErrors,
            totalCreated,
            totalUpdated: updateResult.totalUpdated,
            totalSkipped: updateResult.totalSkipped,
            totalErrors: updateResult.totalErrors,
            message: `Обработано ${selectedSalesDriveOrders.length} выбранных заказов`
          },
          completedAt: Date.now()
        });

        console.log(`💾 [ASYNC SELECTIVE SYNC] Result saved for sessionId: ${sessionId}`);

        // Обновляем лог как завершенный
        const duration = Date.now() - syncLog.startedAt.getTime();
        await prisma.syncLogs.update({
          where: { id: syncLog.id },
          data: {
            status: updateResult.totalErrors > 0 ? 'partial' : 'success',
            message: `Выборочная синхронизация завершена: ${updateResult.totalUpdated} обновлено, ${totalCreated} создано`,
            finishedAt: new Date(),
            duration: BigInt(duration),
            recordsProcessed: selectedSalesDriveOrders.length,
            details: JSON.stringify({
              sessionId,
              selectedOrders: selectedOrders.length,
              processedOrders: selectedSalesDriveOrders.length,
              totalCreated,
              totalUpdated: updateResult.totalUpdated,
              totalSkipped: updateResult.totalSkipped,
              totalErrors: updateResult.totalErrors,
              duration
            }),
            errors: updateResult.totalErrors > 0 ? JSON.stringify([`${updateResult.totalErrors} заказов не удалось обработать`]) : null
          }
        });

        console.log(`✅ [ASYNC SELECTIVE SYNC] Log updated for sessionId: ${sessionId}`);

        // Очищаем прогресс через 30 минут
        setTimeout(() => {
          console.log(`🧹 [ASYNC SELECTIVE SYNC] Cleaning up progress for sessionId: ${sessionId}`);
          activeSyncProgressMap.delete(sessionId);
        }, 30 * 60 * 1000);

      } catch (asyncError) {
        console.error(`❌ [ASYNC SELECTIVE SYNC] Background error for sessionId: ${sessionId}:`, asyncError);

        // Обновляем прогресс с ошибкой
        const errorProgress = activeSyncProgressMap.get(sessionId);
        if (errorProgress) {
          errorProgress.stage = 'error';
          errorProgress.message = 'Критическая ошибка выборочной синхронизации';
          errorProgress.errors.push(asyncError instanceof Error ? asyncError.message : 'Unknown error');
        }

        // Обновляем лог с ошибкой
        await prisma.syncLogs.update({
          where: { id: syncLog.id },
          data: {
            status: 'error',
            message: 'Критическая ошибка выборочной синхронизации',
            finishedAt: new Date(),
            duration: BigInt(Date.now() - syncLog.startedAt.getTime()),
            errors: JSON.stringify([asyncError instanceof Error ? asyncError.message : 'Unknown error'])
          }
        });

        console.log(`❌ [ASYNC SELECTIVE SYNC] Error logged for sessionId: ${sessionId}`);

        // Очищаем прогресс через 10 минут при ошибке
        setTimeout(() => {
          console.log(`🧹 [ASYNC SELECTIVE SYNC] Cleaning up progress after error for sessionId: ${sessionId}`);
          activeSyncProgressMap.delete(sessionId);
        }, 10 * 60 * 1000);
      }
    });

  } catch (error) {
    console.error('❌ [SELECTIVE SYNC] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start selective sync'
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
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    // Проверяем, есть ли результат синхронизации
    const result = syncResultsMap.get(sessionId);
    if (result) {
      console.log(`📊 [SYNC PROGRESS] Returning completed result for sessionId: ${sessionId}`);

      // Удаляем результат после отправки
      syncResultsMap.delete(sessionId);
      activeSyncProgressMap.delete(sessionId);

      return res.json({
        success: true,
        active: false,
        completed: true,
        result: result.result
      });
    }

    // Проверяем прогресс
    const progress = activeSyncProgressMap.get(sessionId);
    if (!progress) {
      return res.json({
        success: true,
        active: false,
        message: 'Нет активной синхронизации'
      });
    }

    // Обновляем время последнего доступа и счетчик
    progress.lastAccessed = Date.now();
    progress.accessCount = (progress.accessCount || 0) + 1;

    const progressResponse = {
      ...progress,
      elapsedTime: Date.now() - progress.startTime,
      progressPercent: progress.totalOrders && progress.totalOrders > 0
        ? Math.min(Math.round((progress.processedOrders / progress.totalOrders) * 100), 100)
        : progress.processedOrders > 0 ? 100 : 0
    };

    console.log(`📊 [SYNC PROGRESS] Progress requested: ${progressResponse.stage} - ${progressResponse.message} (${progressResponse.progressPercent}%) for sessionId: ${sessionId}`);

    res.json({
      success: true,
      active: true,
      progress: progressResponse
    });
  } catch (error) {
    console.error('Error getting sync progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync progress'
    });
  }
});

// Прогресс предварительного анализа
router.get('/sync/preview/progress', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const progress = activePreviewProgressMap.get(sessionId);
    const result = previewResultsMap.get(sessionId);

    // Если есть результат, возвращаем его вместо прогресса
    if (result) {
      console.log(`📊 [PREVIEW PROGRESS] Returning completed result for sessionId: ${sessionId}`);

      // Удаляем результат после отправки
      previewResultsMap.delete(sessionId);
      activePreviewProgressMap.delete(sessionId);

      return res.json({
        success: true,
        active: false,
        completed: true,
        result: result.preview
      });
    }

    if (!progress) {
      return res.json({
        success: true,
        active: false,
        message: 'Нет активного анализа предварительного просмотра'
      });
    }

    // Обновляем время последнего доступа и счетчик
    progress.lastAccessed = Date.now();
    progress.accessCount = (progress.accessCount || 0) + 1;

    const progressResponse = {
      ...progress,
      elapsedTime: Date.now() - progress.startTime,
      progressPercent: progress.totalOrders && progress.totalOrders > 0
        ? Math.min(Math.round((progress.processedOrders / progress.totalOrders) * 100), 100)
        : progress.processedOrders > 0 ? 100 : 0
    };

    console.log(`📊 [PREVIEW PROGRESS] Progress requested: ${progressResponse.stage} - ${progressResponse.message} (${progressResponse.progressPercent}%)`);

    res.json({
      success: true,
      active: true,
      progress: progressResponse
    });
  } catch (error) {
    console.error('Error getting preview progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get preview progress'
    });
  }
});

// Ручная синхронизация с массовой загрузкой и прогрессом
router.post('/sync/manual', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, batchSize = 100, maxConcurrent = 3, chunkSize, syncMode = 'smart' } = req.body;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'Дата начала обязательна'
      });
    }

    // Создаем sessionId для отслеживания прогресса
    const sessionId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🔑 [MANUAL SYNC] Generated sessionId: ${sessionId}`);

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
          sessionId,
          operation: 'manual_mass_sync_progress'
        })
      }
    });

    console.log(`📝 [MANUAL SYNC] Created sync log with ID: ${syncLog.id}`);

    // Возвращаем ответ клиенту сразу, чтобы он начал мониторинг
    res.json({
      success: true,
      sessionId,
      message: 'Синхронизация запущена, следите за прогрессом',
      logId: syncLog.id
    });

    console.log(`✅ [MANUAL SYNC] Sent immediate response to client for sessionId: ${sessionId}`);


    // Запускаем синхронизацию в фоне для избежания таймаутов
    setImmediate(async () => {
      try {
        const { salesDriveService } = await import('../services/salesDriveService.js');

        console.log(`🚀 [ASYNC MANUAL SYNC] Starting mass sync from ${startDate} to ${endDate || 'current date'} for sessionId: ${sessionId}`);

        // Check for cancellation before starting
        if (cancelledOperations.get(sessionId)) {
          console.log(`🛑 [ASYNC SYNC] Operation ${sessionId} was cancelled before starting`);
          const progress = activeSyncProgressMap.get(sessionId);
          if (progress) {
            progress.stage = 'error';
            progress.message = 'Операція була скасована користувачем';
            progress.errors.push('Operation cancelled by user');
          }
          return;
        }

        // Инициализируем прогресс в Map
        activeSyncProgressMap.set(sessionId, {
          sessionId,
          logId: syncLog.id,
          startTime: Date.now(),
          processedOrders: 0,
          totalOrders: 0,
          currentBatch: 0,
          totalBatches: 1,
          stage: 'fetching',
          message: 'Получаем заказы из SalesDrive API...',
          errors: [],
          lastAccessed: Date.now(),
          accessCount: 0
        });

        // Функция для обновления прогресса
        const updateProgress = (stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error', message: string, processedOrders?: number, totalOrders?: number, currentBatch?: number, totalBatches?: number, errors?: string[]) => {
          const progress = activeSyncProgressMap.get(sessionId);
          if (progress) {
            progress.stage = stage;
            progress.message = message;
            if (processedOrders !== undefined) progress.processedOrders = processedOrders;
            if (totalOrders !== undefined) progress.totalOrders = totalOrders;
            if (currentBatch !== undefined) progress.currentBatch = currentBatch;
            if (totalBatches !== undefined) progress.totalBatches = totalBatches;
            if (errors !== undefined) progress.errors = errors;

            console.log(`🔄 [ASYNC SYNC PROGRESS] Updated: ${stage} - ${message} (${processedOrders || 0}/${totalOrders || 0}) for sessionId: ${sessionId}`);
          }
        };

        // Используем оптимизированную ручную синхронизацию с чанкингом
        const syncResult = await salesDriveService.syncOrdersWithDatabaseManual(startDate, endDate, {
          chunkSize: Math.min((req.body.chunkSize || 1000), 2000), // Размер чанка
          maxMemoryMB: 200, // Максимум 200MB памяти
          enableProgress: true,
          syncMode,
          onProgress: updateProgress
        });

        // Финализируем прогресс
        const finalProgress = activeSyncProgressMap.get(sessionId);
        if (finalProgress) {
          finalProgress.stage = 'completed';
          finalProgress.processedOrders = syncResult.synced + syncResult.errors;
          finalProgress.message = 'Синхронизация завершена успешно';
        }

        console.log(`✅ [ASYNC MANUAL SYNC] Sync completed for sessionId: ${sessionId} - ${syncResult.synced} synced, ${syncResult.errors} errors`);

        // Сохраняем результат для клиента
        syncResultsMap.set(sessionId, {
          sessionId,
          result: {
            success: syncResult.success,
            synced: syncResult.synced,
            errors: syncResult.errors,
            metadata: syncResult.metadata,
            logId: syncLog.id
          },
          completedAt: Date.now()
        });

        console.log(`💾 [ASYNC MANUAL SYNC] Result saved for sessionId: ${sessionId}`);

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
              errors: syncResult.errors,
              sessionId
            }),
            errors: syncResult.errors > 0 ? JSON.stringify([`${syncResult.errors} заказов не удалось обработать`]) : null
          }
        });

        console.log(`✅ [ASYNC MANUAL SYNC] Log updated for sessionId: ${sessionId}`);

        // Очищаем прогресс через 30 минут (увеличено время жизни)
        setTimeout(() => {
          console.log(`🧹 [ASYNC SYNC PROGRESS] Cleaning up progress for sessionId: ${sessionId}`);
          activeSyncProgressMap.delete(sessionId);
        }, 30 * 60 * 1000);

      } catch (error) {
        console.error(`❌ [ASYNC MANUAL SYNC] Critical error for sessionId: ${sessionId}:`, error);

        // Обновляем прогресс
        const errorProgress = activeSyncProgressMap.get(sessionId);
        if (errorProgress) {
          errorProgress.stage = 'error';
          errorProgress.message = 'Критическая ошибка синхронизации';
          errorProgress.errors.push(error instanceof Error ? error.message : 'Unknown critical error');
        }

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

        console.log(`❌ [ASYNC MANUAL SYNC] Error logged for sessionId: ${sessionId}`);

        // Очищаем прогресс через 10 минут при ошибке
        setTimeout(() => {
          console.log(`🧹 [ASYNC SYNC PROGRESS] Cleaning up progress after error for sessionId: ${sessionId}`);
          activeSyncProgressMap.delete(sessionId);
        }, 10 * 60 * 1000);
      }
    });

    // Ответ уже отправлен выше, вся обработка происходит в фоне
    console.log(`✅ [MANUAL SYNC] Background processing started for sessionId: ${sessionId}`);
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






// Cancel operation endpoint
router.post('/cancel/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;

  console.log(`🛑 [CANCEL REQUEST] Received cancellation request for sessionId: ${sessionId}`);

  try {
    // Mark operation as cancelled
    cancelledOperations.set(sessionId, true);

    // Update progress to show cancellation
    const previewProgress = activePreviewProgressMap.get(sessionId);
    if (previewProgress) {
      previewProgress.stage = 'error';
      previewProgress.message = 'Операція була скасована користувачем';
      previewProgress.errors.push('Operation cancelled by user');
      console.log(`✅ [CANCEL] Preview operation ${sessionId} marked as cancelled`);
    }

    const syncProgress = activeSyncProgressMap.get(sessionId);
    if (syncProgress) {
      syncProgress.stage = 'error';
      syncProgress.message = 'Операція була скасована користувачем';
      syncProgress.errors.push('Operation cancelled by user');
      console.log(`✅ [CANCEL] Sync operation ${sessionId} marked as cancelled`);
    }

    res.json({
      success: true,
      message: 'Operation cancellation requested',
      sessionId
    });

  } catch (error) {
    console.error('❌ [CANCEL] Error cancelling operation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel operation'
    });
  }
});

export default router;
