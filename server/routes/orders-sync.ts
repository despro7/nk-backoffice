import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { syncSettingsService } from '../services/syncSettingsService';

const router = express.Router();
const prisma = new PrismaClient();

// Хелпер функция для сериализации логов с BigInt полями
const serializeSyncLog = (log: any) => ({
  ...log,
  duration: log.duration ? Number(log.duration) : null
});

// Хелпер функция для сериализации массива логов
const serializeSyncLogs = (logs: any[]) => logs.map(serializeSyncLog);

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
      where: { id },
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

    // Подсчитываем заказы с кешированной статистикой товаров (processedItems не null и не пустое)
    const cachedOrders = await prisma.order.count({
      where: {
        AND: [
          { processedItems: { not: null } },
          { processedItems: { not: '' } }
        ]
      }
    });

    // Получить среднее время жизни кеша (с момента последнего обновления)
    const cacheEntries = await prisma.order.findMany({
      where: {
        AND: [
          { processedItems: { not: null } },
          { processedItems: { not: '' } }
        ]
      },
      select: {
        updatedAt: true
      },
      take: 1000
    });

    const now = Date.now();
    const averageCacheTime = cacheEntries.length > 0
      ? cacheEntries.reduce((sum, entry) =>
          sum + (now - entry.updatedAt.getTime()), 0
        ) / cacheEntries.length
      : 0;

    // Получить hit rate (процент заказов с кешем)
    const cacheHitRate = totalOrders > 0 ? (cachedOrders / totalOrders) * 100 : 0;

    // Общий размер кеша - количество заказов с кешем
    const totalCacheSize = cachedOrders;

    // Получить время последнего обновления кеша
    const lastCacheUpdate = cacheEntries.length > 0
      ? cacheEntries.reduce((latest, entry) =>
          entry.updatedAt > latest ? entry.updatedAt : latest,
          new Date(0)
        )
      : null;

    res.json({
      success: true,
      stats: {
        totalOrders,
        cachedOrders,
        cacheHitRate,
        lastCacheUpdate: lastCacheUpdate ? lastCacheUpdate.toISOString() : new Date().toISOString(),
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
    // Очищаем кеш в поле processedItems всех заказов
    const result = await prisma.order.updateMany({
      where: {
        processedItems: {
          not: null
        }
      },
      data: {
        processedItems: null
      }
    });

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

// Ручная синхронизация
router.post('/sync/manual', authenticateToken, async (req, res) => {
  try {
    const { startDate } = req.body;

    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'Дата начала обязательна'
      });
    }

    // Создаем лог о начале синхронизации
    const syncLog = await prisma.syncLogs.create({
      data: {
        type: 'orders',
        status: 'running',
        message: `Ручная синхронизация заказов с ${startDate}`,
        startedAt: new Date()
      }
    });

    // Здесь должна быть логика синхронизации с SalesDrive
    // Пока просто симулируем процесс

    // Имитация задержки
    setTimeout(async () => {
      try {
        // Обновляем лог как завершенный
        await prisma.syncLogs.update({
          where: { id: syncLog.id },
          data: {
            status: 'success',
            message: `Синхронизация завершена успешно`,
            finishedAt: new Date(),
            duration: BigInt(Date.now() - syncLog.startedAt.getTime()),
            recordsProcessed: 150
          }
        });
      } catch (error) {
        console.error('Error updating sync log:', error);
      }
    }, 2000);

    res.json({
      success: true,
      message: 'Ручная синхронизация запущена',
      logId: syncLog.id,
      log: serializeSyncLog(syncLog)
    });
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

export default router;
