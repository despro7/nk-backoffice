import { describe, expect, it } from 'vitest';
import {
  formatReleaseInternalDocDisplayNumber,
  parseReleaseInternalDocNumericId,
} from './releaseHistoryDisplayDocNumber.js';

describe('releaseHistoryDisplayDocNumber', () => {
  it('formatReleaseInternalDocDisplayNumber', () => {
    expect(formatReleaseInternalDocDisplayNumber('K-000452')).toBe('№452');
    expect(formatReleaseInternalDocDisplayNumber(null)).toBeNull();
  });

  it('parseReleaseInternalDocNumericId', () => {
    expect(parseReleaseInternalDocNumericId('K-000452', 1)).toBe(452);
  });
});
