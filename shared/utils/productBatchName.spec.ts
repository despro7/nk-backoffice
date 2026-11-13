import { describe, expect, it } from 'vitest';
import {
  formatProductBatchBaseName,
  isSameDayProductBatch,
  nextFreeProductBatchName,
  productBatchSuffix,
} from './productBatchName';

describe('formatProductBatchBaseName', () => {
  it('formats YMMDD without prefix', () => {
    expect(formatProductBatchBaseName('2026-11-13')).toBe('61113');
    expect(formatProductBatchBaseName('2027-01-05')).toBe('70105');
  });

  it('returns null for invalid dates', () => {
    expect(formatProductBatchBaseName('')).toBeNull();
    expect(formatProductBatchBaseName('13.11.2026')).toBeNull();
  });
});

describe('productBatchSuffix', () => {
  it('detects base and suffixed codes', () => {
    expect(productBatchSuffix('61113', '61113')).toBe(0);
    expect(productBatchSuffix('61113-2', '61113')).toBe(2);
  });

  it('ignores kit batches and other days', () => {
    expect(productBatchSuffix('K-61113', '61113')).toBe(-1);
    expect(productBatchSuffix('61114', '61113')).toBe(-1);
    expect(productBatchSuffix('611130', '61113')).toBe(-1);
    expect(isSameDayProductBatch('61113-x', '61113')).toBe(false);
  });
});

describe('nextFreeProductBatchName', () => {
  it('returns base when free', () => {
    expect(nextFreeProductBatchName('61113', [])).toBe('61113');
    expect(nextFreeProductBatchName('61113', ['K-61113', '61112'])).toBe('61113');
  });

  it('adds next suffix when base is taken', () => {
    expect(nextFreeProductBatchName('61113', ['61113'])).toBe('61113-1');
    expect(nextFreeProductBatchName('61113', ['61113', '61113-3', '61113-1'])).toBe('61113-4');
  });
});
