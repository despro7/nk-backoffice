import * as cron from 'node-cron';
import { salesDriveService } from './salesDriveService.js';
import { syncHistoryService } from './syncHistoryService.js';
import { DilovodService } from './dilovod/DilovodService.js';
import { loadDilovodSettingsFromDB } from './dilovod/DilovodUtils.js';
import type { DilovodSyncInterval } from '../../shared/types/dilovod.js';


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

/**
 * Перетворює значення DilovodSyncInterval у рядок cron-виразу.
 * Параметр hour (0-23) використовується для twicedaily/daily/every two days.
 * Параметр minute (0-55, крок 5) використовується для hourly/every two hours.
 * Повертає null якщо синхронізацію вимкнено ('none sync').
 */
function intervalToCronExpression(interval: DilovodSyncInterval, hour: number = 6, minute: number = 0): string | null {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  const m = Math.max(0, Math.min(55, Math.floor(minute / 5) * 5)); // округлення до кратного 5
  // Для twicedaily другий запуск — h+12, з огортанням по 24
  const h2 = (h + 12) % 24;
  switch (interval) {
    case 'none sync':       return null;
    case 'hourly':          return `${m} * * * *`;            // щогодини о :mm
    case 'every two hours': return `${m} */2 * * *`;          // кожні 2 год о :mm
    case 'twicedaily':      return `${m} ${h},${h2} * * *`;  // 2 рази: h:mm та h+12:mm
    case 'daily':           return `${m} ${h} * * *`;         // 1 раз: h:mm
    case 'every two days':  return `${m} ${h} */2 * *`;       // раз на 2 дні о h:mm
    default:                return `${m} ${h},${(h+8)%24},${(h+16)%24} * * *`; // fallback: 3 рази
  }
}

let isCronJobActive = false;

export class CronService {
  private syncJob: cron.ScheduledTask | null = null;
  private productsSyncJob: cron.ScheduledTask | null = null;
  private stockSyncJob: cron.ScheduledTask | null = null;
  private statusCheckJob: cron.ScheduledTask | null = null;
  private warehouseAutoFinalizeJob: cron.ScheduledTask | null = null;
  private isTaskRunning = false;
  private isProductsSyncRunning = false;
  private isStockSyncRunning = false;
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

