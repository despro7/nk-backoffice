import { describe, expect, it } from 'vitest';
import { INVENTORY_HISTORY_CACHE_DEFAULTS, normalizeInventoryHistoryCacheSettings } from './inventoryHistoryCache';

describe('normalizeInventoryHistoryCacheSettings', () => {
  it('returns defaults for empty or malformed input', () => {
    expect(normalizeInventoryHistoryCacheSettings(null)).toEqual(INVENTORY_HISTORY_CACHE_DEFAULTS);
    expect(normalizeInventoryHistoryCacheSettings({ recentDayTtlMinutes: 'abc' })).toEqual(INVENTORY_HISTORY_CACHE_DEFAULTS);
  });

  it('clamps values to limits and rounds them', () => {
    expect(normalizeInventoryHistoryCacheSettings({ recentDayTtlMinutes: 500, pastDayTtlMinutes: -3 })).toEqual({
      recentDayTtlMinutes: 60,
      pastDayTtlMinutes: 0,
    });
    expect(normalizeInventoryHistoryCacheSettings({ recentDayTtlMinutes: 2.6, pastDayTtlMinutes: 45 })).toEqual({
      recentDayTtlMinutes: 3,
      pastDayTtlMinutes: 45,
    });
  });
});
