import type { Prisma } from '@prisma/client';
import { AUDIT_ENTITY } from '../../../shared/constants/auditEntities.js';
import { auditLogService } from '../../services/AuditLogService.js';

export const WAREHOUSE_RELEASE_AUDIT_ENTITY = AUDIT_ENTITY.WAREHOUSE_RELEASE_SET;

export type WarehouseReleaseAuditLogDto = {
  id: number;
  entityId: number;
  action: string;
  userId: number | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
};

/** Тонка обгортка над загальним `auditLogService` (entityType = WAREHOUSE_RELEASE_SET). */
export class WarehouseReleaseAuditService {
  async log(input: {
    releaseId: number;
    action: string;
    userId?: number | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await auditLogService.log({
      entityType: WAREHOUSE_RELEASE_AUDIT_ENTITY,
      entityId: input.releaseId,
      action: input.action,
      userId: input.userId,
      payload: input.payload,
    });
  }

  async list(releaseId: number, limit = 50): Promise<WarehouseReleaseAuditLogDto[]> {
    const rows = await auditLogService.list({
      entityType: WAREHOUSE_RELEASE_AUDIT_ENTITY,
      entityId: releaseId,
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      entityId: Number(row.entityId),
      action: row.action,
      userId: row.userId,
      userName: row.userName,
      payload: row.payload,
      createdAt: row.createdAt,
    }));
  }
}

export const warehouseReleaseAuditService = new WarehouseReleaseAuditService();
