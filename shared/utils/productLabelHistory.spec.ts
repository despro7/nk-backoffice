import { describe, expect, it } from 'vitest';
import {
  PRODUCT_LABEL_DRAFT_SELECTION_KEY,
  productLabelHistorySelectionKey,
} from './productLabelHistory.js';

describe('productLabelHistory', () => {
  it('uses draft selection key', () => {
    expect(
      productLabelHistorySelectionKey({
        entryType: 'draft',
        goodId: '1',
        batchId: '2',
        labelKind: 'portion',
        batchNumber: 'B1',
        payload: { version: 2, templateId: null, inputs: {}, overrides: {} },
        baseInputs: {},
        updatedBy: 7,
        updatedByName: 'Тест',
        updatedAt: '2026-01-15T10:00:00.000Z',
      }),
    ).toBe(PRODUCT_LABEL_DRAFT_SELECTION_KEY);
  });

});
