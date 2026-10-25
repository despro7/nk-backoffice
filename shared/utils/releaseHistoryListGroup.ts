import {
  isReleaseBatchCorrection,
  normalizeCorrectionSessionId,
} from './releaseBatchCorrection.js';
import { parseReleaseInternalDocNumericId } from './releaseHistoryDisplayDocNumber.js';
import {
  partitionCorrectionSessionMembers,
  toReleasePairCandidate,
} from './linkReleaseCorrectionPairs.js';

export function extractCorrectionSessionIdFromReleaseItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  if (!first || typeof first !== 'object') return null;
  const value = String((first as { correction_session_id?: unknown }).correction_session_id ?? '').trim();
  return value || null;
}

export function resolveStoredCorrectionSessionId(input: {
  correctionSessionId?: unknown;
  items?: unknown;
}): string | null {
  return normalizeCorrectionSessionId(
    input.correctionSessionId ?? extractCorrectionSessionIdFromReleaseItems(input.items),
  );
}

function operationKind(value: unknown): 'kit' | 'unkit' | 'other' {
  const op = String(value ?? '').toLowerCase();
  if (op === 'kit') return 'kit';
  if (op === 'unkit') return 'unkit';
  return 'other';
}

export function resolveReleaseHistoryListGroupKey(input: {
  id: number | string;
  correctionSessionId?: unknown;
  comment?: unknown;
  setSku?: unknown;
  items?: unknown;
}): string {
  const sessionId = resolveStoredCorrectionSessionId(input);
  const isCorrection = isReleaseBatchCorrection({
    correctionSessionId: sessionId,
    comment: input.comment,
    setSku: input.setSku,
    items: input.items,
  });

  if (sessionId && isCorrection) {
    return `correction:${sessionId}`;
  }

  return `single:${input.id}`;
}

export type ReleaseHistoryIndexRow = {
  id: number;
  createdAt: Date;
  operDate?: Date | null;
  internalDocNumber?: string | null;
  comment?: string | null;
  setSku?: string | null;
  quantity?: number | null;
  operationType?: string | null;
  correctionSessionId?: string | null;
  items?: unknown;
};

export type ReleaseHistoryGroupIndexEntry = {
  key: string;
  /** @deprecated використовуй sortCreatedAt */
  sortAt: Date;
  sortCreatedAt: Date;
  sortOperDate: Date;
  sortDocNumber: number;
  memberIds: number[];
};

function buildGroupIndexEntry(key: string, members: ReleaseHistoryIndexRow[]): ReleaseHistoryGroupIndexEntry {
  const sortCreatedAt = members.reduce(
    (max, row) => (row.createdAt > max ? row.createdAt : max),
    members[0]?.createdAt ?? new Date(0),
  );
  const sortOperDate = members.reduce((max, row) => {
    const candidate = row.operDate ?? row.createdAt;
    return candidate > max ? candidate : max;
  }, members[0]?.operDate ?? members[0]?.createdAt ?? new Date(0));
  const sortDocNumber = Math.max(
    ...members.map((row) => parseReleaseInternalDocNumericId(row.internalDocNumber, row.id)),
  );

  return {
    key,
    sortAt: sortCreatedAt,
    sortCreatedAt,
    sortOperDate,
    sortDocNumber,
    memberIds: members.map((row) => row.id),
  };
}

function mapPartitionToGroupEntries(
  sessionKey: string,
  members: ReleaseHistoryIndexRow[],
  partitions: ReturnType<typeof partitionCorrectionSessionMembers>,
): ReleaseHistoryGroupIndexEntry[] {
  const rowById = new Map(members.map((row) => [row.id, row]));
  return partitions.map((group) => {
    const rows = group
      .map((candidate) => rowById.get(candidate.id))
      .filter((row): row is ReleaseHistoryIndexRow => Boolean(row));
    if (rows.length === 1) {
      return buildGroupIndexEntry(`single:${rows[0].id}`, rows);
    }
    return buildGroupIndexEntry(`${sessionKey}:${rows.map((row) => row.id).join('-')}`, rows);
  });
}

/** Розбиває групу correctionSession на валідні пари kit+unkit (matchKey) та одиночні рядки. */
export function splitCorrectionSessionMembers(
  sessionKey: string,
  members: ReleaseHistoryIndexRow[],
): ReleaseHistoryGroupIndexEntry[] {
  const partitions = partitionCorrectionSessionMembers(members.map(toReleasePairCandidate));
  if (partitions.length === 1 && partitions[0].length === members.length) {
    return [buildGroupIndexEntry(sessionKey, members)];
  }
  return mapPartitionToGroupEntries(sessionKey, members, partitions);
}

/** Індекс груп для пагінації історії (один рядок UI = одна група). */
export function buildReleaseHistoryGroupIndex(
  rows: ReleaseHistoryIndexRow[],
): ReleaseHistoryGroupIndexEntry[] {
  const groupMap = new Map<string, { sortAt: Date; ids: Set<number> }>();
  const rowById = new Map(rows.map((row) => [row.id, row]));

  for (const row of rows) {
    const key = resolveReleaseHistoryListGroupKey(row);
    const existing = groupMap.get(key);
    if (!existing) {
      groupMap.set(key, { sortAt: row.createdAt, ids: new Set([row.id]) });
      continue;
    }
    existing.ids.add(row.id);
    if (row.createdAt > existing.sortAt) {
      existing.sortAt = row.createdAt;
    }
  }

  const flattened: ReleaseHistoryGroupIndexEntry[] = [];

  for (const [key, meta] of groupMap.entries()) {
    const members = [...meta.ids]
      .map((id) => rowById.get(id))
      .filter((row): row is ReleaseHistoryIndexRow => Boolean(row));

    if (key.startsWith('correction:')) {
      const partitions = partitionCorrectionSessionMembers(members.map(toReleasePairCandidate));
      if (partitions.length === 1 && partitions[0].length === members.length) {
        flattened.push(buildGroupIndexEntry(key, members));
      } else {
        flattened.push(...mapPartitionToGroupEntries(key, members, partitions));
      }
      continue;
    }

    flattened.push(buildGroupIndexEntry(key, members));
  }

  return flattened;
}
