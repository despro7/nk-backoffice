import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';

export const WAREHOUSE_RELEASE_AUDIT_ENTITY = 'warehouse_release_set';

export type WarehouseReleaseAuditLogDto = {
  id: number;
  entityId: number;
  action: string;
  userId: number | null;
  userName: string | null;
  payload: unknown;
  createdAt: string;
};

export class WarehouseReleaseAuditService {
  async log(input: {
    releaseId: number;
    action: string;
    userId?: number | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await prisma.hrAuditLog.create({
        data: {
          entityType: WAREHOUSE_RELEASE_AUDIT_ENTITY,
          entityId: input.releaseId,
          action: input.action,
          userId: input.userId ?? null,
          payload: input.payload ?? undefined,
        },
      });
    } catch (error) {
      console.error('[warehouse-release-audit] failed to write log', error);
    }
  }

  async list(releaseId: number, limit = 50): Promise<WarehouseReleaseAuditLogDto[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await prisma.hrAuditLog.findMany({
      where: {
        entityType: WAREHOUSE_RELEASE_AUDIT_ENTITY,
        entityId: releaseId,
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

export const warehouseReleaseAuditService = new WarehouseReleaseAuditService();
