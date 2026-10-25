import { describe, expect, it } from 'vitest';
import {
  buildReleaseHistoryGroupIndex,
  resolveReleaseHistoryListGroupKey,
  splitCorrectionSessionMembers,
} from './releaseHistoryListGroup.js';

describe('resolveReleaseHistoryListGroupKey', () => {
  it('групує за колонкою correctionSessionId', () => {
    const session = 'col-session';
    expect(resolveReleaseHistoryListGroupKey({
      id: 1,
      correctionSessionId: session,
      comment: 'Коригування парт. обліку – REBATCH: Борщ (1 шт.)',
      setSku: '01006_rebatch',
      items: [],
    })).toBe(`correction:${session}`);
  });

  it('без session id — окремий рядок (не legacy-злиття)', () => {
    const keyA = resolveReleaseHistoryListGroupKey({
      id: 1,
      comment: 'Коригування парт. обліку – REBATCH: Суп (589 шт.)',
      setSku: '01006_rebatch',
      operDate: '2026-10-23T10:00:00Z',
      items: [],
    });
    const keyB = resolveReleaseHistoryListGroupKey({
      id: 2,
      comment: 'Коригування парт. обліку – REBATCH: Суп (589 шт.)',
      setSku: '01006_rebatch',
      operDate: '2026-10-23T11:00:00Z',
      items: [],
    });
    expect(keyA).toBe('single:1');
    expect(keyB).toBe('single:2');
  });

  it('групує записи однієї сесії коригування', () => {
    const session = 'abc-123';
    const items = [{ correction_session_id: session }];
    const keyKit = resolveReleaseHistoryListGroupKey({
      id: 1,
      comment: 'Коригування парт. обліку – test',
      setSku: '01006_rebatch',
      items,
    });
    const keyUnkit = resolveReleaseHistoryListGroupKey({
      id: 2,
      comment: 'Коригування парт. обліку – test',
      setSku: '01006_rebatch',
      items,
    });
    expect(keyKit).toBe(`correction:${session}`);
    expect(keyUnkit).toBe(keyKit);
  });

  it('звичайний випуск — окремий ключ', () => {
    expect(resolveReleaseHistoryListGroupKey({
      id: 99,
      comment: '5 х Мікс',
      setSku: '01010',
      items: [{ set_sku: '01010' }],
    })).toBe('single:99');
  });
});

describe('splitCorrectionSessionMembers', () => {
  it('розбиває мега-групу на пари kit+unkit', () => {
    const sessionKey = 'correction:shared-bug';
    const comment1 = 'Коригування парт. обліку – REBATCH: a (10 шт.)';
    const comment2 = 'Коригування парт. обліку – REBATCH: b (20 шт.)';
    const groups = splitCorrectionSessionMembers(sessionKey, [
      {
        id: 1,
        createdAt: new Date('2026-10-23T10:00:00Z'),
        operationType: 'kit',
        comment: comment1,
        setSku: 'a_rebatch',
        quantity: 10,
        items: [{ set_sku: 'a_rebatch' }],
      },
      {
        id: 2,
        createdAt: new Date('2026-10-23T10:01:00Z'),
        operationType: 'unkit',
        comment: comment1,
        setSku: 'a_rebatch',
        quantity: 10,
        items: [{ set_sku: 'a_rebatch' }],
      },
      {
        id: 3,
        createdAt: new Date('2026-10-23T11:00:00Z'),
        operationType: 'kit',
        comment: comment2,
        setSku: 'b_rebatch',
        quantity: 20,
        items: [{ set_sku: 'b_rebatch' }],
      },
      {
        id: 4,
        createdAt: new Date('2026-10-23T11:01:00Z'),
        operationType: 'unkit',
        comment: comment2,
        setSku: 'b_rebatch',
        quantity: 20,
        items: [{ set_sku: 'b_rebatch' }],
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].memberIds).toEqual([1, 2]);
    expect(groups[1].memberIds).toEqual([3, 4]);
  });
});

describe('buildReleaseHistoryGroupIndex', () => {
  it('зливає два id в одну групу', () => {
    const session = 'sess-x';
    const sharedComment = 'Коригування парт. обліку – REBATCH: x (589 шт.)';
    const index = buildReleaseHistoryGroupIndex([
      {
        id: 10,
        createdAt: new Date('2026-10-23T12:00:00Z'),
        operationType: 'kit',
        comment: sharedComment,
        setSku: '01006_rebatch',
        quantity: 589,
        items: [{ set_sku: '01006_rebatch', correction_session_id: session }],
      },
      {
        id: 9,
        createdAt: new Date('2026-10-23T11:00:00Z'),
        operationType: 'unkit',
        comment: sharedComment,
        setSku: '01006_rebatch',
        quantity: 589,
        items: [{ set_sku: '01006_rebatch', correction_session_id: session }],
      },
      {
        id: 8,
        createdAt: new Date('2026-10-22T10:00:00Z'),
        operationType: 'kit',
        comment: 'Звичайне',
        setSku: '01010',
        items: [],
      },
    ]);

    expect(index).toHaveLength(2);
    const correctionGroup = index.find((entry) => entry.key.startsWith('correction:'));
    const singleGroup = index.find((entry) => entry.key === 'single:8');
    expect(correctionGroup?.memberIds.slice().sort((a, b) => a - b)).toEqual([9, 10]);
    expect(singleGroup?.memberIds).toEqual([8]);
  });

  it('зберігає пару при спільній session навіть без quantity в індексі', () => {
    const session = 'sess-qty-missing';
    const sharedComment = 'Коригування парт. обліку – REBATCH: Суп (589 шт.)';
    const index = buildReleaseHistoryGroupIndex([
      {
        id: 10,
        createdAt: new Date('2026-10-23T12:00:00Z'),
        operationType: 'kit',
        comment: sharedComment,
        setSku: '01006_rebatch',
        items: [{ correction_session_id: session }],
      },
      {
        id: 9,
        createdAt: new Date('2026-10-23T11:00:00Z'),
        operationType: 'unkit',
        comment: sharedComment,
        setSku: '02005_rebatch',
        items: [{ correction_session_id: session }],
      },
    ]);

    const correctionGroup = index.find((entry) => entry.memberIds.length === 2);
    expect(correctionGroup?.memberIds.slice().sort((a, b) => a - b)).toEqual([9, 10]);
  });

  it('розʼєднує помилкову пару з однаковою session (різний продукт)', () => {
    const session = 'sess-bad';
    const index = buildReleaseHistoryGroupIndex([
      {
        id: 553,
        createdAt: new Date('2026-10-15T16:38:00Z'),
        operationType: 'kit',
        comment: 'Коригування парт. обліку – Печеня (2564 шт.)',
        setSku: '03001_rebatch',
        quantity: 2564,
        items: [{ correction_session_id: session }],
      },
      {
        id: 552,
        createdAt: new Date('2026-10-15T16:06:00Z'),
        operationType: 'unkit',
        comment: 'Коригування парт. обліку – REBATCH: Борщ (3500 шт.)',
        setSku: '01008_rebatch',
        quantity: 3500,
        items: [{ correction_session_id: session }],
      },
    ]);

    expect(index).toHaveLength(2);
    expect(index.every((entry) => entry.memberIds.length === 1)).toBe(true);
    expect(index.map((entry) => entry.memberIds[0]).sort((a, b) => a - b)).toEqual([552, 553]);
  });
});
