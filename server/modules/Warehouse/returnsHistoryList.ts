import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { normalizeItemsArray, safeParseItems } from './historyNormalize.js';
import {
  buildPrismaDateRangeFilter,
  buildPrismaSearchOr,
  parseWarehouseDocHistoryListQuery,
  type WarehouseDocHistoryListQuery,
} from '../../../shared/utils/warehouseDocHistoryListQuery.js';

export type ReturnsHistoryListQuery = WarehouseDocHistoryListQuery & {
  page: number;
  limit: number;
};

export type ReturnsHistoryListResult = {
  rows: Record<string, unknown>[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

function resolveOrderBy(query: ReturnsHistoryListQuery): Prisma.WarehouseReturnHistoryOrderByWithRelationInput[] {
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const sortBy = query.sortBy ?? 'operDate';
  if (sortBy === 'createdAt') {
    return [{ createdAt: sortOrder }, { id: sortOrder }];
  }
  if (sortBy === 'docNumber') {
    return [{ returnNumber: sortOrder }, { orderNumber: sortOrder }, { id: 'desc' }];
  }
  return [{ returnDate: sortOrder }, { createdAt: 'desc' }, { id: 'desc' }];
}

function buildWhere(query: ReturnsHistoryListQuery): Prisma.WarehouseReturnHistoryWhereInput {
  const dateFilter = buildPrismaDateRangeFilter(
    query.dateField ?? 'operDate',
    'returnDate',
    query.dateFrom,
    query.dateTo,
  );
  const searchOr = buildPrismaSearchOr<Prisma.WarehouseReturnHistoryWhereInput>(
    query.search,
    ['returnNumber', 'orderNumber', 'ttn', 'comment', 'returnReason'],
    'items',
  );

  const andClauses: Prisma.WarehouseReturnHistoryWhereInput[] = [];
  if (dateFilter) andClauses.push(dateFilter as Prisma.WarehouseReturnHistoryWhereInput);
  if (searchOr && searchOr.length > 0) {
    andClauses.push({ OR: searchOr });
  }

  return andClauses.length > 0 ? { AND: andClauses } : {};
}

export function parseReturnsHistoryListQuery(req: { query: Record<string, unknown> }): ReturnsHistoryListQuery {
  const parsed = parseWarehouseDocHistoryListQuery(req.query);
  return {
    ...parsed,
    page: parsed.page ?? 1,
    limit: parsed.limit ?? 10,
  };
}

export async function listReturnsHistory(query: ReturnsHistoryListQuery): Promise<ReturnsHistoryListResult> {
  const { page, limit } = query;
  const where = buildWhere(query);
  const orderBy = resolveOrderBy(query);

  const [total, rows] = await Promise.all([
    prisma.warehouseReturnHistory.count({ where }),
    prisma.warehouseReturnHistory.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    rows: rows.map((rec) => {
      const parsed = safeParseItems(rec.items);
      const itemsNormalized = normalizeItemsArray(parsed);
      return {
        ...rec,
        itemsNormalized,
      };
    }),
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
