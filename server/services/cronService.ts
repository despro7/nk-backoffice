import * as cron from 'node-cron';
import { salesDriveService } from './salesDriveService.js';
import { syncHistoryService } from './syncHistoryService.js';
import { DilovodService } from './dilovod/DilovodService.js';


// --- Process-level Cron Job Registry ---
// This registry is stored on the global `process` object to survive Vite's HMR.
// It ensures that we can always find and stop "zombie" cron jobs from previous reloads.
const REGISTRY_KEY = '__NK_FOOD_SHOP_CRON_REGISTRY__';

interface ProcessWithCronRegistry extends NodeJS.Process {
  [REGISTRY_KEY]?: Set<cron.ScheduledTask>;
}

function getProcessLevelCronRegistry(): Set<cron.ScheduledTask> {
  const processWithRegistry = process as ProcessWithCronRegistry;
  if (!processWithRegistry[REGISTRY_KEY]) {
    processWithRegistry[REGISTRY_KEY] = new Set<cron.ScheduledTask>();
    // console.log('✨ Initialized process-level cron job registry.');
  }
  return processWithRegistry[REGISTRY_KEY];
}

const cronJobsRegistry = getProcessLevelCronRegistry();

/**
 * Stops all cron jobs that have been registered in the process-level registry.
 * This is the master function to prevent orphaned cron jobs during HMR.
 */
export function forceStopAllCronJobs(): void {
  if (cronJobsRegistry.size > 0) {
    console.log(`🧹 Stopping ${cronJobsRegistry.size} orphaned cron job(s)...`);
    let stoppedCount = 0;
    for (const job of cronJobsRegistry) {
      try {
        job.stop();
        // .destroy() is not a public method, but it's good practice to call it if it exists
        if (typeof (job as any).destroy === 'function') {
          (job as any).destroy();
        }
        stoppedCount++;
      } catch (e) {
        // Ignore errors, job might have been already stopped.
      }
    }
    cronJobsRegistry.clear();
    console.log(`✅ Stopped ${stoppedCount} job(s).`);
  }
}

// --- Cron Service ---

let isCronJobActive = false;

export class CronService {
  private syncJob: cron.ScheduledTask | null = null;
  private productsSyncJob: cron.ScheduledTask | null = null;
  private statusCheckJob: cron.ScheduledTask | null = null;
  private isTaskRunning = false;
  private isProductsSyncRunning = false;
  private isStatusCheckRunning = false;
  private static instance: CronService | null = null;
  private dilovodService: DilovodService;

  private constructor() {
    // Ensure any jobs from a previous HMR instance are stopped.
    forceStopAllCronJobs();
    this.dilovodService = new DilovodService();
  }

  static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  private async isSyncFresh(): Promise<boolean> {
    try {
      const lastSync = await syncHistoryService.getLastSuccessfulSync();
      if (!lastSync) return false; // Never synced, so it's not "fresh".

      const lastSyncTime = new Date(lastSync.createdAt);
      const now = new Date();
      const diffHours = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

      const isFresh = diffHours < 1;
      if (isFresh) {
        console.log(`⏰ Sync is fresh (last sync was ${Math.round(diffHours * 60)} mins ago), skipping scheduled run.`);
      }
      return isFresh;

    } catch (error) {
      console.error('❌ Error checking sync freshness:', error);
      return false; // Allow sync to run in case of error
    }
  }

  startOrderSync(): void {
    if (isCronJobActive) {
      return;
    }

    // Schedule to run every hour at 5 minutes past the hour.
    this.syncJob = cron.schedule('5 * * * *', async () => {
      if (this.isTaskRunning) {
        console.log('⏳ Previous sync is still running, skipping this scheduled run.');
        return;
      }
      if (await this.isSyncFresh()) {
        return;
      }

      console.log('🕐 Running scheduled order sync...');
      this.isTaskRunning = true;
      try {
        const startTime = Date.now();
        const result = await salesDriveService.syncOrdersWithDatabase();
        const duration = Date.now() - startTime;
        console.log(`✅ Scheduled sync completed in ${duration}ms: ${result.synced} synced, ${result.errors} errors`);
      } catch (error) {
        console.error('❌ Scheduled sync failed:', error);
      } finally {
        this.isTaskRunning = false;
      }
    }, {
      timezone: "Europe/Kiev"
    });

    this.syncJob.start();
    isCronJobActive = true;
    cronJobsRegistry.add(this.syncJob);
    console.log('✅ Order sync cron job started.');
  }

  stopOrderSync(): void {
    if (this.syncJob) {
      this.syncJob.stop();
      // .destroy() is not a public method
      if (typeof (this.syncJob as any).destroy === 'function') {
        (this.syncJob as any).destroy();
      }
      cronJobsRegistry.delete(this.syncJob);
      this.syncJob = null;
      isCronJobActive = false;
      console.log('🛑 Order sync cron job stopped.');
    }
  }

