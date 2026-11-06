import { describe, expect, it } from 'vitest';
import { isPotentialStatusRollback, shouldSkipStatusSyncRollback } from './statusMapper.js';

const pickedAt = new Date('2026-11-01T10:00:00Z');
const before = new Date('2026-11-01T09:59:00Z');
const after = new Date('2026-11-01T10:05:00Z');

describe('isPotentialStatusRollback', () => {
  it('true лише для локального 3 і incoming 1/2', () => {
    expect(isPotentialStatusRollback('3', '2')).toBe(true);
    expect(isPotentialStatusRollback('3', 1)).toBe(true);
    expect(isPotentialStatusRollback('3', '4')).toBe(false);
    expect(isPotentialStatusRollback('9', '2')).toBe(false);
    expect(isPotentialStatusRollback('2', '2')).toBe(false);
  });
});

describe('shouldSkipStatusSyncRollback', () => {
  it('блокує stale 2 після локальної комплектації', () => {
    expect(
      shouldSkipStatusSyncRollback({
        localStatus: '3',
        incomingStatus: '2',
        incomingUpdatedAt: before,
        localPickedAt: pickedAt,
      }),
    ).toBe(true);
  });

  it('приймає навмисний відкат 3 → 2 у SD після комплектації', () => {
    expect(
      shouldSkipStatusSyncRollback({
        localStatus: '3',
        incomingStatus: '2',
        incomingUpdatedAt: after,
        localPickedAt: pickedAt,
      }),
    ).toBe(false);
  });

  it('блокує, якщо немає updateAt із SD', () => {
    expect(
      shouldSkipStatusSyncRollback({ localStatus: '3', incomingStatus: '2', localPickedAt: pickedAt }),
    ).toBe(true);
  });

  it('дозволяє просування 3 → 4', () => {
    expect(
      shouldSkipStatusSyncRollback({ localStatus: '3', incomingStatus: '4', localPickedAt: pickedAt }),
    ).toBe(false);
  });

  it('дозволяє вихід з утримання 9 → 4 / 2 (повторний цикл)', () => {
    expect(shouldSkipStatusSyncRollback({ localStatus: '9', incomingStatus: '4' })).toBe(false);
    expect(shouldSkipStatusSyncRollback({ localStatus: '9', incomingStatus: '2' })).toBe(false);
  });

  it('дозволяє переходи між кінцевими статусами 6 → 5, 7 → 5', () => {
    expect(shouldSkipStatusSyncRollback({ localStatus: '6', incomingStatus: '5' })).toBe(false);
    expect(shouldSkipStatusSyncRollback({ localStatus: '7', incomingStatus: '5' })).toBe(false);
  });

  it('дозволяє термінал Відмова (6) після комплектації', () => {
    expect(shouldSkipStatusSyncRollback({ localStatus: '3', incomingStatus: '6' })).toBe(false);
  });
});
