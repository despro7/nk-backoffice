import { describe, expect, it } from 'vitest';
import {
  parseWarehouseDocHistoryListQuery,
  warehouseDocHistoryRowMatchesSearch,
  hasActiveWarehouseDocHistoryFilters,
  DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS,
} from './warehouseDocHistoryListQuery.js';

describe('parseWarehouseDocHistoryListQuery', () => {
  it('parses filters and legacy from/to', () => {
    const parsed = parseWarehouseDocHistoryListQuery({
      page: '2',
      limit: '20',
      search: 'sku-1',
      from: '2026-01-01',
      to: '2026-01-31',
      sortBy: 'docNumber',
      sortOrder: 'asc',
      dateField: 'createdAt',
    });
    expect(parsed).toMatchObject({
      page: 2,
      limit: 20,
      search: 'sku-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      sortBy: 'docNumber',
      sortOrder: 'asc',
      dateField: 'createdAt',
      status: 'active',
    });
  });
});

describe('warehouseDocHistoryRowMatchesSearch', () => {
  it('matches doc number and items json', () => {
    expect(warehouseDocHistoryRowMatchesSearch(
      { docNumber: 'WO-12', items: [{ sku: 'ABC-99' }] },
      'abc-99',
    )).toBe(true);
    expect(warehouseDocHistoryRowMatchesSearch({ id: 42 }, '42')).toBe(true);
  });
});

describe('hasActiveWarehouseDocHistoryFilters', () => {
  it('is false for defaults', () => {
    expect(hasActiveWarehouseDocHistoryFilters(DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS)).toBe(false);
  });
});
