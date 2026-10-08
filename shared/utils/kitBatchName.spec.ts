import { describe, expect, it } from 'vitest';
import {
  formatKitBatchDisplayName,
  isKitBatchCode,
  normalizeKitBatchCore,
  planKitOutputBatch,
  refineKitOutputBatchPlanForOccupiedCodes,
} from './kitBatchName.js';

describe('kitBatchName', () => {
  it('treats K61008 and K-61008 as the same kit family', () => {
    expect(normalizeKitBatchCore('K61008')).toBe('61008');
    expect(normalizeKitBatchCore('K-61008')).toBe('61008');
    expect(isKitBatchCode('K61008', 'K-61008')).toBe(true);
  });

  it('plans suffix when base serial is globally occupied', () => {
    const plan = refineKitOutputBatchPlanForOccupiedCodes(
      'K-61008',
      [],
      '2027-07-10',
      ['K-61008'],
    );
    expect(plan.createNew).toBe(true);
    expect(plan.batchName).toBe('K-61008-1');
  });

  it('reuses existing batch on owner when expiration allows', () => {
    const plan = planKitOutputBatch(
      'K-61008',
      [{ id: '1112200000001986', code: 'K61008', expiration: '2027-07-10' }],
      '2027-07-10',
    );
    expect(plan.reuseExisting).toBe(true);
    expect(plan.batchId).toBe('1112200000001986');
    expect(plan.batchName).toBe('K-61008');
  });

  it('normalizes legacy K61008-1 display name to K-61008-1', () => {
    expect(formatKitBatchDisplayName('K61008-1')).toBe('K-61008-1');
  });
});
