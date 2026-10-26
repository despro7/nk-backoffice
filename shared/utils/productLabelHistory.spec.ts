import { describe, expect, it } from 'vitest';
import {
  formatProductLabelHistoryCaption,
  formatProductLabelHistoryOption,
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

  it('formats draft and published labels', () => {
    const draft = formatProductLabelHistoryOption({
      entryType: 'draft',
      goodId: '1',
      batchId: '2',
      labelKind: 'portion',
      batchNumber: 'B1',
      payload: { version: 2, templateId: null, inputs: {}, overrides: {} },
      baseInputs: {},
      updatedBy: 1,
      updatedByName: 'Анна',
      updatedAt: '2026-01-15T10:00:00.000Z',
    });
    expect(draft).toContain('Чернетка');
    expect(draft).toContain('Анна');

    const published = formatProductLabelHistoryCaption({
      entryType: 'published',
      id: 3,
      goodId: '1',
      batchId: '2',
      labelKind: 'portion',
      batchNumber: 'B1',
      version: 2,
      barcode: '',
      pdfFileName: 'x.pdf',
      payload: { version: 2, templateId: null, inputs: {}, overrides: {} },
      publishedBy: 1,
      publishedByName: 'Богдан',
      publishedAt: '2026-01-16T12:00:00.000Z',
    });
    expect(published).toContain('Згенеровано');
    expect(published).toContain('Богдан');
    expect(published).toContain('партія B1');
  });
});
