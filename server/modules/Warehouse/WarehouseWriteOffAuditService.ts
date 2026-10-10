import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';

export const WAREHOUSE_WRITE_OFF_AUDIT_ENTITY = 'warehouse_write_off';

export type WarehouseWriteOffAuditLogDto = {
  id: number;
  entityId: number;
  action: string;
  userId: number | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
};

export class WarehouseWriteOffAuditService {
  async log(input: {
    writeOffId: number;
    action: string;
    userId?: number | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await prisma.hrAuditLog.create({
        data: {
          entityType: WAREHOUSE_WRITE_OFF_AUDIT_ENTITY,
          entityId: input.writeOffId,
          action: input.action,
          userId: input.userId ?? null,
          payload: input.payload ?? undefined,
        },
      });
    } catch (error) {
      console.error('[warehouse-writeoff-audit] failed to write log', error);
    }
  }

  async list(writeOffId: number, limit = 50): Promise<WarehouseWriteOffAuditLogDto[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await prisma.hrAuditLog.findMany({
      where: {
        entityType: WAREHOUSE_WRITE_OFF_AUDIT_ENTITY,
        entityId: writeOffId,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      entityId: row.entityId,
      action: row.action,
      userId: row.userId,
      userName: row.user?.name || row.user?.email || null,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

export const warehouseWriteOffAuditService = new WarehouseWriteOffAuditService();
