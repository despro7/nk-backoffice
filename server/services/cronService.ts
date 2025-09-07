import * as cron from 'node-cron';
import { salesDriveService } from './salesDriveService.js';
import { syncHistoryService } from './syncHistoryService.js';

export class CronService {
  private syncJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor() {
    console.log('🕐 CronService initialized');
  }

  /**
   * Проверяет, была ли последняя успешная синхронизация менее часа назад
   */
  private async isSyncFresh(): Promise<boolean> {
    try {
      const lastSync = await syncHistoryService.getLastSuccessfulSync();
      if (!lastSync) {
        console.log('🔄 [FRESHNESS] No previous sync found, allowing sync');
        return false; // Нет предыдущей синхронизации, можно запускать
      }

      const lastSyncTime = new Date(lastSync.createdAt);
      const now = new Date();
      const diffHours = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

      if (diffHours < 1) {
        console.log(`⏰ [FRESHNESS] Last sync was ${Math.round(diffHours * 60)} minutes ago, skipping (less than 1 hour)`);
        return true; // Синхронизация свежая, пропускаем
      }

      console.log(`🔄 [FRESHNESS] Last sync was ${Math.round(diffHours)} hours ago, allowing sync`);
      return false; // Прошло больше часа, можно запускать
    } catch (error) {
      console.error('❌ [FRESHNESS] Error checking sync freshness:', error);
      return false; // В случае ошибки разрешаем синхронизацию
    }
  }

  /**
   * Запускает автоматическую синхронизацию заказов каждый час
   */
  startOrderSync(): void {
    if (this.syncJob) {
      console.log('⚠️ Order sync cron job already running');
      return;
    }

    // Запуск каждый час в минута 5 (чтобы избежать нагрузки в начале часа)
    this.syncJob = cron.schedule('5 * * * *', async () => {
      if (this.isRunning) {
        console.log('⏳ Previous sync still running, skipping...');
        return;
      }

      // Проверяем свежесть последней синхронизации
      const isFresh = await this.isSyncFresh();
      if (isFresh) {
        console.log('⏰ [FRESHNESS] Skipping scheduled sync - last sync was less than 1 hour ago');
        console.log('⏰ [FRESHNESS] Next sync attempt in 1 hour');
        return;
      }

      console.log('✅ [FRESHNESS] Sync allowed - proceeding with synchronization');

      this.isRunning = true;
      console.log('🕐 Running scheduled order sync...');

      try {
        const startTime = Date.now();

        // Добавляем таймаут на синхронизацию (15 минут максимум для более надежной работы)
        const syncPromise = salesDriveService.syncOrdersWithDatabase();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Sync timeout after 15 minutes')), 15 * 60 * 1000);
        });

        const result = await Promise.race([syncPromise, timeoutPromise]) as { success: boolean; synced: number; errors: number; details: any[] };
        const duration = Date.now() - startTime;

        console.log(`✅ Scheduled sync completed in ${duration}ms: ${result.synced} synced, ${result.errors} errors`);

        if (result.errors > 0) {
          console.warn(`⚠️ Sync completed with ${result.errors} errors`);
        }
      } catch (error) {
        console.error('❌ Scheduled sync failed:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      timezone: "Europe/Kiev"
    });

    this.syncJob.start();
    console.log('✅ Order sync cron job started (every hour at minute 5)');
  }

  /**
   * Останавливает автоматическую синхронизацию
   */
  stopOrderSync(): void {
    if (this.syncJob) {
      this.syncJob.stop();
      this.syncJob.destroy();
      this.syncJob = null;
      console.log('🛑 Order sync cron job stopped');
    }
  }

  /**
   * Получает статус cron-задач
   */
  getStatus(): { isRunning: boolean; hasSyncJob: boolean } {
    return {
      isRunning: this.isRunning,
      hasSyncJob: this.syncJob !== null
    };
  }

  /**
   * Запускает все cron-задачи
   */
  startAll(): void {
    this.startOrderSync();
  }

  /**
   * Останавливает все cron-задачи
   */
  stopAll(): void {
    this.stopOrderSync();
  }
}

export const cronService = new CronService();
