import { describe, expect, it } from 'vitest';
import {
  normalizeReleaseHistoryOperationTypesFilter,
  releaseHistoryGroupMatchesOperationTypes,
  resolveReleaseHistoryGroupOperationTypes,
} from './releaseHistoryListQuery.js';
import type { ReleaseHistoryGroupIndexEntry, ReleaseHistoryIndexRow } from './releaseHistoryListGroup.js';

function row(partial: Partial<ReleaseHistoryIndexRow> & { id: number }): ReleaseHistoryIndexRow {
  return {
    createdAt: new Date('2026-01-01T12:00:00Z'),
    operDate: new Date('2026-01-01T12:00:00Z'),
    ...partial,
  };
}

function group(memberIds: number[]): ReleaseHistoryGroupIndexEntry {
  const now = new Date('2026-01-01T12:00:00Z');
  return {
    key: `single:${memberIds[0]}`,
    sortAt: now,
    sortCreatedAt: now,
    sortOperDate: now,
    sortDocNumber: memberIds[0] ?? 0,
    memberIds,
  };
}

describe('releaseHistory operationTypes filter', () => {
  it('normalizeReleaseHistoryOperationTypesFilter: порожньо або всі — без фільтра', () => {
    expect(normalizeReleaseHistoryOperationTypesFilter([])).toEqual([]);
    expect(normalizeReleaseHistoryOperationTypesFilter(['kit', 'unkit', 'correction'])).toEqual([]);
  });

  it('normalizeReleaseHistoryOperationTypesFilter: частковий вибір зберігається', () => {
    expect(normalizeReleaseHistoryOperationTypesFilter(['kit'])).toEqual(['kit']);
    expect(normalizeReleaseHistoryOperationTypesFilter(['unkit', 'correction'])).toEqual(['unkit', 'correction']);
  });

  it('resolveReleaseHistoryGroupOperationTypes для одиночного kit', () => {
    const rowById = new Map([[1, row({ id: 1, operationType: 'kit' })]]);
    expect(resolveReleaseHistoryGroupOperationTypes(group([1]), rowById)).toEqual(['kit']);
  });

  it('releaseHistoryGroupMatchesOperationTypes фільтрує kit', () => {
    const rowById = new Map([
      [1, row({ id: 1, operationType: 'kit' })],
      [2, row({ id: 2, operationType: 'unkit' })],
    ]);
    const kitGroup = group([1]);
    const unkitGroup = group([2]);

    expect(releaseHistoryGroupMatchesOperationTypes(kitGroup, rowById, ['kit'])).toBe(true);
    expect(releaseHistoryGroupMatchesOperationTypes(unkitGroup, rowById, ['kit'])).toBe(false);
    expect(releaseHistoryGroupMatchesOperationTypes(unkitGroup, rowById, null)).toBe(true);
  });
});
