import type { InventorySession } from './WarehouseInventoryTypes';
import { totalPortions, totalPortionsGp } from './WarehouseInventoryUtils';

function shouldKeepItem(item: any): boolean {
  if (!item?.isOutdated && !item?.doNotPublish) return true;
  const fact = totalPortions(item);
  const factGp = totalPortionsGp(item);
  const actualOrSystem = Math.max(fact ?? 0, item.systemBalance ?? 0);
  const actualOrSystemGp = Math.max(factGp ?? 0, item.systemBalanceGp ?? 0);
  return actualOrSystem > 0 || actualOrSystemGp > 0;
}

export function splitSessionItems(sessionItems: any[]) {
  const materials = sessionItems.filter((item) => item.type === 'material' && shouldKeepItem(item));
  const sets = sessionItems.filter((item) => item.type === 'set' && shouldKeepItem(item));
  const products = sessionItems.filter((item) => (item.type === 'product' || item.type === undefined) && shouldKeepItem(item));
  return { materials, sets, products };
}

export type InventorySessionStats = ReturnType<typeof computeInventorySessionStats>;

export function computeInventorySessionStats(session: InventorySession) {
  const items: any[] = session.items as any[];
  const { materials, sets, products } = splitSessionItems(items);

  const productDevShortfall = products.reduce((s, it) => {
    const total = totalPortions(it);
    const system = it.systemBalance ?? 0;
    return s + (total !== null && total < system ? system - total : 0);
  }, 0);
  const productDevSurplus = products.reduce((s, it) => {
    const total = totalPortions(it);
    const system = it.systemBalance ?? 0;
    return s + (total !== null && total > system ? total - system : 0);
  }, 0);
  const materialDevShortfall = materials.reduce((s, it) => {
    const total = totalPortions(it);
    const system = it.systemBalance ?? 0;
    return s + (total !== null && total < system ? system - total : 0);
  }, 0);
  const materialDevSurplus = materials.reduce((s, it) => {
    const total = totalPortions(it);
    const system = it.systemBalance ?? 0;
    return s + (total !== null && total > system ? total - system : 0);
  }, 0);
  const setDevShortfall = sets.reduce((s, it) => {
    const total = totalPortions(it);
    const system = it.systemBalance ?? 0;
    return s + (total !== null && total < system ? system - total : 0);
  }, 0);
  const setDevSurplus = sets.reduce((s, it) => {
    const total = totalPortions(it);
    const system = it.systemBalance ?? 0;
    return s + (total !== null && total > system ? total - system : 0);
  }, 0);

  const productDevShortfallGp = products.reduce((s, it) => {
    const total = totalPortionsGp(it);
    const system = it.systemBalanceGp ?? 0;
    return s + (total !== null && total < system ? system - total : 0);
  }, 0);
  const productDevSurplusGp = products.reduce((s, it) => {
    const total = totalPortionsGp(it);
    const system = it.systemBalanceGp ?? 0;
    return s + (total !== null && total > system ? total - system : 0);
  }, 0);
  const materialDevShortfallGp = materials.reduce((s, it) => {
    const total = totalPortionsGp(it);
    const system = it.systemBalanceGp ?? 0;
    return s + (total !== null && total < system ? system - total : 0);
  }, 0);
  const materialDevSurplusGp = materials.reduce((s, it) => {
    const total = totalPortionsGp(it);
    const system = it.systemBalanceGp ?? 0;
    return s + (total !== null && total > system ? total - system : 0);
  }, 0);
  const setDevShortfallGp = sets.reduce((s, it) => {
    const total = totalPortionsGp(it);
    const system = it.systemBalanceGp ?? 0;
    return s + (total !== null && total < system ? system - total : 0);
  }, 0);
  const setDevSurplusGp = sets.reduce((s, it) => {
    const total = totalPortionsGp(it);
    const system = it.systemBalanceGp ?? 0;
    return s + (total !== null && total > system ? total - system : 0);
  }, 0);

  const productHasActual = products.some((it) => totalPortions(it) !== null);
  const materialHasActual = materials.some((it) => totalPortions(it) !== null);
  const setHasActual = sets.some((it) => totalPortions(it) !== null);
  const productHasActualGp = products.some((it) => totalPortionsGp(it) !== null);
  const materialHasActualGp = materials.some((it) => totalPortionsGp(it) !== null);
  const setHasActualGp = sets.some((it) => totalPortionsGp(it) !== null);

  return {
    materials,
    sets,
    products,
    productDevShortfall,
    productDevSurplus,
    materialDevShortfall,
    materialDevSurplus,
    setDevShortfall,
    setDevSurplus,
    productDevShortfallGp,
    productDevSurplusGp,
    materialDevShortfallGp,
    materialDevSurplusGp,
    setDevShortfallGp,
    setDevSurplusGp,
    productHasActual,
    materialHasActual,
    setHasActual,
    productHasActualGp,
    materialHasActualGp,
    setHasActualGp,
  };
}
