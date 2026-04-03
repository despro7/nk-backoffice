import { prisma } from '../lib/utils.js';


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
  syncType: 'manual' | 'automatic' | 'background';
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
      return record;
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to create sync record:', error);
      throw error;
    }
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

      const [records, total] = await Promise.all([
        prisma.syncHistory.findMany({
          orderBy: {
            [column]: direction
          },
          take: limit,
          skip: offset
        }),
        prisma.syncHistory.count()
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
      const totalSizeQuery =
        prisma.$queryRaw`SELECT SUM(CHAR_LENGTH(details)) as total_size FROM \`sync_history\``;

      const [
        totalRecords,
        manualCount,
        autoCount,
        backgroundCount,
        avgDuration,
        lastRecord,
        totalSizeResult,
      ] = await Promise.all([
        prisma.syncHistory.count(),
        prisma.syncHistory.count({ where: { syncType: "manual" } }),
        prisma.syncHistory.count({ where: { syncType: "automatic" } }),
        prisma.syncHistory.count({ where: { syncType: "background" } }),
        prisma.syncHistory.aggregate({
          _avg: {
            duration: true,
          },
          where: {
            duration: {
              gt: 0,
            },
          },
        }),
        prisma.syncHistory.findFirst({
          orderBy: {
            createdAt: "desc",
          },
        }),
        totalSizeQuery,
      ]);

      const successCount = await prisma.syncHistory.count({
        where: {
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
  async cleanupOldRecords(daysToKeep: number = 30): Promise<number> {
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

      const where = { syncType };
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
