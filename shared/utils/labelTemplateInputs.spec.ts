import { describe, expect, it } from 'vitest';
import { buildLabelInputs } from './labelInputs.js';
import { resolvePdfmeInputs, unknownMvtVariableNames } from './labelTemplateInputs.js';

describe('resolvePdfmeInputs', () => {
  const baseTemplate = {
    basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] as [number, number, number, number] },
    schemas: [
      [
        { name: 'title_line1', type: 'text' },
        {
          name: 'nutrition_energy',
          type: 'multiVariableText',
          text: 'Калораж {kcal} ккал',
          variables: ['kcal'],
        },
        { name: 'nutrition_proteins', type: 'text' },
      ],
    ],
  };

  it('passes plain text fields through and encodes MVT as JSON', () => {
    const logical = buildLabelInputs({
      name: 'Суп',
      ingredientsText: 'Вода',
      nutrition: { proteins: '5', fats: '1', carbs: '1', energy: '99' },
      weightKg: 0.4,
      barcode: '1',
      batchNumber: '60915',
      expiresAt: '08.2027',
    });

    const pdfme = resolvePdfmeInputs(baseTemplate, logical);
    expect(pdfme.title_line1).toBe(logical.title_line1);
    expect(pdfme.nutrition_proteins).toBe(logical.nutrition_proteins);
    expect(JSON.parse(pdfme.nutrition_energy)).toEqual({ kcal: '99' });
  });

  it('substitutes text fields that keep placeholders in content (Designer type=text)', () => {
    const logical = buildLabelInputs({
      name: 'Борщ',
      ingredientsText: 'картопля, м’ясо',
      nutrition: { proteins: '2,17', fats: '5', carbs: '4', energy: '80' },
      weightKg: 0.4,
      barcode: '1',
      batchNumber: '61005',
      expiresAt: '09.2027',
    });
    const pdfme = resolvePdfmeInputs(
      {
        basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
        schemas: [
          [
            {
              name: 'nutrition_proteins',
              type: 'text',
              content: 'Білки {proteins} г',
            },
            {
              name: 'batch_number',
              type: 'text',
              content: 'Номер партії: {batch}',
            },
          ],
        ],
      },
      logical,
    );
    expect(pdfme.nutrition_proteins).toBe('Білки 2,17 г');
    expect(pdfme.batch_number).toBe('Номер партії: 61005');
    expect(pdfme.nutrition_proteins).not.toContain('Білки 2,17г');
  });

  it('includes every name from variables[] even if absent in text', () => {
    const pdfme = resolvePdfmeInputs(
      {
        basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
        schemas: [
          [
            {
              name: 'nutrition_proteins',
              type: 'multiVariableText',
              text: 'Білки {proteins} г',
              variables: ['proteins', 'salt'],
            },
          ],
        ],
      },
      buildLabelInputs({
        name: 'X',
        ingredientsText: '',
        nutrition: { proteins: '1', fats: '1', carbs: '1' },
        weightKg: 0.4,
        barcode: '1',
        batchNumber: '1',
        expiresAt: '01.2027',
      }),
    );
    const parsed = JSON.parse(pdfme.nutrition_proteins) as Record<string, string>;
    expect(Object.prototype.hasOwnProperty.call(parsed, 'proteins')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'salt')).toBe(true);
  });
});

describe('unknownMvtVariableNames', () => {
  it('flags variables outside the registry', () => {
    const unknown = unknownMvtVariableNames({
      basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
      schemas: [[{ name: 'x', type: 'multiVariableText', text: 'Hi {foo}', variables: ['foo'] }]],
    });
    expect(unknown).toEqual(['foo']);
  });
});
