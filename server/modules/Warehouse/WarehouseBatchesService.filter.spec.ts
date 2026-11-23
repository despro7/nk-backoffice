import { describe, expect, it } from 'vitest';
import type { WarehouseBatchListItem } from '../../../shared/types/warehouse.js';
import { filterBatchItemsByProduct } from './WarehouseBatchesService.js';

const item = (batchId: string, sku: string | null, productId: string) =>
  ({ batchId, sku, productId }) as WarehouseBatchListItem;

describe('filterBatchItemsByProduct', () => {
  const items = [item('a', '08001', 'p1'), item('b', '08002', 'p2'), item('c', '08001', 'p1')];

  it('returns all items without filter', () => {
    expect(filterBatchItemsByProduct(items)).toHaveLength(3);
    expect(filterBatchItemsByProduct(items, { sku: ' ' })).toHaveLength(3);
  });

  it('filters by sku', () => {
    expect(filterBatchItemsByProduct(items, { sku: '08001' }).map((i) => i.batchId)).toEqual(['a', 'c']);
  });

  it('filters by productId', () => {
    expect(filterBatchItemsByProduct(items, { productId: 'p2' }).map((i) => i.batchId)).toEqual(['b']);
  });
});
