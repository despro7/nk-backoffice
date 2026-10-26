import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import type { GoodDocHistoryKind } from '../../../shared/types/warehouseGoodDocument.js';
import { getAllowedGoodDocumentStorageIds } from './warehouseGoodDocumentStorageFilter.js';
import { normalizeItemsArray, safeParseItems } from './historyNormalize.js';
import {
  buildPrismaDateRangeFilter,
  buildPrismaSearchOr,
  parseWarehouseDocHistoryListQuery,
  type WarehouseDocHistoryListQuery,
} from '../../../shared/utils/warehouseDocHistoryListQuery.js';

export type GoodDocHistoryStatusFilter = 'active' | 'deleted';

export interface GoodDocHistoryListQuery extends WarehouseDocHistoryListQuery {
  status: GoodDocHistoryStatusFilter;
  page: number;
  limit: number;
}

export interface GoodDocHistoryListResult {
  rows: any[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

function resolveOrderBy(
  kind: GoodDocHistoryKind,
  query: GoodDocHistoryListQuery,
): Prisma.WarehouseWriteOffHistoryOrderByWithRelationInput[]
  | Prisma.WarehouseSurplusHistoryOrderByWithRelationInput[] {
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const sortBy = query.sortBy ?? 'operDate';
  if (sortBy === 'createdAt') {
    return [{ createdAt: sortOrder }, { id: sortOrder }];
  }
  if (sortBy === 'docNumber') {
    if (kind === 'writeOff') {
      return [{ docNumber: sortOrder }, { writeOffDate: 'desc' }, { id: 'desc' }];
    }
    return [{ docNumber: sortOrder }, { surplusDate: 'desc' }, { id: 'desc' }];
  }
  if (kind === 'writeOff') {
    return [{ writeOffDate: sortOrder }, { createdAt: 'desc' }, { id: 'desc' }];
  }
  return [{ surplusDate: sortOrder }, { createdAt: 'desc' }, { id: 'desc' }];
}

function buildStorageIn(allowed: string[]): string[] | undefined {
  if (allowed.length === 0) return undefined;
  return allowed;
}

async function buildHistoryWhere(
  kind: GoodDocHistoryKind,
  query: GoodDocHistoryListQuery,
): Promise<Prisma.WarehouseWriteOffHistoryWhereInput | Prisma.WarehouseSurplusHistoryWhereInput> {
  const allowedStorageIds = await getAllowedGoodDocumentStorageIds();
  const storageIn = buildStorageIn(allowedStorageIds);
  const statusWhere = query.status === 'deleted'
    ? { status: 'deleted' as const }
    : { status: { not: 'deleted' as const } };

  const operDateColumn = kind === 'writeOff' ? 'writeOffDate' : 'surplusDate';
  const dateFilter = buildPrismaDateRangeFilter(
    query.dateField ?? 'operDate',
    operDateColumn,
    query.dateFrom,
    query.dateTo,
  );

  const searchFields = kind === 'writeOff'
    ? ['docNumber', 'writeOffNumber', 'comment', 'remark']
    : ['docNumber', 'surplusNumber', 'comment', 'remark'];
  const searchOr = buildPrismaSearchOr<Prisma.WarehouseWriteOffHistoryWhereInput>(
    query.search,
    searchFields,
    'items',
  );

  const andClauses: Prisma.WarehouseWriteOffHistoryWhereInput[] = [];
  if (dateFilter) andClauses.push(dateFilter as Prisma.WarehouseWriteOffHistoryWhereInput);
  if (searchOr && searchOr.length > 0) {
    andClauses.push({ OR: searchOr });
  }

  return {
    ...statusWhere,
    ...(storageIn ? { storageId: { in: storageIn } } : {}),
    ...(andClauses.length > 0 ? { AND: andClauses } : {}),
  };
}

/** Dilovod document ids для поточної сторінки (для точкового оновлення шапок). */
export async function getGoodDocumentHistoryPageDilovodIds(
  kind: GoodDocHistoryKind,
  query: GoodDocHistoryListQuery,
): Promise<string[]> {
  const { page, limit } = query;
  const where = await buildHistoryWhere(kind, query);
  const orderBy = resolveOrderBy(kind, query);

  if (kind === 'writeOff') {
    const rows = await prisma.warehouseWriteOffHistory.findMany({
      where: where as Prisma.WarehouseWriteOffHistoryWhereInput,
      orderBy: orderBy as Prisma.WarehouseWriteOffHistoryOrderByWithRelationInput[],
      skip: (page - 1) * limit,
      take: limit,
      select: { writeOffNumber: true },
    });
    return rows
      .map((r) => String(r.writeOffNumber ?? '').trim())
      .filter((id) => id.length > 0);
  }

  const rows = await prisma.warehouseSurplusHistory.findMany({
    where: where as Prisma.WarehouseSurplusHistoryWhereInput,
    orderBy: orderBy as Prisma.WarehouseSurplusHistoryOrderByWithRelationInput[],
    skip: (page - 1) * limit,
    take: limit,
    select: { surplusNumber: true },
  });
  return rows
    .map((r) => String(r.surplusNumber ?? '').trim())
    .filter((id) => id.length > 0);
}

export async function countGoodDocumentHistory(
  kind: GoodDocHistoryKind,
  status: GoodDocHistoryStatusFilter = 'active',
): Promise<number> {
  const where = await buildHistoryWhere(kind, { page: 1, limit: 1, status });
  if (kind === 'writeOff') {
    return prisma.warehouseWriteOffHistory.count({
      where: where as Prisma.WarehouseWriteOffHistoryWhereInput,
    });
  }
  return prisma.warehouseSurplusHistory.count({
    where: where as Prisma.WarehouseSurplusHistoryWhereInput,
  });
}

let firmsMapCache: Map<string, string> | null = null;
let firmsMapCacheAt = 0;
const FIRMS_MAP_CACHE_MS = 10 * 60 * 1000;

async function loadFirmsMap(): Promise<Map<string, string>> {
  if (firmsMapCache && Date.now() - firmsMapCacheAt < FIRMS_MAP_CACHE_MS) {
    return firmsMapCache;
  }
  try {
    const { dilovodService } = await import('../../services/dilovod/DilovodService.js');
    const firms = await dilovodService.getFirms(false);
    if (Array.isArray(firms)) {
      firmsMapCache = new Map(firms.map((f: { id: string; name?: string }) => [String(f.id), f.name || String(f.id)]));
      firmsMapCacheAt = Date.now();
      return firmsMapCache;
    }
  } catch (e) {
    console.warn('[GoodDocHistoryList] firms preload failed:', e);
  }
  return firmsMapCache ?? new Map();
}

function mapWriteOffRow(rec: any, firmsMap: Map<string, string>) {
  const parsed = safeParseItems(rec.items);
  const itemsNormalized = normalizeItemsArray(parsed);
  const idStr = rec.firmId != null ? String(rec.firmId) : null;
  const firmDisplay = idStr ? (firmsMap.get(idStr) ?? idStr) : null;
  return {
    ...rec,
    firmDisplayName: firmDisplay,
    itemsNormalized,
  };
}

function mapSurplusRow(rec: any, firmsMap: Map<string, string>) {
  const mapped = mapWriteOffRow(rec, firmsMap);
  return {
    ...mapped,
    writeOffReason: rec.surplusReason,
    writeOffDate: rec.surplusDate,
    writeOffNumber: rec.surplusNumber,
  };
}

export async function listGoodDocumentHistory(
  kind: GoodDocHistoryKind,
  query: GoodDocHistoryListQuery,
): Promise<GoodDocHistoryListResult> {
  const { page, limit } = query;
  const firmsMap = await loadFirmsMap();
  const where = await buildHistoryWhere(kind, query);
  const orderBy = resolveOrderBy(kind, query);

  if (kind === 'writeOff') {
    const writeOffWhere = where as Prisma.WarehouseWriteOffHistoryWhereInput;
    const [total, rows] = await Promise.all([
      prisma.warehouseWriteOffHistory.count({ where: writeOffWhere }),
      prisma.warehouseWriteOffHistory.findMany({
        where: writeOffWhere,
        orderBy: orderBy as Prisma.WarehouseWriteOffHistoryOrderByWithRelationInput[],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      rows: rows.map((rec) => mapWriteOffRow(rec, firmsMap)),
      total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  const surplusWhere = where as Prisma.WarehouseSurplusHistoryWhereInput;
  const [total, rows] = await Promise.all([
    prisma.warehouseSurplusHistory.count({ where: surplusWhere }),
    prisma.warehouseSurplusHistory.findMany({
      where: surplusWhere,
      orderBy: orderBy as Prisma.WarehouseSurplusHistoryOrderByWithRelationInput[],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    rows: rows.map((rec) => mapSurplusRow(rec, firmsMap)),
    total,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export function parseGoodDocHistoryListQuery(req: { query: Record<string, unknown> }): GoodDocHistoryListQuery {
  const parsed = parseWarehouseDocHistoryListQuery(req.query);
  return {
    ...parsed,
    page: parsed.page ?? 1,
    limit: parsed.limit ?? 10,
    status: parsed.status === 'deleted' ? 'deleted' : 'active',
  };
}
