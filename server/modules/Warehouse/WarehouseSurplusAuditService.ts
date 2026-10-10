import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';

export const WAREHOUSE_SURPLUS_AUDIT_ENTITY = 'warehouse_surplus';

export type WarehouseSurplusAuditLogDto = {
  id: number;
  entityId: number;
  action: string;
  userId: number | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
};

export class WarehouseSurplusAuditService {
  async log(input: {
    surplusId: number;
    action: string;
    userId?: number | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await prisma.hrAuditLog.create({
        data: {
          entityType: WAREHOUSE_SURPLUS_AUDIT_ENTITY,
          entityId: input.surplusId,
          action: input.action,
          userId: input.userId ?? null,
          payload: input.payload ?? undefined,
        },
      });
    } catch (error) {
      console.error('[warehouse-surplus-audit] failed to write log', error);
    }
  }

  async list(surplusId: number, limit = 50): Promise<WarehouseSurplusAuditLogDto[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await prisma.hrAuditLog.findMany({
      where: {
        entityType: WAREHOUSE_SURPLUS_AUDIT_ENTITY,
        entityId: surplusId,
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

export const warehouseSurplusAuditService = new WarehouseSurplusAuditService();
