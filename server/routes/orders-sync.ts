import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { prisma } from '../lib/utils.js';
import { syncSettingsService } from '../services/syncSettingsService.js';
import { salesDriveService } from '../services/salesDriveService.js';
import { generateExternalId } from '../services/salesdrive/externalIdHelper.js';

const router = express.Router();


// Хелпер функция для сериализации логов с BigInt полями
const serializeSyncLog = (log: any) => ({
  ...log,
  duration: log.duration ? Number(log.duration) : null
});

// Хелпер функция для сериализации массива логов
const serializeSyncLogs = (logs: any[]) => logs.map(serializeSyncLog);

// Cache for sync previews (in-memory cache)
const syncPreviewCache = new Map<string, { data: any; timestamp: number; expiresAt: number }>();
const _PREVIEW_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

/**
 * POST /api/orders-sync/sync/preview
 * Предварительный анализ синхронизации
 */
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
      message: 'Отримуємо замовлення з SalesDrive...',
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
        // console.log(`🔄 [ASYNC PREVIEW] Starting background analysis for sessionId: ${sessionId}`);

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
        const analysisProgress = activePreviewProgressMap.get(sessionId);
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
            // Обновляем прогресс каждые 20 заказов или на каждом заказе для небольших объемов
            if (i % Math.max(1, Math.floor(salesDriveOrders.length / 20)) === 0 || salesDriveOrders.length < 50) {
              const loopProgress = activePreviewProgressMap.get(sessionId);
              if (loopProgress) {
                loopProgress.processedOrders = i;
                loopProgress.message = `Анализируем заказы... ${i}/${salesDriveOrders.length}`;
              }
            }

            const existingOrder = await orderDatabaseService.getOrderById(order.id.toString());

            if (!existingOrder) {
              // Новый заказ
              preview.newOrders.push({
                orderNumber: generateExternalId(order),
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
              const changeResult = orderDatabaseService.detectOrderChanges(existingOrder, order);
              const changes = changeResult.fields;

              if (changes.length === 0) {
                // Без изменений
                preview.skippedOrders.push({
                  orderNumber: generateExternalId(order),
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
                  orderNumber: generateExternalId(order),
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
              orderNumber: generateExternalId(order),
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

/**
 * POST /api/orders-sync/sync/selective
 * Выборочная синхронизация выбранных заказов
 */
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
    (globalThis as any).setImmediate(async () => {
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
          selectedOrders.includes(generateExternalId(order))
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
          id: order.id,
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
            duration: duration,
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
            duration: Date.now() - syncLog.startedAt.getTime(),
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

/**
 * GET /api/orders-sync/sync/stats
 * Получить статистику синхронизаций
 */
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

/**
 * GET /api/orders-sync/sync/logs
 * Получить логи синхронизации
 */
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

/**
 * POST /api/orders-sync/sync/logs
 * Создать лог синхронизации
 */
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

/**
 * PUT /api/orders-sync/sync/logs/:id
 * Обновить лог синхронизации
 */
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
    if (duration) updateData.duration = duration;

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

/**
 * GET /api/orders-sync/sync/settings
 * Получить настройки синхронизации
 */
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


/**
 * POST /api/orders-sync/sync/settings
 * Сохранить настройки синхронизации
 */
router.post('/sync/settings', authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    await syncSettingsService.saveSyncSettings(settings);

    res.json({
      success: true,
      message: 'Налаштування синхронізації збережені'
    });
  } catch (error) {
    console.error('Error saving sync settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save sync settings'
    });
  }
});



/**
 * GET /api/orders/sync-statistics
 * Получить статистику по загружаемым данным
 */
router.get('/sync-statistics', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, includeProductStats, includeOrderDetails } = req.query;
    const { salesDriveService } = await import('../services/salesDriveService.js');

    const options: any = {};

    if (startDate) options.startDate = startDate as string;
    if (endDate) options.endDate = endDate as string;
    if (includeProductStats === 'true') options.includeProductStats = true;
    if (includeOrderDetails === 'true') options.includeOrderDetails = true;

    console.log('📊 Sync statistics request:', options);

    // Используем syncHistoryService вместо удаленной функции
    const { syncHistoryService } = await import('../services/syncHistoryService.js');
    const result = await syncHistoryService.getSyncStatistics();

    res.json({
      success: true,
      data: result,
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

// Глобальное состояние для отслеживания прогресса синхронизации
const _activeSyncProgress: {
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
        message: 'Немає активної синхронізації'
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

    // console.log(`📊 [SYNC PROGRESS] Progress requested: ${progressResponse.stage} - ${progressResponse.message} (${progressResponse.progressPercent}%)`);

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
        message: 'Немає активного аналізу попереднього перегляду'
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
    const { startDate, endDate, batchSize = 100, maxConcurrent = 3, syncMode = 'smart' } = req.body;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'Дата початку обов\'язкова'
      });
    }

    // Создаем sessionId для отслеживания прогресса
    const sessionId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // console.log(`🔑 [MANUAL SYNC] Generated sessionId: ${sessionId}`);

    // Создаем лог о начале синхронизации
    const syncLog = await prisma.syncLogs.create({
      data: {
        type: 'orders',
        status: 'running',
        message: `Ручна синхронізація замовлень з ${startDate}${endDate ? ` по ${endDate}` : ''}`,
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

    // console.log(`📝 [MANUAL SYNC] Created sync log with ID: ${syncLog.id}`);

    // Возвращаем ответ клиенту сразу, чтобы он начал мониторинг
    res.json({
      success: true,
      sessionId,
      message: 'Синхронізацію запущено, стежте за прогресом',
      logId: syncLog.id
    });

    // console.log(`✅ [MANUAL SYNC] Sent immediate response to client for sessionId: ${sessionId}`);


    // Запускаем синхронизацию в фоне для избежания таймаутов
    (globalThis as any).setImmediate(async () => {
      try {
        const { salesDriveService } = await import('../services/salesDriveService.js');

        console.log(`🚀 [ASYNC MANUAL SYNC] Starting mass sync from ${startDate} to ${endDate || 'current date'}`);

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
          message: 'Отримуємо замовлення з SalesDrive API...',
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

            console.log(`🔄 [ASYNC SYNC PROGRESS] Updated: ${stage} - ${message} (${processedOrders || 0}/${totalOrders || 0})`);
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
            duration: duration,
            recordsProcessed: syncResult.synced + syncResult.errors,
            details: JSON.stringify({
              sessionId,
              totalCreated: syncResult.metadata?.newOrders || 0,
              totalUpdated: syncResult.metadata?.updatedOrders || 0,
              totalSkipped: syncResult.metadata?.skippedOrders || 0,
              totalErrors: syncResult.errors,
              totalProcessed: syncResult.metadata?.totalProcessed || (syncResult.synced + syncResult.errors),
              duration,
              success: syncResult.success,
              synced: syncResult.synced,
              errors: syncResult.errors,
              efficiency: syncResult.metadata?.efficiency || 0,
              averageTimePerOrder: syncResult.metadata?.averageTimePerOrder || 0
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
            duration: Date.now() - syncLog.startedAt.getTime(),
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
    // console.log(`✅ [MANUAL SYNC] Background processing started for sessionId: ${sessionId}`);
  } catch (error) {
    console.error('Error starting manual sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start manual sync'
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

/**
 * POST /api/orders-sync/sync/single-order
 * Оновити одне замовлення з SalesDrive
 */
router.post('/sync/single-order', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    console.log(`🔄 [SINGLE ORDER SYNC] Starting sync for order ID: ${id}`);

    // Знаходимо замовлення в БД
    const existingOrder = await prisma.order.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Отримуємо оновлені дані з SalesDrive
    const { salesDriveService } = await import('../services/salesDriveService.js');
    const { orderDatabaseService } = await import('../services/orderDatabaseService.js');

    // Отримуємо замовлення з SalesDrive за id
    const salesDriveOrder = await salesDriveService.getOrderById(existingOrder.id.toString());

    if (!salesDriveOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found in SalesDrive'
      });
    }

    // Перевіряємо зміни
    const changeResult = orderDatabaseService.detectOrderChanges(existingOrder, salesDriveOrder);
    const changes = changeResult.fields;

    if (changes.length === 0) {
      // Оновлюємо тільки lastSynced
      const updatedOrder = await prisma.order.update({
        where: { id: parseInt(id) },
        data: { lastSynced: new Date() }
      });

      console.log(`ℹ️ [SINGLE ORDER SYNC] No changes detected, updated lastSynced only`);

      return res.json({
        success: true,
        hasChanges: false,
        message: 'No changes detected',
        lastSynced: updatedOrder.lastSynced.toISOString(),
        order: {
          ...updatedOrder,
          items: updatedOrder.items ? JSON.parse(updatedOrder.items as string) : [],
          rawData: updatedOrder.rawData ? JSON.parse(updatedOrder.rawData as string) : {}
        }
      });
    }

    // Оновлюємо замовлення
    const updateData: any = {
      status: salesDriveOrder.status,
      statusText: salesDriveOrder.statusText,
      items: JSON.stringify(salesDriveOrder.items),
      rawData: JSON.stringify(salesDriveOrder.rawData),
      ttn: salesDriveOrder.ttn,
      quantity: salesDriveOrder.quantity,
      customerName: salesDriveOrder.customerName,
      customerPhone: salesDriveOrder.customerPhone,
      deliveryAddress: salesDriveOrder.deliveryAddress,
      totalPrice: salesDriveOrder.totalPrice,
      shippingMethod: salesDriveOrder.shippingMethod,
      paymentMethod: salesDriveOrder.paymentMethod,
      cityName: salesDriveOrder.cityName,
      provider: salesDriveOrder.provider,
      pricinaZnizki: salesDriveOrder.pricinaZnizki,
      sajt: salesDriveOrder.sajt,
      lastSynced: new Date()
    };

    console.log('Update data:', updateData);

    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    console.log(`✅ [SINGLE ORDER SYNC] Order updated successfully with ${changes.length} changes`);

    res.json({
      success: true,
      hasChanges: true,
      changes: changes,
      message: `Order updated with ${changes.length} changes`,
      lastSynced: updatedOrder.lastSynced.toISOString(),
      order: {
        ...updatedOrder,
        items: updatedOrder.items ? JSON.parse(updatedOrder.items as string) : [],
        rawData: updatedOrder.rawData ? JSON.parse(updatedOrder.rawData as string) : {}
      }
    });

  } catch (error) {
    console.error('❌ [SINGLE ORDER SYNC] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync order'
    });
  }
});









/**
 * POST /api/orders/sync
 * Синхронизировать заказы из SalesDrive с локальной БД
 */
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    // Проверяем, включена ли синхронизация заказов
    const isEnabled = await syncSettingsService.isSyncEnabled('orders');

    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Синхронизация заказов отключена в настройках'
      });
    }

    const { salesDriveService } = await import('../services/salesDriveService.js');
    const result = await salesDriveService.syncOrdersWithDatabase();

    res.json({
      success: result.success,
      message: `Synchronized: ${result.synced}, Errors: ${result.errors}`,
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
router.get('/sync/status', authenticateToken, async (req, res) => {
  try {
    const { orderDatabaseService } = await import('../services/orderDatabaseService.js');

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
 * GET /api/orders/sync/history
 * Получить историю синхронизаций
 */
router.get('/sync/history', authenticateToken, async (req, res) => {
  try {
    const { syncHistoryService } = await import('../services/syncHistoryService.js');
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const offset = (page - 1) * limit;
    const syncType = req.query.type as string;
    const sortColumn = req.query.sortColumn as string || 'createdAt';
    const sortDirection = req.query.sortDirection as string || 'desc';

    console.log(`📋 [SYNC HISTORY] Getting sync history (limit: ${limit}, page: ${page}, type: ${syncType || 'all'}, sort: ${sortColumn} ${sortDirection})`);

    let result;
    if (syncType && ['manual', 'automatic', 'background'].includes(syncType)) {
      result = await syncHistoryService.getSyncHistoryByType(
        syncType as 'manual' | 'automatic' | 'background',
        limit,
        offset,
        sortColumn,
        sortDirection
      );
    } else {
      result = await syncHistoryService.getSyncHistory(limit, offset, sortColumn, sortDirection);
    }

    // Получаем статистику
    const stats = await syncHistoryService.getSyncStatistics();

    res.json({
      success: true,
      data: {
        history: result.records,
        totalPages: Math.ceil(result.total / limit),
        totalRecords: result.total,
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
      where: { id: parseInt(id) }
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

/**
 * GET /api/orders/test-salesdrive
 * Test SalesDrive API endpoint with custom parameters (uses existing salesDriveService)
 */
router.get('/test-salesdrive', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 [SALESDRIVE TEST] Testing with params:', req.query);

    // Якщо передан orderId, спробуємо спочатку знайти його в нашій БД по orderNumber або externalId
    if (req.query.orderId) {
      let orderId = req.query.orderId as string;
      console.log('📋 [SALESDRIVE TEST] Looking up order in local DB:', orderId);

      const searchIdAsInt = parseInt(orderId);
      const localOrder = await prisma.order.findFirst({
        where: {
          OR: [
            ...(!isNaN(searchIdAsInt) ? [{ id: searchIdAsInt }] : []),
            { orderNumber: orderId },
            { externalId: orderId }
          ]
        },
        select: { id: true, orderNumber: true, externalId: true }
      });

      let resolvedInfo = null;
      if (localOrder) {
        console.log(`✅ [SALESDRIVE TEST] Resolved local order: ${localOrder.orderNumber} -> Internal ID: ${localOrder.id}`);
        orderId = localOrder.id.toString();
        resolvedInfo = {
          localId: localOrder.id,
          orderNumber: localOrder.orderNumber,
          externalId: localOrder.externalId
        };
      }

      console.log('📋 [SALESDRIVE TEST] Using getOrderById for orderId:', orderId);
      const result = await salesDriveService.getOrderById(orderId);

      if (result) {
        return res.json({
          success: true,
          method: 'getOrderById',
          data: result,
          meta: {
            orderId: req.query.orderId,
            resolvedId: orderId,
            resolvedFromLocal: !!localOrder,
            resolvedInfo,
            found: true
          }
        });
      } else {
        return res.json({
          success: true,
          method: 'getOrderById',
          data: null,
          meta: {
            orderId: req.query.orderId,
            resolvedId: orderId,
            found: false,
            message: 'Order not found in SalesDrive'
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ [SALESDRIVE TEST] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/orders-sync/sync/history/delete
 * Удалить записи истории синхронизации
 */
router.delete('/sync/history/delete', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const { syncHistoryService } = await import('../services/syncHistoryService.js');

    // Удаляем записи по ID
    const deletedCount = await prisma.syncHistory.deleteMany({
      where: {
        id: {
          in: ids.map(id => parseInt(id))
        }
      }
    });

    console.log(`🗑️ [SYNC HISTORY] Deleted ${deletedCount.count} records`);

    res.json({
      success: true,
      deletedCount: deletedCount.count,
      message: `Successfully deleted ${deletedCount.count} records`
    });
  } catch (error) {
    console.error('❌ Error deleting sync history records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete records'
    });
  }
});

export default router;
