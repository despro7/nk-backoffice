import type { InventoryWarehouseScope } from '../types/inventoryWarehouse.js';

/** Мінімальна форма позиції інвентаризації для розрахунку факту та відхилення. */
export type InventoryDeviationItemLike = {
  unit?: string;
  portionsPerBox?: number;
  boxCount?: number | null;
  actualCount?: number | null;
  boxCountGp?: number | null;
  actualCountGp?: number | null;
  systemBalance?: number | null;
  systemBalanceGp?: number | null;
};

function ppbOf(item: InventoryDeviationItemLike): number {
  return item.portionsPerBox ?? 1;
}

/** Фактична кількість по малому складу (МС): коробки * порцій у коробці + порції; для штук – actualCount. */
export function totalPortionsMs(item: InventoryDeviationItemLike): number | null {
  if (item.unit !== 'portions') return item.actualCount ?? null;
  if (item.boxCount == null && item.actualCount == null) return null;
  return ((item.boxCount ?? 0) * ppbOf(item)) + (item.actualCount ?? 0);
}

/** Фактична кількість по складу ГП. */
export function totalPortionsGp(item: InventoryDeviationItemLike): number | null {
  if (item.unit !== 'portions') return item.actualCountGp ?? null;
  if (item.boxCountGp == null && item.actualCountGp == null) return null;
  return ((item.boxCountGp ?? 0) * ppbOf(item)) + (item.actualCountGp ?? 0);
}

export function factTotalForScope(item: InventoryDeviationItemLike, scope: InventoryWarehouseScope): number | null {
  return scope === 'gp' ? totalPortionsGp(item) : totalPortionsMs(item);
}

export function systemBalanceForScope(item: InventoryDeviationItemLike, scope: InventoryWarehouseScope): number {
  return scope === 'gp' ? (item.systemBalanceGp ?? 0) : (item.systemBalance ?? 0);
}

/** Відхилення = факт − облік. `null`, якщо факт не внесено. */
export function deviationForScope(item: InventoryDeviationItemLike, scope: InventoryWarehouseScope): number | null {
  const fact = factTotalForScope(item, scope);
  if (fact === null) return null;
  return fact - systemBalanceForScope(item, scope);
}
