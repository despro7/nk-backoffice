import {
  formatReleaseInternalDocDisplayNumber,
  parseReleaseInternalDocNumericId,
} from './releaseHistoryDisplayDocNumber.js';
import { zonedWallTimeToUtc } from './kyivDateTime.js';
import { isReleaseBatchCorrection } from './releaseBatchCorrection.js';
import type { ReleaseHistoryGroupIndexEntry, ReleaseHistoryIndexRow } from './releaseHistoryListGroup.js';

export type ReleaseHistorySortBy = 'operDate' | 'createdAt' | 'docNumber';
export type ReleaseHistoryDateField = 'operDate' | 'createdAt';
export type ReleaseHistoryOperationType = 'kit' | 'unkit' | 'correction';

export const RELEASE_HISTORY_OPERATION_TYPES: ReleaseHistoryOperationType[] = [
  'kit',
  'unkit',
  'correction',
];

/** Порожній масив = усі типи; 1..n-1 — лише обрані. */
export function normalizeReleaseHistoryOperationTypesFilter(
  selected: ReleaseHistoryOperationType[],
): ReleaseHistoryOperationType[] {
  const unique = selected.filter((
    value,
    index,
    array,
  ): value is ReleaseHistoryOperationType => (
    (value === 'kit' || value === 'unkit' || value === 'correction')
    && array.indexOf(value) === index
  ));
  if (unique.length === 0 || unique.length >= RELEASE_HISTORY_OPERATION_TYPES.length) {
    return [];
  }
  return unique;
}

export type ReleaseHistoryListQuery = {
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dateField?: ReleaseHistoryDateField | null;
  sortBy?: ReleaseHistorySortBy | null;
  sortOrder?: 'asc' | 'desc' | null;
  operationTypes?: ReleaseHistoryOperationType[] | null;
};

function operationKind(value: unknown): 'kit' | 'unkit' | 'other' {
  const op = String(value ?? '').toLowerCase();
  if (op === 'kit') return 'kit';
  if (op === 'unkit') return 'unkit';
  return 'other';
}

export function resolveReleaseHistoryGroupOperationTypes(
  group: ReleaseHistoryGroupIndexEntry,
  rowById: Map<number, ReleaseHistoryIndexRow>,
): ReleaseHistoryOperationType[] {
  const members = group.memberIds
    .map((id) => rowById.get(id))
    .filter((row): row is ReleaseHistoryIndexRow => Boolean(row));
  if (members.length === 0) return [];

  const isCorrectionGroup = members.some((member) => isReleaseBatchCorrection({
    correctionSessionId: member.correctionSessionId,
    comment: member.comment,
    setSku: member.setSku,
    items: member.items,
  }));

  if (isCorrectionGroup || members.length > 1) {
    return ['correction'];
  }

  const kind = operationKind(members[0].operationType);
  if (kind === 'kit') return ['kit'];
  if (kind === 'unkit') return ['unkit'];
  return [];
}

export function releaseHistoryGroupMatchesOperationTypes(
  group: ReleaseHistoryGroupIndexEntry,
  rowById: Map<number, ReleaseHistoryIndexRow>,
  operationTypes: ReleaseHistoryOperationType[] | null | undefined,
): boolean {
  const selected = Array.isArray(operationTypes)
    ? operationTypes.filter((value): value is ReleaseHistoryOperationType => (
      value === 'kit' || value === 'unkit' || value === 'correction'
    ))
    : [];
  if (selected.length === 0 || selected.length >= RELEASE_HISTORY_OPERATION_TYPES.length) {
    return true;
  }
  const groupTypes = resolveReleaseHistoryGroupOperationTypes(group, rowById);
  return groupTypes.some((type) => selected.includes(type));
}

function normalizeSearch(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function releaseHistoryRowMatchesSearch(
  row: ReleaseHistoryIndexRow,
  searchRaw: string | null | undefined,
): boolean {
  const search = normalizeSearch(searchRaw);
  if (!search) return true;

  const internalDoc = String(row.internalDocNumber ?? '').trim();
  if (internalDoc.toLowerCase().includes(search)) return true;

  const displayDoc = formatReleaseInternalDocDisplayNumber(internalDoc);
  if (displayDoc && displayDoc.toLowerCase().includes(search)) return true;

  const searchDigits = search.replace(/\D/g, '');
  if (searchDigits) {
    if (String(row.id).includes(searchDigits)) return true;
    const docNum = parseReleaseInternalDocNumericId(internalDoc, row.id);
    if (String(docNum).includes(searchDigits)) return true;
  }

  if (String(row.setSku ?? '').toLowerCase().includes(search)) return true;
  if (String(row.comment ?? '').toLowerCase().includes(search)) return true;

  try {
    const itemsBlob = JSON.stringify(row.items ?? '').toLowerCase();
    if (itemsBlob.includes(search)) return true;
  } catch {
    // ignore
  }

  return false;
}

function kyivDayBounds(dateYmd: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateYmd).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return {
    start: zonedWallTimeToUtc(year, month, day, 0, 0, 0),
    end: zonedWallTimeToUtc(year, month, day, 23, 59, 59),
  };
}

export function releaseHistoryGroupMatchesDateFilter(
  group: ReleaseHistoryGroupIndexEntry,
  query: ReleaseHistoryListQuery,
): boolean {
  const from = String(query.dateFrom ?? '').trim();
  const to = String(query.dateTo ?? '').trim();
  if (!from && !to) return true;

  const field = query.dateField === 'createdAt' ? 'createdAt' : 'operDate';
  const value = field === 'createdAt' ? group.sortCreatedAt : group.sortOperDate;

  if (from) {
    const bounds = kyivDayBounds(from);
    if (bounds && value < bounds.start) return false;
  }
  if (to) {
    const bounds = kyivDayBounds(to);
    if (bounds && value > bounds.end) return false;
  }
  return true;
}

export function releaseHistoryGroupMatchesSearch(
  group: ReleaseHistoryGroupIndexEntry,
  rowById: Map<number, ReleaseHistoryIndexRow>,
  search: string | null | undefined,
): boolean {
  if (!normalizeSearch(search)) return true;
  return group.memberIds.some((id) => {
    const row = rowById.get(id);
    return row ? releaseHistoryRowMatchesSearch(row, search) : false;
  });
}

export function sortReleaseHistoryGroups(
  groups: ReleaseHistoryGroupIndexEntry[],
  query: ReleaseHistoryListQuery,
): ReleaseHistoryGroupIndexEntry[] {
  const sortBy = query.sortBy ?? 'operDate';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const dir = sortOrder === 'asc' ? 1 : -1;

  return [...groups].sort((a, b) => {
    if (sortBy === 'docNumber') {
      return (a.sortDocNumber - b.sortDocNumber) * dir;
    }
    if (sortBy === 'createdAt') {
      return (a.sortCreatedAt.getTime() - b.sortCreatedAt.getTime()) * dir;
    }
    return (a.sortOperDate.getTime() - b.sortOperDate.getTime()) * dir;
  });
}

export function filterAndSortReleaseHistoryGroups(
  groups: ReleaseHistoryGroupIndexEntry[],
  rowById: Map<number, ReleaseHistoryIndexRow>,
  query: ReleaseHistoryListQuery,
): ReleaseHistoryGroupIndexEntry[] {
  const filtered = groups.filter((group) => (
    releaseHistoryGroupMatchesSearch(group, rowById, query.search)
    && releaseHistoryGroupMatchesDateFilter(group, query)
    && releaseHistoryGroupMatchesOperationTypes(group, rowById, query.operationTypes)
  ));
  return sortReleaseHistoryGroups(filtered, query);
}
