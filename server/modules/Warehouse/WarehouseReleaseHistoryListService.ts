import type { WarehouseReleaseSet } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { normalizeSetsArray } from './historyNormalize.js';
import {
  buildReleaseHistoryGroupIndex,
  resolveStoredCorrectionSessionId,
} from '../../../shared/utils/releaseHistoryListGroup.js';
import { mergeReleaseHistoryCorrections } from '../../../shared/utils/mergeReleaseHistoryCorrections.js';
import {
  filterAndSortReleaseHistoryGroups,
  type ReleaseHistoryListQuery,
} from '../../../shared/utils/releaseHistoryListQuery.js';

export type ReleaseHistoryListParams = {
  where: { status: string } | { status: { in: string[] } };
  page: number;
  limit: number;
  query?: ReleaseHistoryListQuery;
};

export type ReleaseHistoryListResult = {
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

function enrichReleaseRow(record: WarehouseReleaseSet): Record<string, unknown> {
  const correctionSessionId = resolveStoredCorrectionSessionId(record);
  return {
    ...record,
    correctionSessionId,
    setsNormalized: normalizeSetsArray(record.items),
  };
}

function buildGroupedDisplayRecord(records: WarehouseReleaseSet[]): Record<string, unknown> {
  if (records.length === 0) {
    throw new Error('buildGroupedDisplayRecord: empty group');
  }

  const enriched = records.map(enrichReleaseRow);
  const mergeInputs = enriched.map((row) => ({
    ...row,
    id: String(row.id),
  }));

  const merged = mergeReleaseHistoryCorrections(mergeInputs);
  const display = merged[0] as Record<string, unknown> & {
    id: string;
    correctionLayers?: Array<{ recordId?: string; id?: string }>;
    isCorrectionMerged?: boolean;
  };
  const byId = new Map(enriched.map((row) => [String(row.id), row]));

  const correctionLayers = Array.isArray(display.correctionLayers)
    ? display.correctionLayers.map((layer) => {
      const full = byId.get(String(layer.recordId ?? layer.id));
      if (!full) return layer;
      return {
        ...full,
        recordId: String(full.id),
      };
    })
    : [];

  return {
    ...display,
    id: Number(display.id),
    correctionLayers,
    isCorrectionMerged: Boolean(display.isCorrectionMerged),
  };
}

export class WarehouseReleaseHistoryListService {
  async listGrouped(params: ReleaseHistoryListParams): Promise<ReleaseHistoryListResult> {
    const { where, page, limit, query = {} } = params;

    const indexRows = await prisma.warehouseReleaseSet.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        operDate: true,
        internalDocNumber: true,
        comment: true,
        setSku: true,
        quantity: true,
        operationType: true,
        correctionSessionId: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const rowById = new Map(indexRows.map((row) => [row.id, row]));
    const groupIndex = filterAndSortReleaseHistoryGroups(
      buildReleaseHistoryGroupIndex(indexRows),
      rowById,
      query,
    );
    const total = groupIndex.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(Math.max(1, page), pages);
    const pageGroups = groupIndex.slice((safePage - 1) * limit, safePage * limit);

    const memberIds = new Set<number>();
    for (const group of pageGroups) {
      for (const id of group.memberIds) {
        memberIds.add(id);
      }
    }

    if (memberIds.size === 0) {
      return {
        rows: [],
        pagination: { page: safePage, limit, total, pages },
      };
    }

    const fullRows = await prisma.warehouseReleaseSet.findMany({
      where: { id: { in: [...memberIds] } },
    });
    const fullById = new Map(fullRows.map((row) => [row.id, row]));

    const rows = pageGroups.map((group) => {
      const groupRecords = group.memberIds
        .map((id) => fullById.get(id))
        .filter((row): row is WarehouseReleaseSet => Boolean(row));
      return buildGroupedDisplayRecord(groupRecords);
    });

    return {
      rows,
      pagination: {
        page: safePage,
        limit,
        total,
        pages,
      },
    };
  }
}

export const warehouseReleaseHistoryListService = new WarehouseReleaseHistoryListService();
