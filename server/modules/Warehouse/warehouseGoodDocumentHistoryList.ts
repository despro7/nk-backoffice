import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import type { GoodDocHistoryKind } from '../../../shared/types/warehouseGoodDocument.js';
import { getAllowedGoodDocumentStorageIds } from './warehouseGoodDocumentStorageFilter.js';
import { normalizeItemsArray, safeParseItems } from './historyNormalize.js';

export type GoodDocHistoryStatusFilter = 'active' | 'deleted';

export interface GoodDocHistoryListQuery {
  page: number;
  limit: number;
  status: GoodDocHistoryStatusFilter;
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

/** Найновіші документи зверху (дата операції, не час sync у БД). */
const WRITE_OFF_HISTORY_ORDER: Prisma.WarehouseWriteOffHistoryOrderByWithRelationInput[] = [
  { writeOffDate: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

const SURPLUS_HISTORY_ORDER: Prisma.WarehouseSurplusHistoryOrderByWithRelationInput[] = [
  { surplusDate: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

function buildStorageIn(allowed: string[]): string[] | undefined {
  if (allowed.length === 0) return undefined;
  return allowed;
}

async function buildHistoryWhere(
  kind: GoodDocHistoryKind,
  status: GoodDocHistoryStatusFilter,
): Promise<Prisma.WarehouseWriteOffHistoryWhereInput | Prisma.WarehouseSurplusHistoryWhereInput> {
  const allowedStorageIds = await getAllowedGoodDocumentStorageIds();
  const storageIn = buildStorageIn(allowedStorageIds);
  const statusWhere = status === 'deleted'
    ? { status: 'deleted' as const }
    : { status: { not: 'deleted' as const } };
  return {
    ...statusWhere,
    ...(storageIn ? { storageId: { in: storageIn } } : {}),
  };
}

/** Dilovod document ids для поточної сторінки (для точкового оновлення шапок). */
export async function getGoodDocumentHistoryPageDilovodIds(
  kind: GoodDocHistoryKind,
  query: GoodDocHistoryListQuery,
): Promise<string[]> {
  const { page, limit, status } = query;
  const where = await buildHistoryWhere(kind, status);

  if (kind === 'writeOff') {
    const rows = await prisma.warehouseWriteOffHistory.findMany({
      where: where as Prisma.WarehouseWriteOffHistoryWhereInput,
      orderBy: WRITE_OFF_HISTORY_ORDER,
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
    orderBy: SURPLUS_HISTORY_ORDER,
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
  const where = await buildHistoryWhere(kind, status);
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
  const { page, limit, status } = query;
  const firmsMap = await loadFirmsMap();

  if (kind === 'writeOff') {
    const where = await buildHistoryWhere(kind, status) as Prisma.WarehouseWriteOffHistoryWhereInput;
    const [total, rows] = await Promise.all([
      prisma.warehouseWriteOffHistory.count({ where }),
      prisma.warehouseWriteOffHistory.findMany({
        where,
        orderBy: WRITE_OFF_HISTORY_ORDER,
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

  const surplusWhere = await buildHistoryWhere(kind, status) as Prisma.WarehouseSurplusHistoryWhereInput;
  const [total, rows] = await Promise.all([
    prisma.warehouseSurplusHistory.count({ where: surplusWhere }),
    prisma.warehouseSurplusHistory.findMany({
      where: surplusWhere,
      orderBy: SURPLUS_HISTORY_ORDER,
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
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const status = String(req.query.status ?? 'active').toLowerCase() === 'deleted' ? 'deleted' : 'active';
  return { page, limit, status };
}
