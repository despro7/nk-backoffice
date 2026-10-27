import { describe, expect, it } from 'vitest';
import { compareReturnHistoryOperDate, resolveReturnHistoryOperDateForSort } from './returnHistoryOperDate.js';

describe('returnHistoryOperDate', () => {
  it('uses createdAt when returnDate is null', () => {
    const created = new Date('2026-10-27T10:00:00.000Z');
    expect(resolveReturnHistoryOperDateForSort(null, created)).toEqual(created);
  });

  it('uses createdAt when returnDate looks like stale orderDate', () => {
    const created = new Date('2026-10-20T10:00:00.000Z');
    const orderDate = new Date('2026-04-29T09:00:00.000Z');
    expect(resolveReturnHistoryOperDateForSort(orderDate, created)).toEqual(created);
  });

  it('sorts null returnDate by createdAt among dated rows', () => {
    const recent = {
      id: 1,
      returnDate: null,
      createdAt: new Date('2026-10-27T10:00:00.000Z'),
    };
    const olderOper = {
      id: 2,
      returnDate: new Date('2026-07-23T11:00:00.000Z'),
      createdAt: new Date('2026-07-24T10:00:00.000Z'),
    };
    expect(compareReturnHistoryOperDate(recent, olderOper, 'desc')).toBeLessThan(0);
  });
});
