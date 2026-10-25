import { describe, expect, it } from 'vitest';
import {
  auditLinkedReleaseCorrectionSessions,
  buildReleaseCorrectionMatchKey,
  partitionCorrectionSessionMembers,
  planReleaseCorrectionPairLinks,
  releaseCorrectionPairIsConsistent,
  type ReleasePairCandidate,
} from './linkReleaseCorrectionPairs.js';

function row(partial: Partial<ReleasePairCandidate> & Pick<ReleasePairCandidate, 'id' | 'operationType'>): ReleasePairCandidate {
  return {
    internalDocNumber: null,
    setSku: '01006_rebatch',
    quantity: 589,
    comment: 'Коригування парт. обліку – REBATCH: Суп (589 шт.)',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    correctionSessionId: null,
    items: [{ set_sku: '01006_rebatch' }],
    ...partial,
  };
}

describe('buildReleaseCorrectionMatchKey', () => {
  it('rebatch: однаковий ключ при різному setSku, однаковий текст продукту', () => {
    const comment = 'Коригування парт. обліку – REBATCH: Суп (589 шт.)';
    const kitKey = buildReleaseCorrectionMatchKey(row({
      id: 603,
      operationType: 'kit',
      comment,
      setSku: '01006_rebatch',
      quantity: 589,
    }));
    const unkitKey = buildReleaseCorrectionMatchKey(row({
      id: 628,
      operationType: 'unkit',
      comment,
      setSku: '02005_rebatch',
      quantity: 589,
    }));
    expect(kitKey).toBe(unkitKey);
  });

  it('однаковий ключ для kit і unkit', () => {
    const comment = 'Коригування парт. обліку – REBATCH: Суп (589 шт.)';
    const kitKey = buildReleaseCorrectionMatchKey(row({ id: 1, operationType: 'kit', comment }));
    const unkitKey = buildReleaseCorrectionMatchKey(row({
      id: 2,
      operationType: 'unkit',
      comment,
      createdAt: new Date('2026-10-23T10:05:00Z'),
    }));
    expect(kitKey).toBe(unkitKey);
  });
});

describe('planReleaseCorrectionPairLinks', () => {
  it('зʼєднує одну пару kit+unkit', () => {
    const comment = 'Коригування парт. обліку – REBATCH: Суп (589 шт.)';
    const result = planReleaseCorrectionPairLinks([
      row({ id: 10, operationType: 'kit', comment, createdAt: new Date('2026-10-23T10:00:00Z') }),
      row({ id: 11, operationType: 'unkit', comment, createdAt: new Date('2026-10-23T10:02:00Z') }),
    ], () => 'session-test');

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].kit.id).toBe(10);
    expect(result.pairs[0].unkit.id).toBe(11);
    expect(result.pairs[0].sessionId).toBe('session-test');
  });

  it('зʼєднує kit і unkit з різними correctionSessionId', () => {
    const comment = 'Коригування парт. обліку – REBATCH: Суп (589 шт.)';
    const result = planReleaseCorrectionPairLinks([
      row({
        id: 603,
        operationType: 'kit',
        comment,
        quantity: 589,
        correctionSessionId: 'session-a',
        items: [{ set_sku: '01006_rebatch', correction_session_id: 'session-a' }],
      }),
      row({
        id: 628,
        operationType: 'unkit',
        comment,
        quantity: 589,
        correctionSessionId: 'session-b',
        items: [{ set_sku: '01006_rebatch', correction_session_id: 'session-b' }],
        createdAt: new Date('2026-10-23T11:00:00Z'),
      }),
    ], () => 'unified-session');

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].kit.id).toBe(603);
    expect(result.pairs[0].unkit.id).toBe(628);
    expect(result.pairs[0].sessionId).toBe('unified-session');
    expect(result.skipped.some((s) => s.reason.includes('Конфлікт'))).toBe(false);
  });

  it('не вважає парою kit+unkit з різним matchKey', () => {
    const kitComment = 'Коригування парт. обліку – REBATCH: Печеня (2564 шт.)';
    const unkitComment = 'Коригування парт. обліку – REBATCH: Борщ (3500 шт.)';
    expect(releaseCorrectionPairIsConsistent(
      row({ id: 553, operationType: 'kit', comment: kitComment, quantity: 2564, setSku: '03001_rebatch' }),
      row({ id: 552, operationType: 'unkit', comment: unkitComment, quantity: 3500, setSku: '01008_rebatch' }),
    )).toBe(false);

    const partitions = partitionCorrectionSessionMembers([
      row({ id: 553, operationType: 'kit', comment: kitComment, quantity: 2564, correctionSessionId: 'bad' }),
      row({ id: 552, operationType: 'unkit', comment: unkitComment, quantity: 3500, correctionSessionId: 'bad' }),
    ]);
    expect(partitions).toHaveLength(2);
    expect(partitions.every((group) => group.length === 1)).toBe(true);

    const audit = auditLinkedReleaseCorrectionSessions([
      row({ id: 553, operationType: 'kit', comment: kitComment, quantity: 2564, correctionSessionId: 'bad' }),
      row({ id: 552, operationType: 'unkit', comment: unkitComment, quantity: 3500, correctionSessionId: 'bad' }),
    ]);
    expect(audit.invalidLinked).toHaveLength(1);
    expect(audit.invalidLinked[0].kit.id).toBe(553);
    expect(audit.invalidLinked[0].unkit.id).toBe(552);
  });

  it('зʼєднує 1 kit і 2 unkit (помилка + повтор) в одну session', () => {
    const comment = 'Коригування парт. обліку – REBATCH: Суп (4040 шт.)';
    const result = planReleaseCorrectionPairLinks([
      row({ id: 496, operationType: 'kit', comment, quantity: 4040, createdAt: new Date('2026-10-13T13:03:00Z') }),
      row({
        id: 497,
        operationType: 'unkit',
        comment,
        quantity: 4040,
        createdAt: new Date('2026-10-13T13:04:00Z'),
      }),
      row({
        id: 498,
        operationType: 'unkit',
        comment,
        quantity: 4040,
        createdAt: new Date('2026-10-13T14:04:00Z'),
      }),
    ], () => 'session-496');

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].memberIds).toEqual([496, 497, 498]);
    expect(result.pairs[0].sessionId).toBe('session-496');
    expect(result.skipped.filter((item) => item.unkitIds.includes(498))).toHaveLength(0);
  });

  it('пропускає неоднозначність (2 kit, 1 unkit)', () => {
    const comment = 'Коригування парт. обліку – same';
    const result = planReleaseCorrectionPairLinks([
      row({ id: 1, operationType: 'kit', comment, createdAt: new Date('2026-10-23T09:00:00Z') }),
      row({ id: 2, operationType: 'kit', comment, createdAt: new Date('2026-10-23T10:00:00Z') }),
      row({ id: 3, operationType: 'unkit', comment, createdAt: new Date('2026-10-23T11:00:00Z') }),
    ]);

    expect(result.pairs).toHaveLength(1);
    expect(result.skipped.some((item) => item.kitIds.includes(2))).toBe(true);
  });
});
