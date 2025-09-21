import * as cron from 'node-cron';
import { salesDriveService } from './salesDriveService.js';
import { syncHistoryService } from './syncHistoryService.js';


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
  private isTaskRunning = false;
  private static instance: CronService | null = null;

  private constructor() {
    // Ensure any jobs from a previous HMR instance are stopped.
    forceStopAllCronJobs();
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

  getStatus(): { isRunning: boolean; hasSyncJob: boolean } {
    return {
      isRunning: this.isTaskRunning,
      hasSyncJob: isCronJobActive,
    };
  }

  startAll(): void {
    this.startOrderSync();
  }

  stopAll(): void {
    this.stopOrderSync();
  }
}

export const cronService = CronService.getInstance();
