import { describe, expect, it } from 'vitest';
import {
  catalogBarcodePreviewKey,
  catalogBarcodePreviewKeysEqual,
  catalogBarcodePreviewOnlyIn,
  catalogBarcodePreviewPortionLines,
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

  it('detects equal sets regardless of order', () => {
    const a = [
      { code: '1', goodPart: 'p1', goodPartName: 'A' },
      { code: '2', goodPart: '', goodPartName: null },
    ];
    const b = [
      { code: '2', goodPart: '', goodPartName: null },
      { code: '1', goodPart: 'p1', goodPartName: 'B' },
    ];
    expect(catalogBarcodePreviewKeysEqual(a, b)).toBe(true);
  });

  it('detects different codes with same length', () => {
    const a = [{ code: '1', goodPart: '', goodPartName: null }];
    const b = [{ code: '2', goodPart: '', goodPartName: null }];
    expect(catalogBarcodePreviewKeysEqual(a, b)).toBe(false);
  });

  it('filters box lines for ERP reconcile', () => {
    const lines = [
      { code: '1', goodPart: '', goodPartName: null, barcodeKind: 'portion' as const },
      { code: '2200000002419', goodPart: '', goodPartName: null, barcodeKind: 'box' as const },
    ];
    expect(catalogBarcodePreviewPortionLines(lines)).toHaveLength(1);
    expect(catalogBarcodePreviewPortionLines(lines)[0]?.code).toBe('1');
  });
});
