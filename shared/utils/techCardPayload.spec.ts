import { describe, expect, it } from 'vitest';
import { EMPTY_TECH_CARD_PAYLOAD } from '../types/production.js';
import { normalizeTechCardPayload, pruneTechCardRefs, sanitizeStageHtml, techCardCoverage } from './techCardPayload.js';

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

describe('techCardCoverage / pruneTechCardRefs', () => {
  const stage = (key: string, inputRowKeys: string[], inputStageKeys: string[] = []) => ({
    key,
    name: key,
    description: null,
    durationMin: null,
    offsetMin: null,
    equipment: null,
    mode: null,
    inputRowKeys,
    inputStageKeys,
    outputName: null,
    yieldPercent: null,
  });
  const payload = {
    ...EMPTY_TECH_CARD_PAYLOAD,
    stages: [stage('broth', ['bones', 'water']), stage('final', ['gone'], ['broth', 'later'])],
    dosing: [{ key: 'm1', name: 'М1', rowKeys: ['potato', 'gone2'], stageKeys: ['final', 'nope'] }],
  };

  it('finds unassigned rows and missing refs', () => {
    const coverage = techCardCoverage(payload, ['bones', 'water', 'potato']);
    expect(coverage.unassignedRowKeys).toEqual(['potato']);
    expect(coverage.missingRefs.map((r) => `${r.owner}:${r.rowKey}`)).toEqual(['stage:gone', 'dosing:gone2']);
  });

  it('reports nothing unassigned while there are no stages', () => {
    expect(techCardCoverage(EMPTY_TECH_CARD_PAYLOAD, ['a']).unassignedRowKeys).toEqual([]);
  });

  it('prunes refs to missing rows and to later or unknown stages', () => {
    const pruned = pruneTechCardRefs(payload, ['bones', 'water', 'potato']);
    expect(pruned.stages[1].inputRowKeys).toEqual([]);
    expect(pruned.stages[1].inputStageKeys).toEqual(['broth']);
    expect(pruned.dosing[0]).toMatchObject({ rowKeys: ['potato'], stageKeys: ['final'] });
  });
});

describe('sanitizeStageHtml', () => {
  it('keeps basic formatting and drops attributes, scripts and unknown tags', () => {
    expect(
      sanitizeStageHtml(
        '<p class="x" onclick="a()">Варити <strong>20 хв</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:x">лінк</a>',
      ),
    ).toBe('<p>Варити <strong>20 хв</strong></p>лінк');
  });

  it('drops an empty description in the payload', () => {
    const payload = normalizeTechCardPayload({ stages: [{ key: 's', name: 'a', description: '<p></p>' }] });
    expect(payload.stages[0].description).toBeNull();
  });
});

describe('sanitizeStageHtml: unclosed tags', () => {
  it('escapes a dangling tag', () => {
    expect(sanitizeStageHtml('<p>t</p><img src=x onerror=alert(1)')).toBe('<p>t</p>&lt;img src=x onerror=alert(1)');
  });
});
