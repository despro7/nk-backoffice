import type { Prisma } from '@prisma/client';
import { logServer, prisma } from '../lib/utils.js';
import { AUDIT_SOURCES, type AuditSource } from '../../shared/constants/auditEntities.js';
import type { AuditLogDto, AuditLogPageDto } from '../../shared/types/audit.js';

export interface AuditLogInput {
  entityType: string;
  entityId: string | number;
  action: string;
  userId?: number | null;
  source?: AuditSource;
  payload?: Prisma.InputJsonValue;
}

export interface AuditLogQuery {
  entityType?: string | string[];
  entityId?: string | number | Array<string | number>;
  userId?: number;
  action?: string | string[];
  source?: AuditSource;
  /** ISO date/datetime, включно */
  from?: string;
  /** ISO date/datetime, включно */
  to?: string;
  /** id запису, з якого (не включно) продовжити вниз */
  cursor?: number;
  limit?: number;
}

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { user: { select: { id: true; name: true; email: true } } };
}>;

function normalizeSource(value: string | null | undefined): AuditSource {
  return (AUDIT_SOURCES as readonly string[]).includes(value ?? '') ? (value as AuditSource) : 'ui';
}

function toDto(row: AuditRow): AuditLogDto {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    userId: row.userId,
    userName: row.user?.name || row.user?.email || null,
    source: normalizeSource(row.source),
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseBoundary(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Загальний журнал дій для всіх доменів (HR, Warehouse, Catalog…). */
export class AuditLogService {
  /** Пише запис; помилка запису не ламає бізнес-операцію. */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          entityType: input.entityType,
          entityId: String(input.entityId),
          action: input.action,
          userId: input.userId ?? null,
          source: input.source ?? 'ui',
          payload: input.payload ?? undefined,
        },
      });
    } catch (error) {
      logServer('[audit-log] failed to write log', { entityType: input.entityType, action: input.action, error });
    }
  }

  buildWhere(query: AuditLogQuery): Prisma.AuditLogWhereInput {
    const from = parseBoundary(query.from, false);
    const to = parseBoundary(query.to, true);
    const asList = (value: string | string[] | undefined) =>
      value === undefined ? undefined : Array.isArray(value) ? { in: value } : value;
    return {
      ...(query.entityType !== undefined ? { entityType: asList(query.entityType) } : {}),
      ...(query.entityId !== undefined
        ? {
            entityId: Array.isArray(query.entityId)
              ? { in: query.entityId.map(String) }
              : String(query.entityId),
          }
        : {}),
      ...(query.userId !== undefined ? { userId: query.userId } : {}),
      ...(query.action !== undefined ? { action: asList(query.action) } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
  }

  /** Список записів (новіші зверху) з пагінацією курсором по id. */
  async query(query: AuditLogQuery): Promise<AuditLogPageDto> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await prisma.auditLog.findMany({
      where: this.buildWhere(query),
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(toDto),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Короткий варіант без пагінації. */
  async list(query: Omit<AuditLogQuery, 'cursor'>): Promise<AuditLogDto[]> {
    return (await this.query(query)).items;
  }
}

export const auditLogService = new AuditLogService();
