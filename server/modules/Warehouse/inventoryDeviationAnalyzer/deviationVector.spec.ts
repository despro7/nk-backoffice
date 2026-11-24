import { describe, expect, it } from 'vitest';
import { buildDeviationVector } from './deviationVector.js';

describe('buildDeviationVector', () => {
  it('portions МС: boxes * ppb + portions minus system', () => {
    const v = buildDeviationVector(
      [{ sku: 'A', unit: 'portions', portionsPerBox: 10, boxCount: 2, actualCount: 3, systemBalance: 20 }],
      'small',
    );
    expect(v.get('A')).toBe(3);
  });

  it('pcs МС: actualCount minus system, boxes ignored', () => {
    const v = buildDeviationVector(
      [{ sku: 'B', unit: 'pcs', boxCount: 5, actualCount: 7, systemBalance: 10 }],
      'small',
    );
    expect(v.get('B')).toBe(-3);
  });

  it('ГП uses Gp fields', () => {
    const v = buildDeviationVector(
      [{
        sku: 'C', unit: 'portions', portionsPerBox: 6, boxCount: 100, actualCount: 100,
        boxCountGp: 1, actualCountGp: 2, systemBalance: 999, systemBalanceGp: 5,
      }],
      'gp',
    );
    expect(v.get('C')).toBe(3);
  });

  it('pcs ГП', () => {
    const v = buildDeviationVector([{ sku: 'D', unit: 'pcs', actualCountGp: 4, systemBalanceGp: 9 }], 'gp');
    expect(v.get('D')).toBe(-5);
  });

  it('skips zero deviation and items without fact', () => {
    const v = buildDeviationVector(
      [
        { sku: 'E', unit: 'pcs', actualCount: 5, systemBalance: 5 },
        { sku: 'F', unit: 'pcs', actualCount: null, systemBalance: 5 },
        { sku: 'G', unit: 'portions', portionsPerBox: 4, boxCount: null, actualCount: null, systemBalance: 3 },
      ],
      'small',
    );
    expect(v.size).toBe(0);
  });
});
