import { describe, expect, it } from 'vitest';
import { assertTemplateSchemaNames, unknownTemplateSchemaNames } from './validateTemplateSchemaNames';

describe('unknownTemplateSchemaNames', () => {
  it('accepts canonical field names', () => {
    const unknown = unknownTemplateSchemaNames({
      basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
      schemas: [[{ name: 'title_line1', type: 'text' }, { name: 'barcode', type: 'ean13' }]],
    });
    expect(unknown).toEqual([]);
  });

  it('reports unknown names', () => {
    const unknown = unknownTemplateSchemaNames({
      basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
      schemas: [[{ name: 'custom_note', type: 'text' }]],
    });
    expect(unknown).toEqual(['custom_note']);
  });

  it('rejects unknown MVT variables on save', () => {
    expect(() =>
      assertTemplateSchemaNames({
        basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
        schemas: [
          [{ name: 'nutrition_energy', type: 'multiVariableText', text: '{unknown}', variables: ['unknown'] }],
        ],
      }),
    ).toThrow(/multiVariableText/);
  });
});
