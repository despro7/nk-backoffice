import { prisma } from '../lib/utils.js';

/** Скільки днів зберігати записи історії синхронізацій */
export const SYNC_HISTORY_RETENTION_DAYS = 7;

export type SyncHistoryType = 'manual' | 'automatic' | 'background';

export interface SyncHistoryDetailsInput {
  totalProcessed?: number;
  newOrders?: number;
  updatedOrders?: number;
  skippedOrders?: number;
  errors?: number;
  metadata?: Record<string, unknown>;
  orderDetails?: unknown[];
  startDate?: string;
  endDate?: string;
  syncMode?: string;
  changesSummary?: Record<string, unknown>;
  sampleOrders?: unknown[];
  batchUpdateDuration?: number;
  successRate?: number;
}

/** Повертає дату відсічення для retention-фільтра */
export function getSyncHistoryRetentionCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SYNC_HISTORY_RETENTION_DAYS);
  return cutoff;
}

/**
 * Нормалізує duration до секунд.
 * Manual sync зберігав секунди, automatic — мілісекунди (legacy).
 */
export function normalizeDurationSeconds(duration: number): number {
  if (!duration || duration <= 0) return 0;
  // Значення > 1 год в «секундах» — ймовірно legacy ms
  if (duration > 3600) return duration / 1000;
  return duration;
}

/** Конвертує тривалість з мілісекунд у секунди для збереження в БД */
export function durationMsToSeconds(durationMs: number): number {
  if (!durationMs || durationMs <= 0) return 0;
  return durationMs / 1000;
}

/** Формує details для запису історії залежно від режиму full-log */
export function buildSyncHistoryDetails(
  fullLog: boolean,
  input: SyncHistoryDetailsInput,
): Record<string, unknown> {
  const minimal = {
    totalProcessed: input.totalProcessed ?? 0,
    newOrders: input.newOrders ?? 0,
    updatedOrders: input.updatedOrders ?? 0,
    skippedOrders: input.skippedOrders ?? 0,
    errors: input.errors ?? 0,
  };

  if (!fullLog) {
    return minimal;
  }

  const orderChanges = Array.isArray(input.orderDetails)
    ? input.orderDetails.slice(0, 50)
    : undefined;

  return {
    ...minimal,
    ...(input.metadata ?? {}),
    ...(input.startDate && {
      dateRange: `${input.startDate}${input.endDate ? ` to ${input.endDate}` : ''}`,
    }),
    ...(input.syncMode && { syncMode: input.syncMode }),
    ...(input.batchUpdateDuration !== undefined && {
      batchUpdateDuration: input.batchUpdateDuration,
    }),
    ...(input.successRate !== undefined && { successRate: input.successRate }),
    ...(input.changesSummary && Object.keys(input.changesSummary).length > 0 && {
      changes: input.changesSummary,
    }),
    ...(input.sampleOrders && input.sampleOrders.length > 0 && {
      sampleOrders: input.sampleOrders,
    }),
    ...(orderChanges && orderChanges.length > 0 && { orderChanges }),
  };
}

