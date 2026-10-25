import { describe, expect, it } from 'vitest';
import { mergeReleaseHistoryCorrections } from './mergeReleaseHistoryCorrections.js';

describe('mergeReleaseHistoryCorrections', () => {
  it('обʼєднує unkit + kit однієї сесії', () => {
    const session = 'sess-1';
    const records = [
      {
        id: '10',
        createdAt: '2026-10-23T12:00:00Z',
        operationType: 'kit',
        correctionSessionId: session,
        comment: 'Коригування парт. обліку – REBATCH: Суп (589 шт.)',
        items: [],
      },
      {
        id: '9',
        createdAt: '2026-10-23T11:59:00Z',
        operationType: 'unkit',
        correctionSessionId: session,
        comment: 'Коригування парт. обліку – REBATCH: Суп (589 шт.)',
        items: [],
      },
      {
        id: '8',
        createdAt: '2026-10-22T10:00:00Z',
        operationType: 'kit',
        correctionSessionId: null,
        comment: 'Звичайне комплектування',
        items: [],
      },
    ];

    const merged = mergeReleaseHistoryCorrections(records);
    expect(merged).toHaveLength(2);

    const correction = merged[0] as { isCorrectionMerged: boolean; correctionLayers: { recordId: string; operationType: string }[]; id: string };
    expect(correction.isCorrectionMerged).toBe(true);
    expect(correction.id).toBe('10');
    expect(correction.correctionLayers.map((l) => l.recordId)).toEqual(['10', '9']);
    expect(correction.correctionLayers.map((l) => l.operationType)).toEqual(['kit', 'unkit']);

    expect(merged[1]).toMatchObject({ id: '8', operationType: 'kit' });
  });

  it('лишає одиночне коригування з одним шаром', () => {
    const merged = mergeReleaseHistoryCorrections([{
      id: '1',
      operationType: 'unkit',
      correctionSessionId: 'solo',
      comment: 'Коригування парт. обліку – test',
      items: [],
    }]);

    expect(merged).toHaveLength(1);
    const row = merged[0] as { isCorrectionMerged: boolean; correctionLayers: unknown[] };
    expect(row.isCorrectionMerged).toBe(false);
    expect(row.correctionLayers).toHaveLength(1);
  });
});
