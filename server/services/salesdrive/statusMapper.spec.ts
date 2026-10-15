import { describe, expect, it } from 'vitest';
import { shouldSkipStatusSyncRollback } from './statusMapper.js';

describe('shouldSkipStatusSyncRollback', () => {
  it('не блокує без readyToShipAt', () => {
    expect(shouldSkipStatusSyncRollback({ status: '3', readyToShipAt: null }, '2')).toBe(false);
  });

  it('блокує відкат 3 → 2 після комплектації', () => {
    expect(
      shouldSkipStatusSyncRollback({ status: '3', readyToShipAt: new Date() }, '2'),
    ).toBe(true);
  });

  it('дозволяє просування 3 → 4', () => {
    expect(
      shouldSkipStatusSyncRollback({ status: '3', readyToShipAt: new Date() }, '4'),
    ).toBe(false);
  });

  it('блокує stale 2 коли локально ще 2, але readyToShipAt уже є', () => {
    expect(
      shouldSkipStatusSyncRollback({ status: '2', readyToShipAt: new Date() }, '2'),
    ).toBe(true);
  });

  it('дозволяє підтягнути 3 при розсинхроні status=2 + readyToShipAt', () => {
    expect(
      shouldSkipStatusSyncRollback({ status: '2', readyToShipAt: new Date() }, '3'),
    ).toBe(false);
  });

  it('дозволяє термінал Відмова (6) після комплектації', () => {
    expect(
      shouldSkipStatusSyncRollback({ status: '3', readyToShipAt: new Date() }, '6'),
    ).toBe(false);
  });
});
