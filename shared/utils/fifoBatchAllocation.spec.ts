import { describe, expect, it } from 'vitest';
import { allocateBatchesFifo, fifoBatchTimestamp, sortBatchesFifo } from './fifoBatchAllocation.js';

const NOW = new Date('2026-10-08T12:00:00Z');

describe('fifoBatchAllocation', () => {
  it('reads YMMDD serials as production dates, older first', () => {
    const older = fifoBatchTimestamp({ batchNumber: '60814', expiration: null }, NOW);
    const newer = fifoBatchTimestamp({ batchNumber: '60917', expiration: null }, NOW);
    expect(new Date(older).toISOString().slice(0, 10)).toBe('2026-08-14');
    expect(new Date(newer).toISOString().slice(0, 10)).toBe('2026-09-17');
    expect(older).toBeLessThan(newer);
  });

  it('allocates required quantity from older batches before newer ones', () => {
    const allocated = allocateBatchesFifo([
      { batchId: '2', batchNumber: '60917', quantity: 249 },
      { batchId: '1', batchNumber: '60814', quantity: 87 },
      { batchId: '3', batchNumber: '61001', quantity: 40 },
    ], 100, NOW);

    expect(allocated.map((batch) => [batch.batchNumber, batch.quantity])).toEqual([
      ['60814', 87],
      ['60917', 13],
    ]);
  });

  it('prefers a date in the label over a later expiration', () => {
    const sorted = sortBatchesFifo([
      { batchId: 'a', batchNumber: '61001', quantity: 5, expiration: '2026-01-01' },
      { batchId: 'b', batchNumber: '03.09.2026 Оприбуткування 000096', quantity: 6, expiration: '2027-01-01' },
    ], NOW);

    expect(sorted.map((batch) => batch.batchId)).toEqual(['b', 'a']);
  });

  it('puts batches without a date after dated ones', () => {
    const sorted = sortBatchesFifo([
      { batchId: '1112200000001986', batchNumber: '1112200000001986', quantity: 3, expiration: null },
      { batchId: '1', batchNumber: 'K-61008', quantity: 2, expiration: null },
    ], NOW);

    expect(sorted[0]?.batchNumber).toBe('K-61008');
  });
});
