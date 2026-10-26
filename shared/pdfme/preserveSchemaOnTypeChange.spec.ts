import { describe, expect, it } from 'vitest';
import { preserveSchemaOnTypeChange } from './preserveSchemaOnTypeChange.js';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';

const basePdf = { width: 100, height: 100, padding: [0, 0, 0, 0] };

describe('preserveSchemaOnTypeChange', () => {
  it('keeps text and font when type changes text → multiVariableText', () => {
    const previous: LabelPdfmeTemplate = {
      basePdf,
      schemas: [[{
        id: 'a1',
        name: 'batch_number',
        type: 'text',
        content: 'Номер партії 61021',
        fontSize: 9.3,
        fontName: 'ArialBold',
        position: { x: 1, y: 2 },
        width: 10,
        height: 4,
      }]],
    };
    const next: LabelPdfmeTemplate = {
      basePdf,
      schemas: [[{
        id: 'a1',
        name: 'batch_number',
        type: 'multiVariableText',
        content: '{}',
        text: '{batch}',
        fontSize: 12,
        position: { x: 0, y: 0 },
        width: 20,
        height: 8,
      }]],
    };

    const { template, changed } = preserveSchemaOnTypeChange(previous, next);
    expect(changed).toBe(true);
    const field = template.schemas[0][0] as Record<string, unknown>;
    expect(field.type).toBe('multiVariableText');
    expect(field.fontSize).toBe(9.3);
    expect(field.fontName).toBe('ArialBold');
    expect(field.text).toBe('Номер партії 61021');
    expect(field.position).toEqual({ x: 1, y: 2 });
  });
});
