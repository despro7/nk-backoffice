import { describe, expect, it } from 'vitest';
import { parseDilovodStockFirmScope, resolveStockFirmFilter } from './dilovod';

describe('parseDilovodStockFirmScope', () => {
  it('defaults to all firms', () => {
    expect(parseDilovodStockFirmScope(undefined)).toBe('all');
    expect(parseDilovodStockFirmScope('')).toBe('all');
    expect(parseDilovodStockFirmScope('garbage')).toBe('all');
    expect(parseDilovodStockFirmScope('all')).toBe('all');
    expect(parseDilovodStockFirmScope('default')).toBe('default');
  });
});

describe('resolveStockFirmFilter', () => {
  it('sums all firms unless default scope with a firm set', () => {
    expect(resolveStockFirmFilter('all', 'firm-1')).toBeUndefined();
    expect(resolveStockFirmFilter('default', 'firm-1')).toBe('firm-1');
    expect(resolveStockFirmFilter('default', '  ')).toBeUndefined();
    expect(resolveStockFirmFilter('default', undefined)).toBeUndefined();
  });
});
