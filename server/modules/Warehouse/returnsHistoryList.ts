import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { normalizeItemsArray, safeParseItems } from './historyNormalize.js';
import {
  buildPrismaDateRangeFilter,
  buildPrismaSearchOr,
  parseWarehouseDocHistoryListQuery,
  type WarehouseDocHistoryListQuery,
} from '../../../shared/utils/warehouseDocHistoryListQuery.js';
import { compareReturnHistoryOperDate } from '../../../shared/utils/returnHistoryOperDate.js';

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
    return [{ returnNumber: sortOrder }, { orderNumber: sortOrder }, { id: sortOrder }];
  }
  // findMany + in-memory COALESCE(returnDate, createdAt) — див. listReturnsHistory
  return [{ createdAt: sortOrder }, { id: sortOrder }];
}

const OPER_DATE_SORT_MAX_ROWS = 5000;

async function listReturnsHistorySortedByOperDate(
  query: ReturnsHistoryListQuery,
  where: Prisma.WarehouseReturnHistoryWhereInput,
): Promise<ReturnsHistoryListResult> {
  const { page, limit } = query;
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const skip = (page - 1) * limit;

  const [total, keys] = await Promise.all([
    prisma.warehouseReturnHistory.count({ where }),
    prisma.warehouseReturnHistory.findMany({
      where,
      select: { id: true, returnDate: true, createdAt: true },
      take: OPER_DATE_SORT_MAX_ROWS,
    }),
  ]);

  if (total > OPER_DATE_SORT_MAX_ROWS) {
    console.warn(
      `[returnsHistoryList] operDate sort capped at ${OPER_DATE_SORT_MAX_ROWS} rows (total=${total})`,
    );
  }

  const sorted = [...keys].sort((a, b) => compareReturnHistoryOperDate(a, b, sortOrder));
  const pageIds = sorted.slice(skip, skip + limit).map((row) => row.id);

  const rowsUnordered = pageIds.length > 0
    ? await prisma.warehouseReturnHistory.findMany({
      where: { id: { in: pageIds } },
    })
    : [];

  const byId = new Map(rowsUnordered.map((row) => [row.id, row]));
  const rows = pageIds.map((id) => byId.get(id)).filter((row) => row != null);

  return {
    rows: rows.map((rec) => {
      const parsed = safeParseItems(rec.items);
      const itemsNormalized = normalizeItemsArray(parsed);
      return { ...rec, itemsNormalized };
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
  const sortBy = query.sortBy ?? 'operDate';

  if (sortBy === 'operDate') {
    return listReturnsHistorySortedByOperDate(query, where);
  }

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
