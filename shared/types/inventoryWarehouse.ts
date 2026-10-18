/** Scope інвентаризаційної сесії: малий склад або склад готової продукції (ГП). */
export type InventoryWarehouseScope = 'small' | 'gp';

export const INVENTORY_WAREHOUSE_SCOPES: InventoryWarehouseScope[] = ['small', 'gp'];

export function parseInventoryWarehouseScope(value: unknown): InventoryWarehouseScope {
  return value === 'gp' ? 'gp' : 'small';
}
