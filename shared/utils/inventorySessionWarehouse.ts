import type { InventoryWarehouseScope } from '../types/inventoryWarehouse.js';
import { parseInventoryWarehouseScope } from '../types/inventoryWarehouse.js';

type InventoryItemLike = {
  unit?: string;
  boxCount?: number | null;
  actualCount?: number | null;
  boxCountGp?: number | null;
  actualCountGp?: number | null;
  systemBalance?: number;
  systemBalanceGp?: number;
  isOutdated?: boolean;
};

function portionsPerBoxOf(item: InventoryItemLike): number {
  return (item as { portionsPerBox?: number }).portionsPerBox ?? 1;
}

function totalPortionsMs(item: InventoryItemLike): number | null {
  if (item.unit !== 'portions') return item.actualCount ?? null;
  if (item.boxCount == null && item.actualCount == null) return null;
  const ppb = portionsPerBoxOf(item);
  return ((item.boxCount ?? 0) * ppb) + (item.actualCount ?? 0);
}

function totalPortionsGp(item: InventoryItemLike): number | null {
  if (item.unit !== 'portions') return item.actualCountGp ?? null;
  if (item.boxCountGp == null && item.actualCountGp == null) return null;
  const ppb = portionsPerBoxOf(item);
  return ((item.boxCountGp ?? 0) * ppb) + (item.actualCountGp ?? 0);
}

function hasMsFact(item: InventoryItemLike): boolean {
  if (item.boxCount != null || item.actualCount != null) {
    const total = totalPortionsMs(item);
    if (total != null && total > 0) return true;
    if (item.boxCount != null && item.boxCount > 0) return true;
    if (item.actualCount != null && item.actualCount > 0) return true;
  }
  return false;
}

function hasGpFact(item: InventoryItemLike): boolean {
  if (item.boxCountGp != null || item.actualCountGp != null) {
    const total = totalPortionsGp(item);
    if (total != null && total > 0) return true;
    if (item.boxCountGp != null && item.boxCountGp > 0) return true;
    if (item.actualCountGp != null && item.actualCountGp > 0) return true;
  }
  return false;
}

export function countInventoryScopeFacts(items: InventoryItemLike[]): { ms: number; gp: number } {
  let ms = 0;
  let gp = 0;
  for (const item of items) {
    if (hasMsFact(item)) ms += 1;
    if (hasGpFact(item)) gp += 1;
  }
  return { ms, gp };
}

/** Визначає scope лише з items (без поля warehouse у БД). */
export function inferInventoryWarehouseScopeFromItems(items: InventoryItemLike[]): InventoryWarehouseScope {
  const { ms, gp } = countInventoryScopeFacts(items);
  if (gp > 0 && ms === 0) return 'gp';
  if (ms > 0 && gp === 0) return 'small';
  if (gp > ms) return 'gp';
  return 'small';
}

/** Scope сесії з урахуванням warehouse у БД та legacy-фактів. */
export function resolveInventorySessionWarehouseScope(
  storedWarehouse: unknown,
  items: InventoryItemLike[],
): InventoryWarehouseScope {
  const fromItems = inferInventoryWarehouseScopeFromItems(items);
  if (storedWarehouse === 'gp') return 'gp';
  if (storedWarehouse === 'small') {
    const { ms, gp } = countInventoryScopeFacts(items);
    if (gp > 0 && ms === 0) return 'gp';
    return 'small';
  }
  return fromItems;
}

/** Переносить legacy-факти з полів МС у поля ГП для сесії ГП. */
export function normalizeInventoryItemForScope<T extends InventoryItemLike>(item: T, scope: InventoryWarehouseScope): T {
  if (scope !== 'gp') return item;
  const hasGpCounts = item.actualCountGp != null || item.boxCountGp != null;
  const hasMsCounts = item.actualCount != null || item.boxCount != null;
  if (hasGpCounts || !hasMsCounts) return item;
  return {
    ...item,
    actualCountGp: item.actualCount,
    boxCountGp: item.boxCount,
    actualCount: null,
    boxCount: null,
  };
}

export function normalizeInventoryItemsForScope<T extends InventoryItemLike>(
  items: T[],
  scope: InventoryWarehouseScope,
): T[] {
  return items.map((item) => normalizeInventoryItemForScope(item, scope));
}

export type InventorySessionRepairResult = {
  warehouse: InventoryWarehouseScope;
  items: unknown[];
  changed: boolean;
};

/** Виправляє warehouse та items у записі інвентаризації (legacy ГП / некоректний тип складу). */
export function repairWarehouseInventorySession(
  storedWarehouse: unknown,
  items: unknown[],
): InventorySessionRepairResult {
  const scope = resolveInventorySessionWarehouseScope(storedWarehouse, items as InventoryItemLike[]);
  const normalizedItems = normalizeInventoryItemsForScope(items as InventoryItemLike[], scope);
  const parsedStored = parseInventoryWarehouseScope(storedWarehouse);
  const warehouseChanged = parsedStored !== scope;
  const itemsChanged = JSON.stringify(normalizedItems) !== JSON.stringify(items);
  return {
    warehouse: scope,
    items: normalizedItems,
    changed: warehouseChanged || itemsChanged,
  };
}

export function shouldKeepInventoryItemForScope(item: InventoryItemLike, scope: InventoryWarehouseScope): boolean {
  if (!item?.isOutdated) return true;
  const system = scope === 'gp' ? (item.systemBalanceGp ?? 0) : (item.systemBalance ?? 0);
  const fact = scope === 'gp' ? totalPortionsGp(item) : totalPortionsMs(item);
  const actualOrSystem = Math.max(fact ?? 0, system);
  return actualOrSystem > 0;
}
