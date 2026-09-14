import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import type { HrAuditLogDto, HrAuditEntityType } from '../../../shared/types/hr.js';

export interface HrAuditLogInput {
  entityType: HrAuditEntityType;
  entityId: number;
  action: string;
  userId?: number | null;
  payload?: Prisma.InputJsonValue;
}

export class HrAuditService {
  async log(input: HrAuditLogInput): Promise<void> {
    try {
      await prisma.hrAuditLog.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          userId: input.userId ?? null,
          payload: input.payload ?? undefined,
        },
      });
    } catch (error) {
      console.error('[hr-audit] failed to write log', error);
    }
  }

  async list(params: {
    entityType?: HrAuditEntityType;
    entityId?: number;
    employmentId?: number;
    date?: string;
    limit?: number;
  }): Promise<HrAuditLogDto[]> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const rows = await prisma.hrAuditLog.findMany({
      where: {
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.entityId != null ? { entityId: params.entityId } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.employmentId != null || params.date ? 500 : limit,
    });

    const filtered = rows.filter((row) => {
      if (params.employmentId == null && !params.date) return true;
      const payload = row.payload as { employmentId?: number; date?: string } | null;
      if (!payload) return false;
      if (params.employmentId != null && payload.employmentId !== params.employmentId) return false;
      if (params.date && payload.date !== params.date) return false;
      return true;
    });

    return filtered.slice(0, limit).map((row) => ({
      id: row.id,
      entityType: row.entityType as HrAuditEntityType,
      entityId: row.entityId,
      action: row.action,
      userId: row.userId,
      userName: row.user?.name || row.user?.email || null,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

export const hrAuditService = new HrAuditService();
