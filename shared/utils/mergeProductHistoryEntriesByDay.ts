import {
  buildInventoryHistoryDisplayEntries,
  kyivCalendarDayKeyFromSession,
  mergeInventoryGroupItems,
  resolveSessionWarehouseScope,
  sessionEffectiveTime,
  type InventoryHistoryDisplayEntry,
  type InventoryHistoryItemLike,
  type InventoryHistorySessionLike,
} from './inventoryHistoryGroups.js';
import { normalizeInventoryItemForScope } from './inventorySessionWarehouse.js';
import {
  finalizeProductHistoryBalanceLayer,
  overlayProductHistoryBalanceLayers,
  productHistoryBalanceLayerFromItem,
  type ProductHistoryBalanceLayer,
  type ProductHistoryBalanceSnapshot,
} from './inventoryProductHistoryBalance.js';

export type InventoryProductHistorySessionInput = InventoryHistorySessionLike & {
  id: string;
};

function displayEntrySortTime(entry: InventoryHistoryDisplayEntry): number {
  return entry.kind === 'group' ? entry.sortTime : sessionEffectiveTime(entry.session);
}

function findSkuItem(items: InventoryHistoryItemLike[], sku: string): InventoryHistoryItemLike | undefined {
  const normalized = String(sku).trim();
  return items.find((it) => it && String(it.sku).trim() === normalized);
}

function balanceLayerForDisplayEntry(
  entry: InventoryHistoryDisplayEntry,
  sku: string,
): ProductHistoryBalanceLayer | null {
  if (entry.kind === 'group') {
    const merged = mergeInventoryGroupItems(entry.msSession, entry.gpSession);
    const item = findSkuItem(merged, sku);
    if (!item) return null;
    return productHistoryBalanceLayerFromItem(item, 'both');
  }

  const scope = resolveSessionWarehouseScope(entry.session);
  const raw = findSkuItem(entry.session.items ?? [], sku);
  if (!raw) return null;
  const item = normalizeInventoryItemForScope(raw, scope);
  return productHistoryBalanceLayerFromItem(item, scope);
}

function mergeSessionsForSkuOnDay(
  sku: string,
  sessionsOnDay: InventoryProductHistorySessionInput[],
): Omit<ProductHistoryBalanceSnapshot, 'sessionId'> & { sessionId: number; latestSessionId: number } | null {
  if (sessionsOnDay.length === 0) return null;

  const displayEntries = buildInventoryHistoryDisplayEntries(sessionsOnDay);
  const ordered = [...displayEntries].sort((a, b) => displayEntrySortTime(a) - displayEntrySortTime(b));

  let mergedLayer: ProductHistoryBalanceLayer | null = null;
  let latestTime = 0;
  let latestSessionId = Number(sessionsOnDay[0]?.id) || 0;
  let latestDateIso = new Date(sessionsOnDay[0]?.inventoryDate ?? sessionsOnDay[0]?.createdAt ?? 0).toISOString();
  const dayKey = kyivCalendarDayKeyFromSession(sessionsOnDay[0]);

  for (const entry of ordered) {
    const layer = balanceLayerForDisplayEntry(entry, sku);
    if (!layer) continue;
    mergedLayer = overlayProductHistoryBalanceLayers(mergedLayer, layer);

    const entryTime = displayEntrySortTime(entry);
    if (entryTime >= latestTime) {
      latestTime = entryTime;
      if (entry.kind === 'group') {
        latestSessionId = Math.max(Number(entry.gpSession.id), Number(entry.msSession.id));
        latestDateIso = new Date(
          Math.max(
            new Date(entry.gpSession.inventoryDate ?? entry.gpSession.createdAt).getTime(),
            new Date(entry.msSession.inventoryDate ?? entry.msSession.createdAt).getTime(),
          ),
        ).toISOString();
      } else {
        latestSessionId = Number(entry.session.id);
        latestDateIso = new Date(entry.session.inventoryDate ?? entry.session.createdAt).toISOString();
      }
    }
  }

  if (!mergedLayer) return null;

  const finalized = finalizeProductHistoryBalanceLayer(mergedLayer);
  return {
    ...finalized,
    sessionId: latestSessionId,
    latestSessionId,
    date: latestDateIso,
    dayKey,
  };
}

/**
 * Один рядок на календарний день (Kyiv) для SKU: зведення МС+ГП як у зведеній інвентаризації.
 */
export function buildProductHistoryBalanceSnapshotsByDay(
  sku: string,
  sessions: InventoryProductHistorySessionInput[],
): ProductHistoryBalanceSnapshot[] {
  const normalizedSku = String(sku).trim();
  const withSku: InventoryProductHistorySessionInput[] = [];

  for (const session of sessions) {
    const item = findSkuItem(session.items ?? [], normalizedSku);
    if (item) withSku.push(session);
  }

  const byDay = new Map<string, InventoryProductHistorySessionInput[]>();
  for (const session of withSku) {
    const key = kyivCalendarDayKeyFromSession(session);
    const list = byDay.get(key) ?? [];
    list.push(session);
    byDay.set(key, list);
  }

  const snapshots: ProductHistoryBalanceSnapshot[] = [];
  for (const [, daySessions] of byDay) {
    const merged = mergeSessionsForSkuOnDay(normalizedSku, daySessions);
    if (!merged) continue;
    snapshots.push({
      sessionId: merged.sessionId,
      dayKey: merged.dayKey,
      date: merged.date,
      systemBalance: merged.systemBalance ?? null,
      actual: merged.actual ?? null,
      deviation: merged.deviation ?? null,
      systemBalanceGp: merged.systemBalanceGp ?? null,
      actualGp: merged.actualGp ?? null,
      deviationGp: merged.deviationGp ?? null,
      systemBalanceGpBoxCount: merged.systemBalanceGpBoxCount ?? null,
      systemBalanceGpActualCount: merged.systemBalanceGpActualCount ?? null,
      actualGpBoxCount: merged.actualGpBoxCount ?? null,
      actualGpActualCount: merged.actualGpActualCount ?? null,
    });
  }

  snapshots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return snapshots;
}
