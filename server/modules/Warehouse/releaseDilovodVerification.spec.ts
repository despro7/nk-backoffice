import { describe, expect, it } from 'vitest';
import { compareTpGoodsWithDilovod } from './releaseDilovodVerification.js';

describe('compareTpGoodsWithDilovod', () => {
  const expected = [
    { good: 'G1', goodPart: '1112200000002125', qty: 5 },
    { good: 'G1', goodPart: '1110800000003575', qty: 3 },
    { good: 'G1', goodPart: '1110800000003578', qty: 2 },
  ];

  it('ok, коли Dilovod зберіг усі рядки', () => {
    const actual = {
      '1': { good: 'G1', goodPart: '1112200000002125', qty: '5.000' },
      '2': { good: 'G1', goodPart: '1110800000003575', qty: '3.000' },
      '3': { good: 'G1', goodPart: '1110800000003578', qty: '2.000' },
    };
    const result = compareTpGoodsWithDilovod(expected, actual);
    expect(result.ok).toBe(true);
    expect(result.expectedQty).toBe(10);
    expect(result.actualQty).toBe(10);
  });

  it('знаходить відкинуті рядки (як у K-000699)', () => {
    const actual = { '1': { good: 'G1', goodPart: '1112200000002125', qty: '5.000' } };
    const result = compareTpGoodsWithDilovod(expected, actual, { goodLabels: new Map([['G1', 'Котлети курячі']]) });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(['Котлети курячі: відправлено 10 шт., у документі Dilovod 5 шт.']);
  });

  it('приймає tpGoods як масив і ігнорує нульові рядки', () => {
    const result = compareTpGoodsWithDilovod(
      [{ good: 'G2', qty: 4 }],
      [{ good: 'G2', goodPart: '0', qty: '4.000' }],
    );
    expect(result.ok).toBe(true);
  });

  it('повідомляє про рядок, якого не відправляли', () => {
    const result = compareTpGoodsWithDilovod([{ good: 'G2', qty: 4 }], [
      { good: 'G2', qty: '4.000' },
      { good: 'G3', qty: '1.000' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain('G3');
  });
});
