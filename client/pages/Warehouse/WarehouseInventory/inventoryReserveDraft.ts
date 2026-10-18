import type { InventoryProduct, InventoryWarehouseScope } from './WarehouseInventoryTypes';
import { inventoryRowDomId, type InventoryRowKind } from './inventoryRowScroll';

export interface InventoryReserveItem {
  type: 'product' | 'material' | 'set';
  id: string;
  actualCount: number | null;
  boxCount: number | null;
  actualCountGp: number | null;
  boxCountGp: number | null;
  checked: boolean;
}

/** Знімок, який резерв порівнює з офіційним збереженням. */
export interface InventoryReserveData {
  comment: string;
  sessionDate: string | null;
  items: InventoryReserveItem[];
}

export interface InventoryReserveFocus {
  kind: InventoryRowKind;
  id: string;
}

function mapItems(type: InventoryReserveItem['type'], list: InventoryProduct[]): InventoryReserveItem[] {
  return list.map((item) => ({
    type,
    id: item.id,
    actualCount: item.actualCount,
    boxCount: item.boxCount,
    actualCountGp: item.actualCountGp,
    boxCountGp: item.boxCountGp,
    checked: item.checked,
  }));
}

export function toInventoryReserveData(
  products: InventoryProduct[],
  materials: InventoryProduct[],
  sets: InventoryProduct[],
  comment: string,
  sessionDate: string | null,
): InventoryReserveData {
  return {
    comment,
    sessionDate,
    items: [
      ...mapItems('set', sets),
      ...mapItems('product', products),
      ...mapItems('material', materials),
    ],
  };
}

export function inventoryReserveDocumentKey(
  sessionId: number | null,
  warehouse: InventoryWarehouseScope | null,
): string | null {
  if (!warehouse) return null;
  if (sessionId != null) return `warehouse-inventory:${sessionId}`;
  return `warehouse-inventory:new:${warehouse}`;
}

export function inventoryReserveAnchor(focus: InventoryReserveFocus | null): string | null {
  if (!focus) return null;
  return inventoryRowDomId(focus.kind, focus.id);
}

export function parseInventoryReserveAnchor(anchor: string | null): InventoryReserveFocus | null {
  if (!anchor) return null;
  const separator = anchor.indexOf(':');
  if (separator <= 0) return null;
  const kind = anchor.slice(0, separator);
  const id = anchor.slice(separator + 1);
  if ((kind !== 'product' && kind !== 'material' && kind !== 'set') || !id) return null;
  return { kind, id };
}

export function mergeInventoryReserveItems(
  list: InventoryProduct[],
  type: InventoryReserveItem['type'],
  items: InventoryReserveItem[],
): InventoryProduct[] {
  const saved = new Map(items.filter((item) => item.type === type).map((item) => [item.id, item]));
  return list.map((item) => {
    const backup = saved.get(item.id);
    if (!backup) return item;
    return {
      ...item,
      actualCount: backup.actualCount,
      boxCount: backup.boxCount,
      actualCountGp: backup.actualCountGp,
      boxCountGp: backup.boxCountGp,
      checked: backup.checked,
    };
  });
}
