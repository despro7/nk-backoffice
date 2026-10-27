import type { InventoryProduct, InventorySession } from './WarehouseInventoryTypes';
import {
  buildInventoryGroupStatusMarks as buildInventoryGroupStatusMarksShared,
  buildInventoryHistoryDisplayEntries as buildInventoryHistoryDisplayEntriesShared,
  mergeInventoryGroupItems as mergeInventoryGroupItemsShared,
  parseSessionWarehouseFromApi,
  resolveSessionWarehouseScope,
  type InventoryGroupStatusMark,
} from '@shared/utils/inventoryHistoryGroups';

export type { InventoryGroupStatusMark };

export type InventoryHistoryDisplayEntry =
  | { kind: 'single'; session: InventorySession }
  | {
      kind: 'group';
      msSession: InventorySession;
      gpSession: InventorySession;
      sortTime: number;
    };

export { parseSessionWarehouseFromApi, resolveSessionWarehouseScope };

function toSharedSession(session: InventorySession) {
  return { ...session, id: String(session.id) };
}

export function buildInventoryHistoryDisplayEntries(sessions: InventorySession[]): InventoryHistoryDisplayEntry[] {
  const byId = new Map(sessions.map((s) => [String(s.id), s]));
  const raw = buildInventoryHistoryDisplayEntriesShared(sessions.map(toSharedSession));
  const mapped: InventoryHistoryDisplayEntry[] = [];

  for (const entry of raw) {
    if (entry.kind === 'single') {
      const session = byId.get(entry.session.id);
      if (session) mapped.push({ kind: 'single', session });
      continue;
    }
    const msSession = byId.get(entry.msSession.id);
    const gpSession = byId.get(entry.gpSession.id);
    if (msSession && gpSession) {
      mapped.push({
        kind: 'group',
        msSession,
        gpSession,
        sortTime: entry.sortTime,
      });
    }
  }

  return mapped;
}

export function buildInventoryGroupStatusMarks(
  msSession: InventorySession,
  gpSession: InventorySession,
): InventoryGroupStatusMark[] {
  return buildInventoryGroupStatusMarksShared(toSharedSession(msSession), toSharedSession(gpSession));
}

export function mergeInventoryGroupItems(msSession: InventorySession, gpSession: InventorySession): InventoryProduct[] {
  return mergeInventoryGroupItemsShared(toSharedSession(msSession), toSharedSession(gpSession)) as InventoryProduct[];
}
