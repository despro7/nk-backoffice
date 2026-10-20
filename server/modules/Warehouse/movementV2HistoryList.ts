import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { normalizeItemsArray, safeParseItems, sumHistoryItemsQuantity } from './historyNormalize.js';

export type MovementHistoryStatusFilter = 'active' | 'deleted';

export interface MovementHistoryListQuery {
  page: number;
  limit: number;
  status: MovementHistoryStatusFilter;
  from?: string;
  to?: string;
}

const ACTIVE_STATUSES = ['finalized', 'pending_receipt', 'active'] as const;

const MOVEMENT_HISTORY_ORDER: Prisma.WarehouseMovementOrderByWithRelationInput[] = [
  { movementDate: 'desc' },
  { draftCreatedAt: 'desc' },
  { id: 'desc' },
];

function buildWhere(query: MovementHistoryListQuery): Prisma.WarehouseMovementWhereInput {
  const where: Prisma.WarehouseMovementWhereInput = query.status === 'deleted'
    ? { status: 'deleted' }
    : { status: { in: [...ACTIVE_STATUSES] } };

  const { from, to } = query;
  if (from || to) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(`${from}T00:00:00`);
    if (to) dateFilter.lte = new Date(`${to}T23:59:59.999`);
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { movementDate: dateFilter },
          {
            AND: [
              { movementDate: null },
              { draftCreatedAt: dateFilter },
            ],
          },
        ],
      },
    ];
  }

  return where;
}

export function parseMovementHistoryListQuery(req: { query: Record<string, unknown> }): MovementHistoryListQuery {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const status = String(req.query.status ?? 'active').toLowerCase() === 'deleted' ? 'deleted' : 'active';
  const from = typeof req.query.from === 'string' && req.query.from.trim() ? req.query.from.trim() : undefined;
  const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : undefined;
  return { page, limit, status, from, to };
}

export async function getMovementHistoryPageDilovodIds(
  query: MovementHistoryListQuery,
): Promise<string[]> {
  const where = buildWhere(query);
  const rows = await prisma.warehouseMovement.findMany({
    where,
    orderBy: MOVEMENT_HISTORY_ORDER,
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
  createdAt?: Date;
}) {
  return {
    ...rec,
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
      orderBy: MOVEMENT_HISTORY_ORDER,
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
