import {
  formatDilovodHistoryFromDateDaysAgo,
  WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS,
} from '../../../shared/types/warehouseGoodDocument.js';
import { prisma } from '../../lib/utils.js';
import { MovementHistoryService } from './MovementHistoryService.js';
import type { MovementHistoryListQuery } from './movementV2HistoryList.js';
import {
  countMovementHistory,
  getMovementHistoryPageDilovodIds,
  movementItemsFromRow,
  movementRowHasStoredItems,
} from './movementV2HistoryList.js';
import { normalizeItemsArray, safeParseItems } from './historyNormalize.js';

export const WAREHOUSE_MOVEMENT_HISTORY_LAST_FULL_SYNC_KEY = 'movement_history_last_full_sync';

export type MovementHistorySyncOptions = {
  fromDate?: string;
  toDate?: string;
  listQuery?: MovementHistoryListQuery;
  forceFullList?: boolean;
};

function todayDateKeyKyiv(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

async function getLastFullListSyncDate(): Promise<string | null> {
  try {
    const setting = await prisma.settingsBase.findUnique({
      where: { key: WAREHOUSE_MOVEMENT_HISTORY_LAST_FULL_SYNC_KEY },
    });
    return setting?.value?.trim() || null;
  } catch {
    return null;
  }
}

async function markFullListSyncedToday(): Promise<void> {
  const value = todayDateKeyKyiv();
  try {
    await prisma.settingsBase.upsert({
      where: { key: WAREHOUSE_MOVEMENT_HISTORY_LAST_FULL_SYNC_KEY },
      create: {
        key: WAREHOUSE_MOVEMENT_HISTORY_LAST_FULL_SYNC_KEY,
        value,
        category: 'warehouse',
        description: 'Дата останнього повного списку goodMoving з Dilovod (YYYY-MM-DD, Europe/Kyiv)',
      },
      update: { value },
    });
  } catch (error) {
    console.warn('[MovementV2HistorySync] mark full sync failed:', error);
  }
}

async function shouldRunFullListSync(force: boolean): Promise<boolean> {
  if (force) return true;
  const localCount = await countMovementHistory('active');
  if (localCount === 0) return true;
  const last = await getLastFullListSyncDate();
  if (!last) return true;
  return last < todayDateKeyKyiv();
}

export class MovementV2HistorySync {
  /**
   * Синхронізує шапки goodMoving з Dilovod (без getObject / tpGoods).
   * Повний список — не частіше раз на день; інакше — лише id поточної сторінки.
   */
  static async sync(options?: MovementHistorySyncOptions): Promise<{ upserted: number; mode: 'fullList' | 'pageHeaders' | 'skipped' }> {
    const runFullList = await shouldRunFullListSync(options?.forceFullList === true);

    if (runFullList) {
      const fromDate = options?.fromDate
        ? `${options.fromDate} 00:00:00`
        : formatDilovodHistoryFromDateDaysAgo(WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS);
      const toDate = options?.toDate ? `${options.toDate} 23:59:59` : undefined;
      const count = await MovementHistoryService.syncHeadersFromDilovod({
        fromDate,
        toDate,
      });
      await markFullListSyncedToday();
      console.log(`[MovementV2HistorySync] full list: ${count} headers`);
      return { upserted: count, mode: 'fullList' };
    }

    if (options?.listQuery) {
      const pageIds = await getMovementHistoryPageDilovodIds(options.listQuery);
      const count = await MovementHistoryService.syncHeadersByDilovodIds(pageIds);
      console.log(`[MovementV2HistorySync] page headers: ${count} docs`);
      return { upserted: count, mode: 'pageHeaders' };
    }

    console.log('[MovementV2HistorySync] skip Dilovod (full list already synced today)');
    return { upserted: 0, mode: 'skipped' };
  }

  /** tpGoods: кеш у warehouse_movement.items → getObject Dilovod */
  static async loadDetails(
    historyId: number,
    options?: { force?: boolean },
  ): Promise<{ items: unknown[]; itemsNormalized: ReturnType<typeof normalizeItemsArray>; fromCache: boolean }> {
    const force = options?.force === true;
    const existing = await prisma.warehouseMovement.findUnique({ where: { id: historyId } });
    if (!existing) {
      throw new Error('Запис переміщення не знайдено');
    }

    if (!force && movementRowHasStoredItems(existing.items)) {
      const { items, itemsNormalized } = movementItemsFromRow(existing.items);
      return { items, itemsNormalized, fromCache: true };
    }

    const dilovodDocId = String(existing.dilovodDocId ?? '').trim();
    if (!dilovodDocId) {
      const { items, itemsNormalized } = movementItemsFromRow(existing.items);
      return { items, itemsNormalized, fromCache: true };
    }

    await MovementHistoryService.getMovementDetails(dilovodDocId);

    const updated = await prisma.warehouseMovement.findUnique({
      where: { id: historyId },
      select: { items: true },
    });
    const { items, itemsNormalized } = movementItemsFromRow(updated?.items);
    return { items, itemsNormalized, fromCache: false };
  }
}

export const movementV2HistorySyncService = {
  sync: (options?: MovementHistorySyncOptions) => MovementV2HistorySync.sync(options),
  loadDetails: (historyId: number, options?: { force?: boolean }) =>
    MovementV2HistorySync.loadDetails(historyId, options),
};
