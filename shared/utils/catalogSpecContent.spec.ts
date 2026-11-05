import { describe, expect, it } from 'vitest';
import type { CatalogSpecComponent } from '../types/catalogSpec.js';
import { normalizeSpecQty, specContentEquals } from './catalogSpecContent.js';

const row = (id: string, qty: number, extra: Partial<CatalogSpecComponent> = {}): CatalogSpecComponent => ({
  componentGoodId: id,
  name: id,
  sku: null,
  qty,
  rowNum: 1,
  unitId: 'u1',
  note: null,
  cookingLossPercent: 0,
  ...extra,
});

describe('specContentEquals', () => {
  it('ignores row order and rowNum', () => {
    expect(
      specContentEquals(
        { specQty: 1, components: [row('a', 1, { rowNum: 1 }), row('b', 2, { rowNum: 2 })] },
        { specQty: 1, components: [row('b', 2, { rowNum: 1 }), row('a', 1, { rowNum: 2 })] },
      ),
    ).toBe(true);
  });

  it('detects qty, note and cooking loss changes', () => {
    const base = { specQty: 1, components: [row('a', 1)] };
    expect(specContentEquals(base, { specQty: 1, components: [row('a', 1.5)] })).toBe(false);
    expect(specContentEquals(base, { specQty: 1, components: [row('a', 1, { note: 'x' })] })).toBe(false);
    expect(specContentEquals(base, { specQty: 1, components: [row('a', 1, { cookingLossPercent: 10 })] })).toBe(false);
  });

  it('treats empty note as null and duplicate ingredients as a multiset', () => {
    expect(
      specContentEquals(
        { specQty: null, components: [row('a', 1, { note: '  ' }), row('a', 1)] },
        { specQty: null, components: [row('a', 1), row('a', 1)] },
      ),
    ).toBe(true);
    expect(
      specContentEquals(
        { specQty: null, components: [row('a', 1), row('a', 1)] },
        { specQty: null, components: [row('a', 1)] },
      ),
    ).toBe(false);
  });

  it('compares specQty with the default of 1', () => {
    expect(specContentEquals({ specQty: 0, components: [] }, { specQty: 1, components: [] })).toBe(true);
    expect(specContentEquals({ specQty: 2, components: [] }, { specQty: 1, components: [] })).toBe(false);
    expect(normalizeSpecQty(undefined)).toBe(1);
  });
});
