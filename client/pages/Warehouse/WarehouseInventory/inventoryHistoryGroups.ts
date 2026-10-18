import { KYIV_TZ } from '@shared/utils/kyivDateTime';
import type { InventoryWarehouseScope } from '@shared/types/inventoryWarehouse';
import { parseInventoryWarehouseScope } from '@shared/types/inventoryWarehouse';
import {
  normalizeInventoryItemForScope,
  resolveInventorySessionWarehouseScope,
} from '@shared/utils/inventorySessionWarehouse';
import type { InventoryProduct, InventorySession, InventoryStatus } from './WarehouseInventoryTypes';

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
 * Групує сесії МС+ГП одного дня (Kyiv), якщо різниця часу ≤ 2 год.
 * Статус не розриває пару: редагування однієї сторони лишає звіт зведеним.
 * Без змін у БД — лише відображення в історії.
 */
export function buildInventoryHistoryDisplayEntries(sessions: InventorySession[]): InventoryHistoryDisplayEntry[] {
  const byDay = new Map<string, InventorySession[]>();
  for (const s of sessions) {
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

  const singles = sessions
    .filter((s) => !groupedSessionIds.has(s.id))
    .map((s) => ({ kind: 'single' as const, session: s }));

  const all = [...groupEntries, ...singles];
  all.sort((a, b) => {
    const ta = a.kind === 'group' ? a.sortTime : sessionEffectiveTime(a.session);
    const tb = b.kind === 'group' ? b.sortTime : sessionEffectiveTime(b.session);
    return tb - ta;
  });

  return all;
}

const GROUP_STATUS_TEXT: Record<InventoryStatus, string> = {
  draft: 'Чернетка',
  in_progress: 'В процесі',
  completed: 'Завершена',
  revising: 'Редагується',
  removed: 'Видалена',
};

export interface InventoryGroupStatusMark {
  status: InventoryStatus;
  label: string;
}

function warehouseStatusPhrase(sides: { ms: boolean; gp: boolean }): string {
  if (sides.ms && sides.gp) return 'МС і ГП';
  if (sides.ms) return 'МС';
  return 'ГП';
}

/**
 * Підписи статусу зведеної пари.
 * Однаковий «Завершена» лишається без складу; інший статус позначає сторону:
 * «Редагується - МС», «Редагується - МС і ГП».
 */
export function buildInventoryGroupStatusMarks(
  msSession: InventorySession,
  gpSession: InventorySession,
): InventoryGroupStatusMark[] {
  const byStatus = new Map<InventoryStatus, { ms: boolean; gp: boolean }>();
  const add = (status: InventoryStatus, side: 'ms' | 'gp') => {
    const current = byStatus.get(status) ?? { ms: false, gp: false };
    current[side] = true;
    byStatus.set(status, current);
  };
  add(msSession.status, 'ms');
  add(gpSession.status, 'gp');

  const notable = [...byStatus.entries()].filter(([status]) => status !== 'completed');
  const source = notable.length > 0 ? notable : [...byStatus.entries()];

  return source.map(([status, sides]) => ({
    status,
    label: status === 'completed'
      ? GROUP_STATUS_TEXT.completed
      : `${GROUP_STATUS_TEXT[status]} - ${warehouseStatusPhrase(sides)}`,
  }));
}

/**
 * Зводить позиції пари МС+ГП в один список: облік і факт МС — із сесії МС,
 * облік і факт ГП — із сесії ГП. SKU лише одного складу лишається з порожнім іншим боком.
 */
export function mergeInventoryGroupItems(msSession: InventorySession, gpSession: InventorySession): InventoryProduct[] {
  const bySku = new Map<string, InventoryProduct>();

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
