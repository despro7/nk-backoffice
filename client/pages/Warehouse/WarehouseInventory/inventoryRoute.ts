import type { InventoryWarehouseScope } from './WarehouseInventoryTypes';

export type InventoryUrlWarehousePrefix = 'sm' | 'gp';

export function warehouseScopeToUrlPrefix(scope: InventoryWarehouseScope): InventoryUrlWarehousePrefix {
  return scope === 'gp' ? 'gp' : 'sm';
}

export function urlPrefixToWarehouseScope(prefix: string | undefined): InventoryWarehouseScope | null {
  if (prefix === 'gp') return 'gp';
  if (prefix === 'sm') return 'small';
  return null;
}

export function buildInventorySessionPath(
  scope: InventoryWarehouseScope,
  sessionId: number | string | null | undefined,
): string {
  const prefix = warehouseScopeToUrlPrefix(scope);
  if (sessionId != null && sessionId !== '') {
    return `/warehouse/inventory/${prefix}/${sessionId}`;
  }
  return `/warehouse/inventory/${prefix}`;
}
