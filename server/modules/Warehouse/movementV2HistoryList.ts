import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { normalizeItemsArray, safeParseItems, sumHistoryItemsQuantity } from './historyNormalize.js';
import {
  buildPrismaSearchOr,
  kyivDayBounds,
  parseWarehouseDocHistoryListQuery,
  type WarehouseDocHistoryListQuery,
} from '../../../shared/utils/warehouseDocHistoryListQuery.js';

export type MovementHistoryStatusFilter = 'active' | 'deleted';

export interface MovementHistoryListQuery extends WarehouseDocHistoryListQuery {
  page: number;
  limit: number;
  status: MovementHistoryStatusFilter;
  /** @deprecated use dateFrom */
  from?: string;
  /** @deprecated use dateTo */
  to?: string;
}

const ACTIVE_STATUSES = ['finalized', 'pending_receipt', 'active'] as const;

function resolveOrderBy(query: MovementHistoryListQuery): Prisma.WarehouseMovementOrderByWithRelationInput[] {
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const sortBy = query.sortBy ?? 'operDate';
  if (sortBy === 'createdAt') {
    return [{ draftCreatedAt: sortOrder }, { id: sortOrder }];
  }
  if (sortBy === 'docNumber') {
    return [{ internalDocNumber: sortOrder }, { docNumber: sortOrder }, { id: 'desc' }];
  }
  return [{ movementDate: sortOrder }, { draftCreatedAt: 'desc' }, { id: 'desc' }];
}

function buildMovementDateFilter(query: MovementHistoryListQuery): Prisma.WarehouseMovementWhereInput | null {
  const from = String(query.dateFrom ?? query.from ?? '').trim();
  const to = String(query.dateTo ?? query.to ?? '').trim();
  if (!from && !to) return null;

  const dateField = query.dateField === 'createdAt' ? 'createdAt' : 'operDate';
  if (dateField === 'createdAt') {
    const range: { gte?: Date; lte?: Date } = {};
    if (from) {
      const bounds = kyivDayBounds(from);
      if (bounds) range.gte = bounds.start;
    }
    if (to) {
      const bounds = kyivDayBounds(to);
      if (bounds) range.lte = bounds.end;
    }
    if (!range.gte && !range.lte) return null;
    return { draftCreatedAt: range };
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) {
    const bounds = kyivDayBounds(from);
    if (bounds) dateFilter.gte = bounds.start;
  }
  if (to) {
    const bounds = kyivDayBounds(to);
    if (bounds) dateFilter.lte = bounds.end;
  }
  if (!dateFilter.gte && !dateFilter.lte) return null;

  return {
    OR: [
      { movementDate: dateFilter },
      {
        AND: [
          { movementDate: null },
          { draftCreatedAt: dateFilter },
        ],
      },
    ],
  };
}

function buildWhere(query: MovementHistoryListQuery): Prisma.WarehouseMovementWhereInput {
  const where: Prisma.WarehouseMovementWhereInput = query.status === 'deleted'
    ? { status: 'deleted' }
    : { status: { in: [...ACTIVE_STATUSES] } };

  const andClauses: Prisma.WarehouseMovementWhereInput[] = [];
  const dateClause = buildMovementDateFilter(query);
  if (dateClause) andClauses.push(dateClause);

  const searchOr = buildPrismaSearchOr<Prisma.WarehouseMovementWhereInput>(
    query.search,
    ['internalDocNumber', 'docNumber', 'dilovodDocId', 'notes'],
    'items',
  );
  if (searchOr && searchOr.length > 0) {
    andClauses.push({ OR: searchOr });
  }

  if (andClauses.length > 0) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      ...andClauses,
    ];
  }

  return where;
}

export function parseMovementHistoryListQuery(req: { query: Record<string, unknown> }): MovementHistoryListQuery {
  const parsed = parseWarehouseDocHistoryListQuery(req.query);
  return {
    ...parsed,
    page: parsed.page ?? 1,
    limit: parsed.limit ?? 10,
    status: parsed.status === 'deleted' ? 'deleted' : 'active',
    from: typeof req.query.from === 'string' ? req.query.from.trim() : undefined,
    to: typeof req.query.to === 'string' ? req.query.to.trim() : undefined,
  };
}

export async function getMovementHistoryPageDilovodIds(
  query: MovementHistoryListQuery,
): Promise<string[]> {
  const where = buildWhere(query);
  const rows = await prisma.warehouseMovement.findMany({
    where,
    orderBy: resolveOrderBy(query),
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    select: { dilovodDocId: true },
  });
  return rows
    .map((row) => String(row.dilovodDocId ?? '').trim())
    .filter((id) => id.length > 0);
}

export async function countMovementHistory(
  status: MovementHistoryStatusFilter = 'active',
): Promise<number> {
  const where = buildWhere({ page: 1, limit: 1, status });
  return prisma.warehouseMovement.count({ where });
}

function mapMovementListRow(rec: {
  id: number;
  dilovodDocId: string | null;
  internalDocNumber: string | null;
  docNumber: string | null;
  movementDate: Date | null;
  draftCreatedAt: Date;
  sourceWarehouse: string | null;
  destinationWarehouse: string | null;
  status: string;
  createdBy: number;
  notes: string | null;
  receiptScanStartedAt: Date | null;
  createdAt?: Date;
}) {
  return {
    ...rec,
    createdAt: rec.draftCreatedAt,
    movementDate: rec.movementDate,
    receiptScanStartedAt: rec.receiptScanStartedAt,
    items: [],
    itemsNormalized: [],
    comment: rec.notes,
  };
}

export async function listMovementHistory(query: MovementHistoryListQuery) {
  const { page, limit } = query;
  const where = buildWhere(query);

  const [total, rows] = await Promise.all([
    prisma.warehouseMovement.count({ where }),
    prisma.warehouseMovement.findMany({
      where,
      orderBy: resolveOrderBy(query),
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        dilovodDocId: true,
        internalDocNumber: true,
        docNumber: true,
        movementDate: true,
        draftCreatedAt: true,
        sourceWarehouse: true,
        destinationWarehouse: true,
        status: true,
        createdBy: true,
        notes: true,
        receiptScanStartedAt: true,
      },
    }),
  ]);

  return {
    rows: rows.map(mapMovementListRow),
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/** Є збережені рядки з ненульовою кількістю — не тягнемо Dilovod знову без force. */
export function movementRowHasStoredItems(raw: string | null | undefined): boolean {
  const parsed = safeParseItems(raw);
  if (parsed.length === 0) return false;
  return sumHistoryItemsQuantity(parsed) > 0;
}

export function movementItemsFromRow(raw: string | null | undefined) {
  const parsed = safeParseItems(raw);
  return {
    items: parsed,
    itemsNormalized: normalizeItemsArray(parsed),
  };
}
