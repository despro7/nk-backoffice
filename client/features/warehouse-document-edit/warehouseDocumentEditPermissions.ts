import { PERMISSIONS } from '@shared/constants/permissions';
import type { WarehouseDocumentKind } from './resolveWarehouseDocumentKind';

export function canEditWarehouseDocumentKind(
  kind: WarehouseDocumentKind,
  hasPermission: (key: string) => boolean,
): boolean {
  switch (kind) {
    case 'goodMoving':
      return hasPermission(PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_EDIT);
    case 'writeOff':
      return hasPermission(PERMISSIONS.PAGE_WAREHOUSE_WRITEOFF);
    case 'surplus':
      return hasPermission(PERMISSIONS.PAGE_WAREHOUSE_SURPLUS);
    case 'release':
      return hasPermission(PERMISSIONS.PAGE_WAREHOUSE_RELEASES);
    case 'saleReturn':
      return hasPermission(PERMISSIONS.PAGE_WAREHOUSE_RETURNS);
    case 'shipment':
      return hasPermission(PERMISSIONS.PAGE_WAREHOUSE_RETURNS)
        || hasPermission(PERMISSIONS.PAGE_REPORTS_SHIPMENT);
    default:
      return false;
  }
}
