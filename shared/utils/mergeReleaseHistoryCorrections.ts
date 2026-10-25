import {
  isReleaseBatchCorrection,
  normalizeCorrectionSessionId,
} from './releaseBatchCorrection.js';

export type ReleaseHistoryMergeInput = {
  id: string;
  createdAt?: string | null;
  operDate?: string | null;
  operationType?: string | null;
  correctionSessionId?: string | null;
  comment?: string | null;
  setSku?: string | null;
  items?: unknown;
  [key: string]: unknown;
};

export type ReleaseHistoryCorrectionLayer = ReleaseHistoryMergeInput & {
  recordId: string;
};

export type ReleaseHistoryMergedRecord<T extends ReleaseHistoryMergeInput> = T & {
  correctionLayers: ReleaseHistoryCorrectionLayer[];
  isCorrectionMerged: boolean;
};

function operationKey(value: unknown): 'unkit' | 'kit' | 'other' {
  const op = String(value ?? '').toLowerCase();
  if (op === 'unkit') return 'unkit';
  if (op === 'kit') return 'kit';
  return 'other';
}

/** Крок 1 — комплектування (kit), крок 2 — розукомплектування (unkit). */
function layerSortRank(op: 'unkit' | 'kit' | 'other'): number {
  if (op === 'kit') return 0;
  if (op === 'unkit') return 1;
  return 2;
}

function toLayer<T extends ReleaseHistoryMergeInput>(record: T): ReleaseHistoryCorrectionLayer {
  return {
    ...record,
    recordId: String(record.id),
  };
}

function pickPrimaryRecord<T extends ReleaseHistoryMergeInput>(group: T[]): T {
  const kit = group.find((row) => operationKey(row.operationType) === 'kit');
  if (kit) return kit;
  const unkit = group.find((row) => operationKey(row.operationType) === 'unkit');
  if (unkit) return unkit;
  return group[0];
}

function buildMerged<T extends ReleaseHistoryMergeInput>(
  group: T[],
  sessionId: string,
): ReleaseHistoryMergedRecord<T> {
  const primary = pickPrimaryRecord(group);
  const layers = [...group]
    .map(toLayer)
    .sort((a, b) => {
      const rankDiff = layerSortRank(operationKey(a.operationType)) - layerSortRank(operationKey(b.operationType));
      if (rankDiff !== 0) return rankDiff;
      const aTime = new Date(String(a.createdAt ?? 0)).getTime();
      const bTime = new Date(String(b.createdAt ?? 0)).getTime();
      return aTime - bTime;
    });

  return {
    ...primary,
    id: String(primary.id),
    correctionSessionId: sessionId,
    correctionLayers: layers,
    isCorrectionMerged: layers.length > 1,
  };
}

function groupBySession<T extends ReleaseHistoryMergeInput>(records: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const record of records) {
    const sessionId = normalizeCorrectionSessionId(record.correctionSessionId);
    if (!sessionId || !isReleaseBatchCorrection(record)) continue;
    const bucket = map.get(sessionId) ?? [];
    bucket.push(record);
    map.set(sessionId, bucket);
  }
  return map;
}

/**
 * Об'єднує пару (комплектування + розукомплектування) однієї сесії коригування в один рядок історії.
 * Порядок записів зберігає порядок першої появи сесії в списку.
 */
export function mergeReleaseHistoryCorrections<T extends ReleaseHistoryMergeInput>(
  records: T[],
): Array<T | ReleaseHistoryMergedRecord<T>> {
  const bySession = groupBySession(records);
  const emittedSessions = new Set<string>();
  const result: Array<T | ReleaseHistoryMergedRecord<T>> = [];

  for (const record of records) {
    const sessionId = normalizeCorrectionSessionId(record.correctionSessionId);
    const isCorrection = isReleaseBatchCorrection(record);

    if (sessionId && isCorrection) {
      if (emittedSessions.has(sessionId)) continue;
      emittedSessions.add(sessionId);
      const group = bySession.get(sessionId) ?? [record];
      if (group.length <= 1) {
        result.push({
          ...toLayer(record),
          correctionLayers: [toLayer(record)],
          isCorrectionMerged: false,
        } as unknown as ReleaseHistoryMergedRecord<T>);
      } else {
        result.push(buildMerged(group, sessionId));
      }
      continue;
    }

    if (isCorrection) {
      result.push({
        ...toLayer(record),
        correctionLayers: [toLayer(record)],
        isCorrectionMerged: false,
      } as unknown as ReleaseHistoryMergedRecord<T>);
      continue;
    }

    result.push(record);
  }

  return result;
}
