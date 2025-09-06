import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
   * Создает новую запись в истории синхронизаций
   */
  async createSyncRecord(data: CreateSyncHistoryData): Promise<SyncHistoryRecord> {
    try {
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
          details: data.details,
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
  async getSyncHistory(limit: number = 20): Promise<SyncHistoryRecord[]> {
    try {
      const records = await prisma.syncHistory.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        take: limit
      });

      console.log(`📋 [SYNC HISTORY] Retrieved ${records.length} records`);
      return records;
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
  }> {
    try {
      const [totalRecords, manualCount, autoCount, backgroundCount, avgDuration, lastRecord] = await Promise.all([
        prisma.syncHistory.count(),
        prisma.syncHistory.count({ where: { syncType: 'manual' } }),
        prisma.syncHistory.count({ where: { syncType: 'automatic' } }),
        prisma.syncHistory.count({ where: { syncType: 'background' } }),
        prisma.syncHistory.aggregate({
          _avg: {
            duration: true
          }
        }),
        prisma.syncHistory.findFirst({
          orderBy: {
            createdAt: 'desc'
          }
        })
      ]);

      const successCount = await prisma.syncHistory.count({
        where: {
          status: 'success'
        }
      });

      const successRate = totalRecords > 0 ? (successCount / totalRecords) * 100 : 0;

      return {
        totalSyncs: totalRecords,
        manualSyncs: manualCount,
        automaticSyncs: autoCount,
        backgroundSyncs: backgroundCount,
        averageDuration: avgDuration._avg.duration || 0,
        lastSync: lastRecord,
        successRate: Math.round(successRate * 100) / 100
      };
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to get sync statistics:', error);
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
   * Получает записи по типу синхронизации
   */
  async getSyncHistoryByType(syncType: 'manual' | 'automatic' | 'background', limit: number = 10): Promise<SyncHistoryRecord[]> {
    try {
      const records = await prisma.syncHistory.findMany({
        where: {
          syncType: syncType
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit
      });

      console.log(`📋 [SYNC HISTORY] Retrieved ${records.length} ${syncType} records`);
      return records;
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to get sync history by type:', error);
      throw error;
    }
  }
}

export const syncHistoryService = new SyncHistoryService();
