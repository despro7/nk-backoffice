import { KYIV_TZ } from '@shared/utils/kyivDateTime';
import type { InventoryWarehouseScope } from '@shared/types/inventoryWarehouse';
import { parseInventoryWarehouseScope } from '@shared/types/inventoryWarehouse';
import { resolveInventorySessionWarehouseScope } from '@shared/utils/inventorySessionWarehouse';
import type { InventorySession } from './WarehouseInventoryTypes';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Визначає scope сесії (для старих записів без warehouse=gp). */
export function resolveSessionWarehouseScope(session: InventorySession): InventoryWarehouseScope {
  return resolveInventorySessionWarehouseScope(session.warehouse, session.items ?? []);
}

function sessionEffectiveTime(session: InventorySession): number {
  const raw = session.inventoryDate ?? session.createdAt;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function kyivCalendarDayKey(session: InventorySession): string {
  const raw = session.inventoryDate ?? session.createdAt;
  const d = new Date(raw);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export type InventoryHistoryDisplayEntry =
  | { kind: 'single'; session: InventorySession }
  | {
      kind: 'group';
      msSession: InventorySession;
      gpSession: InventorySession;
      /** Для сортування / відображення діапазону */
      sortTime: number;
    };

/**
 * Групує завершені сесії МС+ГП одного дня (Kyiv), якщо різниця часу ≤ 2 год.
 * Без змін у БД — лише відображення в історії.
 */
export function buildInventoryHistoryDisplayEntries(sessions: InventorySession[]): InventoryHistoryDisplayEntry[] {
  const completed = sessions.filter((s) => s.status === 'completed');
  const other = sessions.filter((s) => s.status !== 'completed');

  const byDay = new Map<string, InventorySession[]>();
  for (const s of completed) {
    const key = kyivCalendarDayKey(s);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  const groupedSessionIds = new Set<string>();
  const groupEntries: InventoryHistoryDisplayEntry[] = [];

  for (const daySessions of byDay.values()) {
    const smallPool = daySessions
      .filter((s) => resolveSessionWarehouseScope(s) === 'small')
      .sort((a, b) => sessionEffectiveTime(a) - sessionEffectiveTime(b));
    const gpPool = daySessions
      .filter((s) => resolveSessionWarehouseScope(s) === 'gp')
      .sort((a, b) => sessionEffectiveTime(a) - sessionEffectiveTime(b));

    const usedGp = new Set<string>();

    for (const ms of smallPool) {
      const msTime = sessionEffectiveTime(ms);
      let bestGp: InventorySession | null = null;
      let bestDelta = Infinity;

      for (const gp of gpPool) {
        if (usedGp.has(gp.id)) continue;
        const delta = Math.abs(sessionEffectiveTime(gp) - msTime);
        if (delta <= TWO_HOURS_MS && delta < bestDelta) {
          bestDelta = delta;
          bestGp = gp;
        }
      }

      if (bestGp) {
        usedGp.add(bestGp.id);
        groupedSessionIds.add(ms.id);
        groupedSessionIds.add(bestGp.id);
        groupEntries.push({
          kind: 'group',
          msSession: ms,
          gpSession: bestGp,
          sortTime: Math.max(msTime, sessionEffectiveTime(bestGp)),
        });
      }
    }
  }

  const singlesFromCompleted = completed
    .filter((s) => !groupedSessionIds.has(s.id))
    .map((s) => ({ kind: 'single' as const, session: s }));

  const singlesFromOther = other.map((s) => ({ kind: 'single' as const, session: s }));

  const all = [...groupEntries, ...singlesFromCompleted, ...singlesFromOther];
  all.sort((a, b) => {
    const ta = a.kind === 'group' ? a.sortTime : sessionEffectiveTime(a.session);
    const tb = b.kind === 'group' ? b.sortTime : sessionEffectiveTime(b.session);
    return tb - ta;
  });

  return all;
}

export function parseSessionWarehouseFromApi(value: unknown): InventoryWarehouseScope {
  return parseInventoryWarehouseScope(value);
}
