import type { Prisma } from '@prisma/client';
import { AUDIT_ENTITY } from '../../../shared/constants/auditEntities.js';
import { auditLogService } from '../../services/AuditLogService.js';

export const WAREHOUSE_SURPLUS_AUDIT_ENTITY = AUDIT_ENTITY.WAREHOUSE_SURPLUS;

export type WarehouseSurplusAuditLogDto = {
  id: number;
  entityId: number;
  action: string;
  userId: number | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
};

/** Тонка обгортка над загальним `auditLogService` (entityType = WAREHOUSE_SURPLUS). */
export class WarehouseSurplusAuditService {
  async log(input: {
    surplusId: number;
    action: string;
    userId?: number | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await auditLogService.log({
      entityType: WAREHOUSE_SURPLUS_AUDIT_ENTITY,
      entityId: input.surplusId,
      action: input.action,
      userId: input.userId,
      payload: input.payload,
    });
  }

  async list(surplusId: number, limit = 50): Promise<WarehouseSurplusAuditLogDto[]> {
    const rows = await auditLogService.list({
      entityType: WAREHOUSE_SURPLUS_AUDIT_ENTITY,
      entityId: surplusId,
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

export const warehouseSurplusAuditService = new WarehouseSurplusAuditService();
