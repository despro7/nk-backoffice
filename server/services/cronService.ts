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

    // Синхронізація товарів і залишків з Dilovod, потім одразу експорт у SalesDrive
    // 3 рази на день: 06:00, 14:00, 22:00 (Київський час)
    this.productsSyncJob = cron.schedule('0 6,14,22 * * *', async () => {
      if (this.isProductsSyncRunning) {
        console.log('⏳ Previous products sync is still running, skipping this scheduled run.');
        return;
      }

      this.isProductsSyncRunning = true;
      const startTime = Date.now();

      // ── Крок 1: Синхронізація товарів з Dilovod ──────────────────────────
      console.log('🕐 [1/3] Running scheduled products sync from Dilovod...');
      try {
        const result = await this.dilovodService.syncProductsWithDilovod();
        const duration = Date.now() - startTime;
        if (result.success) {
          console.log(`✅ [1/3] Products sync completed in ${duration}ms: ${result.syncedProducts} products, ${result.syncedSets} sets`);
        } else {
          console.warn(`⚠️ [1/3] Products sync completed with errors in ${duration}ms: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ [1/3] Products sync failed:', error);
        this.isProductsSyncRunning = false;
        return; // Не продовжуємо без актуальних даних
      }

      // ── Крок 2: Оновлення залишків з Dilovod ─────────────────────────────
      console.log('🕐 [2/3] Updating stock balances from Dilovod...');
      try {
        const stockResult = await this.dilovodService.updateStockBalancesInDatabase();
        const duration = Date.now() - startTime;
        if (stockResult.success) {
          console.log(`✅ [2/3] Stock balances updated in ${duration}ms: ${stockResult.updatedProducts} products`);
        } else {
          console.warn(`⚠️ [2/3] Stock balances update had errors in ${duration}ms: ${stockResult.message}`);
          // Продовжуємо — часткове оновлення краще ніж не оновлювати зовсім
        }
      } catch (error) {
        console.error('❌ [2/3] Stock balances update failed:', error);
        // Продовжуємо — краще відправити трохи застарілі залишки, ніж не відправляти зовсім
      }

      // ── Крок 3: Експорт товарів і скоригованих залишків у SalesDrive ─────
      console.log('🕐 [3/4] Exporting products to SalesDrive...');
      let exportedOk = false;
      try {
        const exportResult = await salesDriveService.buildAndExportProducts();
        const duration = Date.now() - startTime;
        if (exportResult.success) {
          exportedOk = true;
          console.log(
            `✅ [3/4] Products exported to SalesDrive in ${duration}ms: ${exportResult.exported} products, ${exportResult.adjustedCount} stock adjustments`
          );
        } else {
          console.warn(`⚠️ [3/4] SalesDrive export failed in ${duration}ms:`, exportResult.errors);
        }
      } catch (error) {
        console.error('❌ [3/4] SalesDrive export failed:', error);
      }

      // ── Крок 4: Тригер синхронізації залишків SD → WordPress ─────────────
      if (exportedOk) {
        console.log('🕐 [4/4] Triggering SD → WP stock sync...');
        try {
          const wpSyncUrl = 'https://nk-food.shop/wp-content/plugins/mrkv-salesdrive/inc/syncStock.php';
          const wpResponse = await fetch(wpSyncUrl, { signal: AbortSignal.timeout(30_000) });
          const duration = Date.now() - startTime;
          if (wpResponse.ok) {
            console.log(`✅ [4/4] WP stock sync triggered in ${duration}ms (status ${wpResponse.status})`);
          } else {
            console.warn(`⚠️ [4/4] WP stock sync returned HTTP ${wpResponse.status} in ${duration}ms`);
          }
        } catch (error) {
          console.error('❌ [4/4] WP stock sync request failed:', error);
        }
      } else {
        console.log('⏭️ [4/4] Skipping WP stock sync — SalesDrive export was not successful.');
      }

      this.isProductsSyncRunning = false;
    }, {
      timezone: "Europe/Kiev"
    });

    this.productsSyncJob.start();
    cronJobsRegistry.add(this.productsSyncJob);
    console.log('✅ Products sync+export cron job started (06:00, 14:00, 22:00 Kyiv time): sync → stock update → SalesDrive export.');
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