export interface SyncHistoryRecord {
  id: number;
  syncType: string; // 'manual', 'automatic', 'background'
  startDate?: string;
  endDate?: string;
  totalOrders: number;
  newOrders: number;
  updatedOrders: number;
  skippedOrders: number;
  errors: number;
  duration: number;
  details: any;
  status: string; // 'success', 'partial', 'failed'
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSyncHistoryData {
  syncType: SyncHistoryType;
  startDate?: string;
  endDate?: string;
  totalOrders: number;
  newOrders: number;
  updatedOrders: number;
  skippedOrders: number;
  errors: number;
  duration: number;
  details: any;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export class SyncHistoryService {
  /**
   * Парсит поле details из JSON строки обратно в объект
   */
  private parseDetails(details: string): any {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch (error) {
      console.warn('❌ [SYNC HISTORY] Failed to parse details JSON:', error);
      return details; // Возвращаем как строку, если не удалось распарсить
    }
  }
  /**
   * Создает новую запись в истории синхронизаций
   */
  async createSyncRecord(data: CreateSyncHistoryData): Promise<SyncHistoryRecord> {
    try {
      // Сериализуем объект details в JSON строку для базы данных
      const detailsString = typeof data.details === 'object'
        ? JSON.stringify(data.details)
        : String(data.details || '');

      const record = await prisma.syncHistory.create({
        data: {
          syncType: data.syncType,
          startDate: data.startDate,
          endDate: data.endDate,
          totalOrders: data.totalOrders,
          newOrders: data.newOrders,
          updatedOrders: data.updatedOrders,
          skippedOrders: data.skippedOrders,
          errors: data.errors,
          duration: data.duration,
          details: detailsString,
          status: data.status,
          errorMessage: data.errorMessage
        }
      });

      console.log(`📝 [SYNC HISTORY] Created record: ${record.id} (${data.syncType})`);

      // Асинхронно прибираємо записи старші retention-періоду
      this.cleanupOldRecords(SYNC_HISTORY_RETENTION_DAYS).catch((err) => {
        console.error('❌ [SYNC HISTORY] Background cleanup failed:', err);
      });

      return {
        ...record,
        details: this.parseDetails(record.details),
      };
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to create sync record:', error);
      throw error;
    }
  }

  private getRetentionWhere() {
    return { createdAt: { gte: getSyncHistoryRetentionCutoff() } };
  }

  /**
   * Получает последние N записей истории синхронизаций
   */
  async getSyncHistory(
    limit: number = 20, 
    offset: number = 0, 
    sortColumn: string = 'createdAt', 
    sortDirection: string = 'desc'
  ): Promise<{ records: SyncHistoryRecord[], total: number }> {
    try {
      // Валидация и маппинг колонок
      const validColumns = ['id', 'createdAt', 'syncType', 'status', 'duration', 'totalOrders', 'newOrders', 'updatedOrders', 'errors'];
      const column = validColumns.includes(sortColumn) ? sortColumn : 'createdAt';
      const direction = sortDirection === 'ascending' ? 'asc' : 'desc';

      const retentionWhere = this.getRetentionWhere();

      const [records, total] = await Promise.all([
        prisma.syncHistory.findMany({
          where: retentionWhere,
          orderBy: {
            [column]: direction
          },
          take: limit,
          skip: offset
        }),
        prisma.syncHistory.count({ where: retentionWhere })
      ]);

      // Десериализуем поле details из JSON строки обратно в объект
      const parsedRecords = records.map(record => ({
        ...record,
        details: this.parseDetails(record.details)
      }));

      console.log(`📋 [SYNC HISTORY] Retrieved ${parsedRecords.length} of ${total} records`);
      return { records: parsedRecords, total };
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to get sync history:', error);
      throw error;
    }
  }

  /**
   * Получает статистику по синхронизациям
   */
  async getSyncStatistics(): Promise<{
    totalSyncs: number;
    manualSyncs: number;
    automaticSyncs: number;
    backgroundSyncs: number;
    averageDuration: number;
    lastSync: SyncHistoryRecord | null;
    successRate: number;
    totalSize: number;
  }> {
    try {
      const retentionWhere = this.getRetentionWhere();
      const cutoffIso = getSyncHistoryRetentionCutoff().toISOString();

      const totalSizeQuery =
        prisma.$queryRaw`SELECT SUM(CHAR_LENGTH(details)) as total_size FROM \`sync_history\` WHERE createdAt >= ${cutoffIso}`;

      const [
        totalRecords,
        manualCount,
        autoCount,
        backgroundCount,
        avgDuration,
        lastRecord,
        totalSizeResult,
      ] = await Promise.all([
        prisma.syncHistory.count({ where: retentionWhere }),
        prisma.syncHistory.count({ where: { ...retentionWhere, syncType: "manual" } }),
        prisma.syncHistory.count({ where: { ...retentionWhere, syncType: "automatic" } }),
        prisma.syncHistory.count({ where: { ...retentionWhere, syncType: "background" } }),
        prisma.syncHistory.aggregate({
          _avg: {
            duration: true,
          },
          where: {
            ...retentionWhere,
            duration: {
              gt: 0,
            },
          },
        }),
        prisma.syncHistory.findFirst({
          where: retentionWhere,
          orderBy: {
            createdAt: "desc",
          },
        }),
        totalSizeQuery,
      ]);

      const successCount = await prisma.syncHistory.count({
        where: {
          ...retentionWhere,
          status: 'success'
        }
      });

      const successRate =
        totalRecords > 0 ? (successCount / totalRecords) * 100 : 0;
      const totalSize = Number((totalSizeResult as any)?.[0]?.total_size || 0);

      return {
        totalSyncs: totalRecords,
        manualSyncs: manualCount,
        automaticSyncs: autoCount,
        backgroundSyncs: backgroundCount,
        averageDuration: avgDuration._avg.duration || 0,
        lastSync: lastRecord,
        successRate: Math.round(successRate * 100) / 100,
        totalSize,
      };
    } catch (error) {
      console.error("❌ [SYNC HISTORY] Failed to get sync statistics:", error);
      throw error;
    }
  }

  /**
   * Удаляет старые записи истории (старше N дней)
   */
  async cleanupOldRecords(daysToKeep: number = SYNC_HISTORY_RETENTION_DAYS): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.syncHistory.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      });

      console.log(`🧹 [SYNC HISTORY] Cleaned up ${result.count} old records`);
      return result.count;
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to cleanup old records:', error);
      throw error;
    }
  }

  /**
   * Отримує останню успішну синхронізацію
   */
  async getLastSuccessfulSync(): Promise<SyncHistoryRecord | null> {
    try {
      const record = await prisma.syncHistory.findFirst({
        where: {
          status: 'success'
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (record) {
        // Перетворюємо поле details із JSON-рядка назад в об’єкт
        return {
          ...record,
          details: this.parseDetails(record.details)
        };
      }

      return null;
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to get last successful sync:', error);
      throw error;
    }
  }

  /**
   * Отримує записи за типом синхронізації
   */
  async getSyncHistoryByType(
    syncType: 'manual' | 'automatic' | 'background', 
    limit: number = 10, 
    offset: number = 0,
    sortColumn: string = 'createdAt',
    sortDirection: string = 'desc'
  ): Promise<{ records: SyncHistoryRecord[], total: number }> {
    try {
      // Валідація та маппінг колонок
      const validColumns = ['id', 'createdAt', 'syncType', 'status', 'duration', 'totalOrders', 'newOrders', 'updatedOrders', 'errors'];
      const column = validColumns.includes(sortColumn) ? sortColumn : 'createdAt';
      const direction = sortDirection === 'ascending' ? 'asc' : 'desc';

      const where = { syncType, ...this.getRetentionWhere() };
      const [records, total] = await Promise.all([
        prisma.syncHistory.findMany({
          where,
          orderBy: {
            [column]: direction
          },
          take: limit,
          skip: offset
        }),
        prisma.syncHistory.count({ where })
      ]);

      // Перетворюємо поле details із JSON-рядка назад в об’єкт
      const parsedRecords = records.map(record => ({
        ...record,
        details: this.parseDetails(record.details)
      }));

      console.log(`📋 [SYNC HISTORY] Retrieved ${parsedRecords.length} of ${total} ${syncType} records`);
      return { records: parsedRecords, total };
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to get sync history by type:', error);
      throw error;
    }
  }
}

export const syncHistoryService = new SyncHistoryService();
