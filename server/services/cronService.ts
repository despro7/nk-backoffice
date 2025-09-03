import * as cron from 'node-cron';
import { salesDriveService } from './salesDriveService';

export class CronService {
  private syncJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor() {
    console.log('🕐 CronService initialized');
  }

  /**
   * Запускает автоматическую синхронизацию заказов каждые 5 минут
   */
  startOrderSync(): void {
    if (this.syncJob) {
      console.log('⚠️ Order sync cron job already running');
      return;
    }

    // Запуск каждые 5 минут
    this.syncJob = cron.schedule('*/60 * * * *', async () => {
      if (this.isRunning) {
        console.log('⏳ Previous sync still running, skipping...');
        return;
      }

      this.isRunning = true;
      console.log('🕐 Running scheduled order sync...');
      
      try {
        const startTime = Date.now();
        const result = await salesDriveService.syncOrdersWithDatabase();
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
    console.log('✅ Order sync cron job started (every 60 minutes)');
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
