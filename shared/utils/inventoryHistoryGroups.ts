import { KYIV_TZ } from './kyivDateTime.js';
import type { InventoryWarehouseScope } from '../types/inventoryWarehouse.js';
import { parseInventoryWarehouseScope } from '../types/inventoryWarehouse.js';
import {
  normalizeInventoryItemForScope,
  resolveInventorySessionWarehouseScope,
} from './inventorySessionWarehouse.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export type InventoryHistoryItemLike = {
  sku: string;
  name?: string;
  id?: string;
  unit?: string;
  portionsPerBox?: number;
  systemBalance?: number;
  actualCount?: number | null;
  boxCount?: number | null;
  systemBalanceGp?: number;
  actualCountGp?: number | null;
  boxCountGp?: number | null;
  checked?: boolean;
  componentsSnapshot?: unknown[];
  isOutdated?: boolean;
};

export type InventoryHistorySessionLike = {
  id: string;
  inventoryDate?: string | Date | null;
  createdAt: string | Date;
  warehouse?: unknown;
  status?: string;
  items?: InventoryHistoryItemLike[];
};

export function resolveSessionWarehouseScope(session: InventoryHistorySessionLike): InventoryWarehouseScope {
  return resolveInventorySessionWarehouseScope(session.warehouse, session.items ?? []);
}

export function sessionEffectiveTime(session: InventoryHistorySessionLike): number {
  const raw = session.inventoryDate ?? session.createdAt;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function kyivCalendarDayKeyFromDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function kyivCalendarDayKeyFromSession(session: InventoryHistorySessionLike): string {
  const raw = session.inventoryDate ?? session.createdAt;
  return kyivCalendarDayKeyFromDate(new Date(raw));
}

export type InventoryHistoryDisplayEntry =
  | { kind: 'single'; session: InventoryHistorySessionLike }
  | {
      kind: 'group';
      msSession: InventoryHistorySessionLike;
      gpSession: InventoryHistorySessionLike;
      sortTime: number;
    };

/**
 * Групує сесії МС+ГП одного дня (Kyiv), якщо різниця часу ≤ 2 год.
 */
export function buildInventoryHistoryDisplayEntries(
  sessions: InventoryHistorySessionLike[],
): InventoryHistoryDisplayEntry[] {
  const byDay = new Map<string, InventoryHistorySessionLike[]>();
  for (const s of sessions) {
    const key = kyivCalendarDayKeyFromSession(s);
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
      const msDayKey = kyivCalendarDayKeyFromSession(ms);
      let bestGp: InventoryHistorySessionLike | null = null;
      let bestDelta = Infinity;

      for (const gp of gpPool) {
        if (usedGp.has(gp.id)) continue;
        if (kyivCalendarDayKeyFromSession(gp) !== msDayKey) continue;
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

  const singles = sessions
    .filter((s) => !groupedSessionIds.has(s.id))
    .map((s) => ({ kind: 'single' as const, session: s }));

  const all: InventoryHistoryDisplayEntry[] = [...groupEntries, ...singles];
  all.sort((a, b) => {
    const ta = a.kind === 'group' ? a.sortTime : sessionEffectiveTime(a.session);
    const tb = b.kind === 'group' ? b.sortTime : sessionEffectiveTime(b.session);
    return tb - ta;
  });

  return all;
}

const GROUP_STATUS_TEXT: Record<string, string> = {
  draft: 'Чернетка',
  in_progress: 'В процесі',
  completed: 'Завершена',
  revising: 'Редагується',
  removed: 'Видалена',
};

export interface InventoryGroupStatusMark {
  status: string;
  label: string;
}

function warehouseStatusPhrase(sides: { ms: boolean; gp: boolean }): string {
  if (sides.ms && sides.gp) return 'МС і ГП';
  if (sides.ms) return 'МС';
  return 'ГП';
}

export function buildInventoryGroupStatusMarks(
  msSession: InventoryHistorySessionLike,
  gpSession: InventoryHistorySessionLike,
): InventoryGroupStatusMark[] {
  const byStatus = new Map<string, { ms: boolean; gp: boolean }>();
  const add = (status: string, side: 'ms' | 'gp') => {
    const current = byStatus.get(status) ?? { ms: false, gp: false };
    current[side] = true;
    byStatus.set(status, current);
  };
  add(msSession.status ?? 'completed', 'ms');
  add(gpSession.status ?? 'completed', 'gp');

  const notable = [...byStatus.entries()].filter(([status]) => status !== 'completed');
  const source = notable.length > 0 ? notable : [...byStatus.entries()];

  return source.map(([status, sides]) => ({
    status,
    label: status === 'completed'
      ? GROUP_STATUS_TEXT.completed
      : `${GROUP_STATUS_TEXT[status] ?? status} - ${warehouseStatusPhrase(sides)}`,
  }));
}

/**
 * Зводить позиції пари МС+ГП: облік і факт МС — із сесії МС, ГП — із сесії ГП.
 */
export function mergeInventoryGroupItems(
  msSession: InventoryHistorySessionLike,
  gpSession: InventoryHistorySessionLike,
): InventoryHistoryItemLike[] {
  const bySku = new Map<string, InventoryHistoryItemLike>();

  for (const raw of msSession.items ?? []) {
    bySku.set(raw.sku, {
      ...raw,
      systemBalanceGp: 0,
      actualCountGp: null,
      boxCountGp: null,
    });
  }

  for (const raw of gpSession.items ?? []) {
    const item = normalizeInventoryItemForScope(raw, 'gp');
    const gpFields = {
      systemBalanceGp: item.systemBalanceGp ?? 0,
      actualCountGp: item.actualCountGp ?? null,
      boxCountGp: item.boxCountGp ?? null,
    };
    const prev = bySku.get(item.sku);
    if (!prev) {
      bySku.set(item.sku, {
        ...item,
        systemBalance: 0,
        actualCount: null,
        boxCount: null,
        checked: false,
        ...gpFields,
      });
      continue;
    }
    bySku.set(item.sku, {
      ...prev,
      ...gpFields,
      name: prev.name || item.name,
      portionsPerBox: prev.portionsPerBox || item.portionsPerBox,
    });
  }

  return Array.from(bySku.values());
}

export function parseSessionWarehouseFromApi(value: unknown): InventoryWarehouseScope {
  return parseInventoryWarehouseScope(value);
}
