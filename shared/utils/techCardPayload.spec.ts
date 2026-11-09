import { describe, expect, it } from 'vitest';
import { EMPTY_TECH_CARD_PAYLOAD } from '../types/production.js';
import { normalizeTechCardPayload } from './techCardPayload.js';

describe('normalizeTechCardPayload', () => {
  it('returns an empty payload for null, garbage and arrays', () => {
    expect(normalizeTechCardPayload(null)).toEqual(EMPTY_TECH_CARD_PAYLOAD);
    expect(normalizeTechCardPayload('not json')).toEqual(EMPTY_TECH_CARD_PAYLOAD);
    expect(normalizeTechCardPayload([1, 2])).toEqual(EMPTY_TECH_CARD_PAYLOAD);
  });

  it('parses a JSON string and drops invalid rows', () => {
    const payload = normalizeTechCardPayload(
      JSON.stringify({
        stages: [
          { key: 's1', name: ' Бульйон ', durationMin: '90', inputRowKeys: ['r1', 'r1', '', 5] },
          { name: 'no key' },
        ],
        packaging: [
          { goodId: 'p1', qty: 2, basis: 'box' },
          { goodId: 'p2', qty: 0 },
          { goodId: 'p3', qty: 1, basis: 'pallet' },
        ],
        dosing: [{ key: 'm1', name: 'М1', rowKeys: ['r2'] }],
        notes: '  ',
        portionsPerBox: 11.6,
        lossFormula: 'sequential',
        extra: true,
      }),
    );
    expect(payload.stages).toEqual([
      {
        key: 's1',
        name: 'Бульйон',
        description: null,
        durationMin: 90,
        offsetMin: null,
        equipment: null,
        mode: null,
        inputRowKeys: ['r1'],
        inputStageKeys: [],
        outputName: null,
        yieldPercent: null,
      },
    ]);
    expect(payload.packaging).toEqual([
      { goodId: 'p1', qty: 2, basis: 'box', note: null },
      { goodId: 'p3', qty: 1, basis: 'portion', note: null },
    ]);
    expect(payload.dosing).toEqual([{ key: 'm1', name: 'М1', rowKeys: ['r2'], stageKeys: [] }]);
    expect(payload.notes).toBeNull();
    expect(payload.portionsPerBox).toBe(12);
    expect(payload.lossFormula).toBe('sequential');
  });

  it('ignores an unknown loss formula', () => {
    expect(normalizeTechCardPayload({ lossFormula: 'magic' }).lossFormula).toBeNull();
  });
});
