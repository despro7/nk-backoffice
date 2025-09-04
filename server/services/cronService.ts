import * as cron from 'node-cron';
import { salesDriveService } from './salesDriveService.js';

export class CronService {
  private syncJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor() {
    console.log('🕐 CronService initialized');
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

      this.isRunning = true;
      console.log('🕐 Running scheduled order sync...');

      try {
        const startTime = Date.now();

        // Добавляем таймаут на синхронизацию (10 минут максимум)
        const syncPromise = salesDriveService.syncOrdersWithDatabase();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Sync timeout after 10 minutes')), 10 * 60 * 1000);
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
