import { describe, expect, it } from 'vitest';
import {
  catalogBarcodePreviewKey,
  catalogBarcodePreviewOnlyIn,
  formatCatalogBarcodePreviewLine,
} from './catalogBarcodePreviewFormat.js';

describe('catalogBarcodePreviewFormat', () => {
  it('formats code and batch label', () => {
    expect(
      formatCatalogBarcodePreviewLine({
        code: '4820012345678',
        goodPart: 'p1',
        goodPartName: 'Партія 12',
      }),
    ).toBe('4820012345678 · Партія 12');
  });

  it('diff keys ignore order', () => {
    const a = [{ code: '1', goodPart: '', goodPartName: null }];
    const b = [{ code: '2', goodPart: '', goodPartName: null }];
    expect(catalogBarcodePreviewOnlyIn(a, b)).toEqual(new Set([catalogBarcodePreviewKey(a[0])]));
  });
});
