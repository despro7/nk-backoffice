import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/utils.js', () => ({ prisma: {}, logServer: vi.fn() }));
vi.mock('./DilovodApiClient.js', () => ({ DilovodApiClient: class {} }));
vi.mock('./DilovodMetadataService.js', () => ({ dilovodMetadataService: {} }));
vi.mock('./ProductMovementsService.js', () => ({}));
vi.mock('./WarehouseStatementService.js', () => ({ WarehouseStatementQueryError: class extends Error {} }));

const { buildHistorySeries, daysBetween, pickHistoryBucket } = await import('./WarehouseStatementHistoryService.js');

describe('daysBetween / pickHistoryBucket', () => {
  it('counts inclusive days', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(31);
  });

  it('switches to weeks for long periods', () => {
    expect(pickHistoryBucket('2026-10-01', '2026-10-31')).toBe('day');
    expect(pickHistoryBucket('2026-01-01', '2026-12-31')).toBe('week');
  });
});

describe('buildHistorySeries', () => {
  it('accumulates daily balances from opening', () => {
    const points = buildHistorySeries({
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      bucket: 'day',
      opening: { qty: 10, amount: 100 },
      movements: [
        { date: '2026-10-01', qtyReceipt: 5, qtyExpense: 0, amountReceipt: 50, amountExpense: 0 },
        { date: '2026-10-03', qtyReceipt: 0, qtyExpense: 12, amountReceipt: 0, amountExpense: 120 },
        { date: '2026-09-30', qtyReceipt: 99, qtyExpense: 0, amountReceipt: 0, amountExpense: 0 },
      ],
    });
    expect(points.map((point) => point.qtyEnd)).toEqual([15, 15, 3]);
    expect(points.map((point) => point.amountEnd)).toEqual([150, 150, 30]);
    expect(points[2].qtyExpense).toBe(12);
  });

  it('groups weeks from the start date with a partial last week', () => {
    const points = buildHistorySeries({
      startDate: '2026-10-01',
      endDate: '2026-10-10',
      bucket: 'week',
      opening: { qty: 0, amount: 0 },
      movements: [{ date: '2026-10-09', qtyReceipt: 2, qtyExpense: 0, amountReceipt: 0, amountExpense: 0 }],
    });
    expect(points).toHaveLength(2);
    expect(points[1]).toMatchObject({ date: '2026-10-08', endDate: '2026-10-10', qtyReceipt: 2, qtyEnd: 2 });
  });
});
