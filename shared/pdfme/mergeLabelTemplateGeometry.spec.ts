import { describe, expect, it } from 'vitest';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';
import { mergeLabelTemplateGeometry } from './mergeLabelTemplateGeometry';

describe('mergeLabelTemplateGeometry', () => {
  it('keeps geometry from source and content from target', () => {
    const source: LabelPdfmeTemplate = {
      basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
      schemas: [[{ name: 'barcode', type: 'ean13', position: { x: 1, y: 2 }, width: 3, height: 4, rotate: 270 }]],
    };
    const target: LabelPdfmeTemplate = {
      basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
      schemas: [
        [{ name: 'barcode', type: 'ean13', position: { x: 9, y: 9 }, width: 9, height: 9, content: '123' }],
      ],
    };
    const merged = mergeLabelTemplateGeometry(source, target);
    const field = merged.schemas[0][0];
    expect(field.position).toEqual({ x: 1, y: 2 });
    expect(field.width).toBe(3);
    expect(field.rotate).toBe(270);
    expect(field.content).toBe('123');
  });
});
