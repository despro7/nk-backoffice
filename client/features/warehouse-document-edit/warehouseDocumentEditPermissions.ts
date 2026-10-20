import { PERMISSIONS } from '@shared/constants/permissions';
import type { WarehouseDocumentKind } from './resolveWarehouseDocumentKind';

/** Редагування вмісту (phase 1 — лише goodMoving). */
export function canEditWarehouseDocumentKind(
  kind: WarehouseDocumentKind,
  hasPermission: (key: string) => boolean,
): boolean {
  if (kind === 'goodMoving') {
    return hasPermission(PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_EDIT);
  }
  return false;
}