  async startOrderSync(): Promise<void> {
    if (isCronJobActive) {
      return;
    }

    let cronExpression: string | null;
    let ordersBatchSize = 50;
    let ordersRetryAttempts = 3;
    try {
      const config = await loadDilovodSettingsFromDB();
      cronExpression = intervalToCronExpression(config.ordersInterval, config.ordersHour ?? 5, config.ordersMinute ?? 5);
      ordersBatchSize = config.ordersBatchSize ?? 50;
      ordersRetryAttempts = config.ordersRetryAttempts ?? 3;
    } catch (err) {
      console.error('⚠️  Could not read orders sync settings, using fallback schedule:', err);
      cronExpression = '5 * * * *';
    }

    if (cronExpression === null) {
      console.log('ℹ️  Order sync is disabled (ordersInterval = "none sync"). Cron job not started.');
      isCronJobActive = false;
      return;
    }

    console.log(`🕐 Order sync schedule: "${cronExpression}" (batchSize=${ordersBatchSize}, retryAttempts=${ordersRetryAttempts})`);

    this.syncJob = cron.schedule(cronExpression, async () => {
      if (this.isTaskRunning) {
        console.log('⏳ Previous sync is still running, skipping this scheduled run.');
        return;
      }
      if (await this.isSyncFresh()) {
        return;
      }

      console.log('🕐 Running scheduled order sync...');
      this.isTaskRunning = true;
      let attempt = 0;
      while (attempt <= ordersRetryAttempts) {
        try {
          const startTime = Date.now();
          const result = await salesDriveService.syncOrdersWithDatabase();
          const duration = Date.now() - startTime;
          console.log(`✅ Scheduled sync completed in ${duration}ms: ${result.synced} synced, ${result.errors} errors`);
          break;
        } catch (error) {
          attempt++;
          if (attempt > ordersRetryAttempts) {
            console.error(`❌ Scheduled sync failed after ${ordersRetryAttempts} retries:`, error);
          } else {
            console.warn(`⚠️ Scheduled sync failed (attempt ${attempt}/${ordersRetryAttempts}), retrying...`);
          }
        }
      }
      this.isTaskRunning = false;
    }, {
      timezone: "Europe/Kyiv"
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

  async restartOrderSync(): Promise<void> {
    console.log('🔄 Restarting order sync cron job with updated settings...');
    this.stopOrderSync();
    await this.startOrderSync();
  }

  // ─── Products Sync Job (тільки syncProductsWithDilovod) ──────────────────

  async startProductsSync(): Promise<void> {
    if (this.productsSyncJob) {
      console.log('⚠️  Products sync cron job already running.');
      return;
    }

    let cronExpression: string | null;
    try {
      const config = await loadDilovodSettingsFromDB();
      cronExpression = intervalToCronExpression(config.productsInterval, config.productsHour ?? 6, config.productsMinute ?? 0);
    } catch (err) {
      console.error('⚠️  Could not read Dilovod products sync settings, using fallback schedule:', err);
      cronExpression = '0 6,14,22 * * *';
    }

    if (cronExpression === null) {
      console.log('ℹ️  Products sync is disabled (productsInterval = "none sync"). Cron job not started.');
      return;
    }

    console.log(`🕐 Products sync schedule: "${cronExpression}"`);

    this.productsSyncJob = cron.schedule(cronExpression, async () => {
      if (this.isProductsSyncRunning) {
        console.log('⏳ Previous products sync is still running, skipping this scheduled run.');
        return;
      }

      this.isProductsSyncRunning = true;
      const startTime = Date.now();
      console.log('🕐 [products-sync] Syncing products from Dilovod...');
      try {
        const result = await this.dilovodService.syncProductsWithDilovod();
        const duration = Date.now() - startTime;
        if (result.success) {
          console.log(`✅ [products-sync] Done in ${duration}ms: ${result.syncedProducts} products, ${result.syncedSets} sets`);
        } else {
          console.warn(`⚠️ [products-sync] Completed with errors in ${duration}ms: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ [products-sync] Failed:', error);
      } finally {
        this.isProductsSyncRunning = false;
      }
    }, { timezone: "Europe/Kyiv" });

    this.productsSyncJob.start();
    cronJobsRegistry.add(this.productsSyncJob);
    console.log(`✅ Products sync cron job started (${cronExpression}, Kyiv time).`);
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

  async restartProductsSync(): Promise<void> {
    console.log('🔄 Restarting products sync cron job with updated settings...');
    this.stopProductsSync();
    await this.startProductsSync();
  }

  // ─── Stock Sync Job (залишки → SD export → WP sync) ──────────────────────

  async startStockSync(): Promise<void> {
    if (this.stockSyncJob) {
      console.log('⚠️  Stock sync cron job already running.');
      return;
    }

    let cronExpression: string | null;
    try {
      const config = await loadDilovodSettingsFromDB();
      cronExpression = intervalToCronExpression(config.synchronizationInterval, config.synchronizationHour ?? 6, config.synchronizationMinute ?? 0);
    } catch (err) {
      console.error('⚠️  Could not read Dilovod stock sync settings, using fallback schedule:', err);
      cronExpression = '0 6,18 * * *';
    }

    if (cronExpression === null) {
      console.log('ℹ️  Stock sync is disabled (synchronizationInterval = "none sync"). Cron job not started.');
      return;
    }

    console.log(`🕐 Stock sync schedule: "${cronExpression}"`);

    this.stockSyncJob = cron.schedule(cronExpression, async () => {
      if (this.isStockSyncRunning) {
        console.log('⏳ Previous stock sync is still running, skipping this scheduled run.');
        return;
      }

      this.isStockSyncRunning = true;
      const startTime = Date.now();

      // ── Крок 1: Оновлення залишків з Dilovod ─────────────────────────────
      console.log('🕐 [stock-sync] [1/3] Updating stock balances from Dilovod...');
      try {
        const stockResult = await this.dilovodService.updateStockBalancesInDatabase();
        const duration = Date.now() - startTime;
        if (stockResult.success) {
          console.log(`✅ [stock-sync] [1/3] Stock balances updated in ${duration}ms: ${stockResult.updatedProducts} products`);
        } else {
          console.warn(`⚠️ [stock-sync] [1/3] Stock update had errors in ${duration}ms: ${stockResult.message}`);
        }
      } catch (error) {
        console.error('❌ [stock-sync] [1/3] Stock balances update failed:', error);
        this.isStockSyncRunning = false;
        return;
      }

      // ── Крок 2: Експорт у SalesDrive ─────────────────────────────────────
      console.log('🕐 [stock-sync] [2/3] Exporting products to SalesDrive...');
      let exportedOk = false;
      try {
        const exportResult = await salesDriveService.buildAndExportProducts();
        const duration = Date.now() - startTime;
        if (exportResult.success) {
          exportedOk = true;
          console.log(
            `✅ [stock-sync] [2/3] Products exported to SalesDrive in ${duration}ms: ${exportResult.exported} products, ${exportResult.adjustedCount} stock adjustments`
          );
        } else {
          console.warn(`⚠️ [stock-sync] [2/3] SalesDrive export failed in ${duration}ms:`, exportResult.errors);
        }
      } catch (error) {
        console.error('❌ [stock-sync] [2/3] SalesDrive export failed:', error);
      }

      // ── Крок 3: Тригер синхронізації SD → WordPress ───────────────────────
      if (exportedOk) {
        console.log('🕐 [stock-sync] [3/3] Triggering SD → WP stock sync...');
        try {
          const wpSyncUrl = 'https://nk-food.shop/wp-content/plugins/mrkv-salesdrive/inc/syncStock.php';
          const wpResponse = await fetch(wpSyncUrl, { signal: AbortSignal.timeout(30_000) });
          const duration = Date.now() - startTime;
          if (wpResponse.ok) {
            console.log(`✅ [stock-sync] [3/3] WP stock sync triggered in ${duration}ms (status ${wpResponse.status})`);
          } else {
            console.warn(`⚠️ [stock-sync] [3/3] WP stock sync returned HTTP ${wpResponse.status} in ${duration}ms`);
          }
        } catch (error) {
          console.error('❌ [stock-sync] [3/3] WP stock sync request failed:', error);
        }
      } else {
        console.log('⏭️ [stock-sync] [3/3] Skipping WP stock sync — SalesDrive export was not successful.');
      }

      this.isStockSyncRunning = false;
    }, { timezone: "Europe/Kyiv" });

    this.stockSyncJob.start();
    cronJobsRegistry.add(this.stockSyncJob);
    console.log(`✅ Stock sync cron job started (${cronExpression}, Kyiv time): stock update → SalesDrive export → WP sync.`);
  }

  stopStockSync(): void {
    if (this.stockSyncJob) {
      this.stockSyncJob.stop();
      if (typeof (this.stockSyncJob as any).destroy === 'function') {
        (this.stockSyncJob as any).destroy();
      }
      cronJobsRegistry.delete(this.stockSyncJob);
      this.stockSyncJob = null;
      console.log('🛑 Stock sync cron job stopped.');
    }
  }

  async restartStockSync(): Promise<void> {
    console.log('🔄 Restarting stock sync cron job with updated settings...');
    this.stopStockSync();
    await this.startStockSync();
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
      timezone: "Europe/Kyiv"
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

  getStatus(): {
    isRunning: boolean;
    hasSyncJob: boolean;
    isProductsSyncRunning: boolean;
    hasProductsSyncJob: boolean;
    isStockSyncRunning: boolean;
    hasStockSyncJob: boolean;
    isStatusCheckRunning: boolean;
    hasStatusCheckJob: boolean;
  } {
    return {
      isRunning: this.isTaskRunning,
      hasSyncJob: isCronJobActive,
      isProductsSyncRunning: this.isProductsSyncRunning,
      hasProductsSyncJob: this.productsSyncJob !== null,
      isStockSyncRunning: this.isStockSyncRunning,
      hasStockSyncJob: this.stockSyncJob !== null,
      isStatusCheckRunning: this.isStatusCheckRunning,
      hasStatusCheckJob: this.statusCheckJob !== null,
    };
  }

  startAll(): void {
    void this.startOrderSync();
    void this.startProductsSync();
    void this.startStockSync();
    this.startOrderStatusCheck();
    this.startWarehouseAutoFinalize();
  }

  stopAll(): void {
    this.stopOrderSync();
    this.stopProductsSync();
    this.stopStockSync();
    this.stopOrderStatusCheck();
    this.stopWarehouseAutoFinalize();
  }

  // ─── Warehouse auto-finalize о 23:55 ──────────────────────────────────────

  startWarehouseAutoFinalize(): void {
    if (this.warehouseAutoFinalizeJob) return;

    // 55 23 * * * — щодня о 23:55
    this.warehouseAutoFinalizeJob = cron.schedule('55 23 * * *', async () => {
      console.log('🏭 [CronService] Запуск автофіналізації переміщень (23:55)...');
      try {
        const { warehouseAutoFinalizeService } = await import('../modules/Warehouse/WarehouseAutoFinalizeService.js');
        const result = await warehouseAutoFinalizeService.finalizeActiveMovements();
        console.log(`🏭 [CronService] Автофіналізація завершена: ${result.finalized} фіналізовано, ${result.failed} з помилками.`);
      } catch (err) {
        console.error('🏭 [CronService] Помилка автофіналізації переміщень:', err);
      }
    });

    console.log('🏭 [CronService] Warehouse auto-finalize job запущено (23:55 щодня)');
  }

  stopWarehouseAutoFinalize(): void {
    if (this.warehouseAutoFinalizeJob) {
      this.warehouseAutoFinalizeJob.stop();
      this.warehouseAutoFinalizeJob = null;
    }
  }
}

export const cronService = CronService.getInstance();
