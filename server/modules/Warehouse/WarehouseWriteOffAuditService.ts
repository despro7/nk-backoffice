import type { Prisma } from '@prisma/client';
import { AUDIT_ENTITY } from '../../../shared/constants/auditEntities.js';
import { auditLogService } from '../../services/AuditLogService.js';

export const WAREHOUSE_WRITE_OFF_AUDIT_ENTITY = AUDIT_ENTITY.WAREHOUSE_WRITE_OFF;

export type WarehouseWriteOffAuditLogDto = {
  id: number;
  entityId: number;
  action: string;
  userId: number | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
};

/** Тонка обгортка над загальним `auditLogService` (entityType = WAREHOUSE_WRITE_OFF). */
export class WarehouseWriteOffAuditService {
  async log(input: {
    writeOffId: number;
    action: string;
    userId?: number | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await auditLogService.log({
      entityType: WAREHOUSE_WRITE_OFF_AUDIT_ENTITY,
      entityId: input.writeOffId,
      action: input.action,
      userId: input.userId,
      payload: input.payload,
    });
  }

  async list(writeOffId: number, limit = 50): Promise<WarehouseWriteOffAuditLogDto[]> {
    const rows = await auditLogService.list({
      entityType: WAREHOUSE_WRITE_OFF_AUDIT_ENTITY,
      entityId: writeOffId,
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

export const warehouseWriteOffAuditService = new WarehouseWriteOffAuditService();