  startProductsSync(): void {
    if (this.productsSyncJob) {
      console.log('⚠️  Products sync cron job already running.');
      return;
    }

    // Синхронізація товарів з Dilovod 3 рази на день: 06:00, 14:00, 22:00 (Київський час)
    this.productsSyncJob = cron.schedule('0 6,14,22 * * *', async () => {
      if (this.isProductsSyncRunning) {
        console.log('⏳ Previous products sync is still running, skipping this scheduled run.');
        return;
      }

      console.log('🕐 Running scheduled products sync from Dilovod...');
      this.isProductsSyncRunning = true;
      try {
        const startTime = Date.now();
        const result = await this.dilovodService.syncProductsWithDilovod();
        const duration = Date.now() - startTime;
        
        if (result.success) {
          console.log(`✅ Scheduled products sync completed in ${duration}ms: ${result.syncedProducts} products synced, ${result.syncedSets} sets`);
        } else {
          console.log(`⚠️  Scheduled products sync completed with errors in ${duration}ms: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ Scheduled products sync failed:', error);
      } finally {
        this.isProductsSyncRunning = false;
      }
    }, {
      timezone: "Europe/Kiev"
    });

    this.productsSyncJob.start();
    cronJobsRegistry.add(this.productsSyncJob);
    console.log('✅ Products sync cron job started (06:00, 14:00, 22:00 Kyiv time).');
  }

  stopProductsSync(): void {
    if (this.productsSyncJob) {
      this.productsSyncJob.stop();
      if (typeof (this.productsSyncJob as any).destroy === 'function') {
        (this.productsSyncJob as any).destroy();
      }
      cronJobsRegistry.delete(this.productsSyncJob);
      this.productsSyncJob = null;
      console.log('🛑 Products sync cron job stopped.');
    }
  }

  /**
   * Запускає періодичну перевірку статусів замовлень у Dilovod
   * (для замовлень без ID, до 100 за раз)
   */
  startOrderStatusCheck(): void {
    if (this.statusCheckJob) {
      console.log('⚠️ Status check cron job already running.');
      return;
    }

    // Запуск кожну годину о 30 хвилині (щоб не перетинатися з основним синхроном)
    this.statusCheckJob = cron.schedule('30 * * * *', async () => {
      if (this.isStatusCheckRunning) {
        console.log('⏳ Previous status check is still running, skipping.');
        return;
      }

      console.log('🕐 Running scheduled order status check in Dilovod (limit: 100)...');
      this.isStatusCheckRunning = true;

      try {
        const startTime = Date.now();
        // Викликаємо метод безпосередньо через DilovodService
        const result = await this.dilovodService.checkOrderStatuses(100);
        const duration = Date.now() - startTime;
        
        if (result.success) {
          console.log(`✅ Scheduled status check completed in ${duration}ms: ${result.updatedCount} orders updated`);
        } else {
          console.log(`⚠️  Scheduled status check completed with errors in ${duration}ms: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ Scheduled status check failed:', error);
      } finally {
        this.isStatusCheckRunning = false;
      }
    }, {
      timezone: "Europe/Kiev"
    });

    this.statusCheckJob.start();
    cronJobsRegistry.add(this.statusCheckJob);
    console.log('✅ Order status check cron job started (hourly).');
  }

  stopOrderStatusCheck(): void {
    if (this.statusCheckJob) {
      this.statusCheckJob.stop();
      if (typeof (this.statusCheckJob as any).destroy === 'function') {
        (this.statusCheckJob as any).destroy();
      }
      cronJobsRegistry.delete(this.statusCheckJob);
      this.statusCheckJob = null;
      console.log('🛑 Order status check cron job stopped.');
    }
  }

  getStatus(): { isRunning: boolean; hasSyncJob: boolean; isProductsSyncRunning: boolean; hasProductsSyncJob: boolean; isStatusCheckRunning: boolean; hasStatusCheckJob: boolean } {
    return {
      isRunning: this.isTaskRunning,
      hasSyncJob: isCronJobActive,
      isProductsSyncRunning: this.isProductsSyncRunning,
      hasProductsSyncJob: this.productsSyncJob !== null,
      isStatusCheckRunning: this.isStatusCheckRunning,
      hasStatusCheckJob: this.statusCheckJob !== null,
    };
  }

  startAll(): void {
    this.startOrderSync();
    this.startProductsSync();
    this.startOrderStatusCheck();
  }

  stopAll(): void {
    this.stopOrderSync();
    this.stopProductsSync();
    this.stopOrderStatusCheck();
  }
}

export const cronService = CronService.getInstance();
