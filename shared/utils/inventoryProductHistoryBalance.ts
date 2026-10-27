import type { InventoryWarehouseScope } from '../types/inventoryWarehouse.js';

export type ProductHistoryBalanceLayer = {
  systemBalance?: number | null;
  actual?: number | null;
  deviation?: number | null;
  systemBalanceGp?: number | null;
  actualGp?: number | null;
  deviationGp?: number | null;
  systemBalanceGpBoxCount?: number | null;
  systemBalanceGpActualCount?: number | null;
  actualGpBoxCount?: number | null;
  actualGpActualCount?: number | null;
};

export type ProductHistoryBalanceSnapshot = ProductHistoryBalanceLayer & {
  sessionId: number;
  /** ISO — час останнього знімка, що увійшов у шар */
  date: string;
  dayKey: string;
};

type InventoryItemShape = {
  unit?: string;
  portionsPerBox?: number;
  systemBalance?: number;
  actualCount?: number | null;
  boxCount?: number | null;
  systemBalanceGp?: number;
  actualCountGp?: number | null;
  boxCountGp?: number | null;
};

function computeMsActual(item: InventoryItemShape): number | null {
  if (item.unit === 'portions' && item.portionsPerBox != null && Number(item.portionsPerBox) > 0) {
    const bc = typeof item.boxCount === 'number' ? item.boxCount : null;
    const ac = typeof item.actualCount === 'number' ? item.actualCount : null;
    if (bc !== null || ac !== null) {
      return (bc ?? 0) * Number(item.portionsPerBox) + (ac ?? 0);
    }
    return null;
  }
  if (typeof item.actualCount === 'number') return item.actualCount;
  return null;
}

function computeGpActual(item: InventoryItemShape): {
  actualGp: number | null;
  boxCountGp: number | null;
  actualCountGp: number | null;
} {
  if (item.unit === 'portions' && item.portionsPerBox != null && Number(item.portionsPerBox) > 0) {
    const bcGp = typeof item.boxCountGp === 'number' ? item.boxCountGp : null;
    const acGp = typeof item.actualCountGp === 'number' ? item.actualCountGp : null;
    if (bcGp !== null || acGp !== null) {
      return {
        boxCountGp: bcGp,
        actualCountGp: acGp,
        actualGp: (bcGp ?? 0) * Number(item.portionsPerBox) + (acGp ?? 0),
      };
    }
    return { actualGp: null, boxCountGp: null, actualCountGp: null };
  }
  if (typeof item.actualCountGp === 'number') {
    return { actualGp: item.actualCountGp, boxCountGp: null, actualCountGp: item.actualCountGp };
  }
  return { actualGp: null, boxCountGp: null, actualCountGp: null };
}

/**
 * Знімок обліку/факту для одного SKU.
 * @param scope `both` — усі поля (після mergeInventoryGroupItems); `small` / `gp` — лише відповідний склад.
 */
export function productHistoryBalanceLayerFromItem(
  item: InventoryItemShape,
  scope: InventoryWarehouseScope | 'both',
): ProductHistoryBalanceLayer {
  const layer: ProductHistoryBalanceLayer = {};

  if (scope === 'both' || scope === 'small') {
    const systemBalance = typeof item.systemBalance === 'number' ? item.systemBalance : null;
    const actual = computeMsActual(item);
    layer.systemBalance = systemBalance;
    layer.actual = actual;
    layer.deviation = actual !== null && systemBalance !== null ? actual - systemBalance : null;
  }

  if (scope === 'both' || scope === 'gp') {
    const systemBalanceGp = typeof item.systemBalanceGp === 'number' ? item.systemBalanceGp : null;
    const gp = computeGpActual(item);
    layer.systemBalanceGp = systemBalanceGp;
    layer.actualGp = gp.actualGp;
    layer.deviationGp = gp.actualGp !== null && systemBalanceGp !== null ? gp.actualGp - systemBalanceGp : null;
    layer.systemBalanceGpBoxCount = gp.boxCountGp;
    layer.systemBalanceGpActualCount = gp.actualCountGp;
    layer.actualGpBoxCount = gp.boxCountGp;
    layer.actualGpActualCount = gp.actualCountGp;
  }

  return layer;
}

export function overlayProductHistoryBalanceLayers(
  base: ProductHistoryBalanceLayer | null,
  next: ProductHistoryBalanceLayer,
): ProductHistoryBalanceLayer {
  const prev = base ?? {};
  const pick = <K extends keyof ProductHistoryBalanceLayer>(key: K): ProductHistoryBalanceLayer[K] => {
    const value = next[key];
    if (value !== undefined && value !== null) return value;
    return prev[key];
  };

  return {
    systemBalance: pick('systemBalance'),
    actual: pick('actual'),
    deviation: pick('deviation'),
    systemBalanceGp: pick('systemBalanceGp'),
    actualGp: pick('actualGp'),
    deviationGp: pick('deviationGp'),
    systemBalanceGpBoxCount: pick('systemBalanceGpBoxCount'),
    systemBalanceGpActualCount: pick('systemBalanceGpActualCount'),
    actualGpBoxCount: pick('actualGpBoxCount'),
    actualGpActualCount: pick('actualGpActualCount'),
  };
}

export function finalizeProductHistoryBalanceLayer(layer: ProductHistoryBalanceLayer): ProductHistoryBalanceLayer {
  const systemBalance = layer.systemBalance ?? null;
  const actual = layer.actual ?? null;
  const systemBalanceGp = layer.systemBalanceGp ?? null;
  const actualGp = layer.actualGp ?? null;
  return {
    ...layer,
    systemBalance,
    actual,
    deviation: actual !== null && systemBalance !== null ? actual - systemBalance : layer.deviation ?? null,
    systemBalanceGp,
    actualGp,
    deviationGp: actualGp !== null && systemBalanceGp !== null ? actualGp - systemBalanceGp : layer.deviationGp ?? null,
  };
}
