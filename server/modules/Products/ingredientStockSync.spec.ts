import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/utils.js', () => ({ prisma: {} }));

import {
  DILOVOD_PRODUCTION_STORAGE_ID,
  DILOVOD_RAW_MATERIALS_STORAGE_ID,
  buildIngredientStockJson,
} from '../../../shared/utils/catalogStock.js';
import { aggregateIngredientStockRows, diffIngredientStock } from './ingredientStockSync.js';

const RAW = DILOVOD_RAW_MATERIALS_STORAGE_ID;
const PROD = DILOVOD_PRODUCTION_STORAGE_ID;

describe('aggregateIngredientStockRows', () => {
  it('sums firms per storage and ignores other storages', () => {
    const totals = aggregateIngredientStockRows([
      { id: 'a', storage: RAW, qty: '10.500' },
      { id: 'a', storage: RAW, qty: '1.250' },
      { id: 'a', storage: PROD, qty: '3' },
      { id: 'a', storage: '1100700000001005', qty: '99' },
      { id: 'b', storage: PROD, qty: null },
      { id: '', storage: RAW, qty: '5' },
    ]);
    expect(totals.get('a')).toEqual({ rawStock: 11.75, productionStock: 3 });
    expect(totals.get('b')).toEqual({ rawStock: 0, productionStock: 0 });
    expect(totals.size).toBe(2);
  });
});

describe('diffIngredientStock', () => {
  it('writes zeros for goods missing in Dilovod response and skips unchanged', () => {
    const totals = new Map([['a', { rawStock: 2, productionStock: 0 }]]);
    const changes = diffIngredientStock(
      [
        { id: 'a', stockBalanceByStock: buildIngredientStockJson(2, 0) },
        { id: 'b', stockBalanceByStock: null },
        { id: 'c', stockBalanceByStock: buildIngredientStockJson(5, 1) },
      ],
      totals,
    );
    expect(changes).toEqual([
      { id: 'b', json: buildIngredientStockJson(0, 0) },
      { id: 'c', json: buildIngredientStockJson(0, 0) },
    ]);
  });
});
