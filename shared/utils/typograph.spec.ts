import { describe, expect, it } from 'vitest';
import { typographProductLabelPayload, typographUk } from './typograph.js';
import { PORTION_LABEL_STATIC } from '../constants/productLabelPortionStatic.js';

const NBSP = '\u00A0';

describe('typographUk', () => {
  it('додає неразривні пробіли в умовах зберігання', () => {
    const input = PORTION_LABEL_STATIC.storageText;
    const result = typographUk(input);

    expect(result).toContain(`більше${NBSP}75%`);
    expect(result).toContain(`до${NBSP}25ºС`);
    expect(result).toContain(`24${NBSP}годин`);
    expect(result).not.toBe(input);
  });

  it('нормалізує лапки', () => {
    expect(typographUk('"Нова Кухня"')).toBe('«Нова Кухня»');
  });

  it('повертає порожній рядок без змін', () => {
    expect(typographUk('')).toBe('');
    expect(typographUk('   ')).toBe('   ');
  });
});

describe('typographProductLabelPayload', () => {
  it('типографує текстові поля payload', () => {
    const payload = {
      labelKind: 'portion' as const,
      batchId: 'batch-1',
      batchNumber: '001',
      barcode: '1234567890123',
      title: {
        line1: 'Суп',
        line2: 'грибний',
        line1FontSize: 14,
        line2FontSize: 11,
        align: 'center' as const,
      },
      ingredientsText: 'вода, сіль',
      nutritionText: 'Білки 4,4г',
      nutritionEnergyManual: false,
      storageText: PORTION_LABEL_STATIC.storageText,
      expiresAt: '12.2026',
      netWeightLabel: '300г',
    };

    const result = typographProductLabelPayload(payload);
    expect(result.storageText).toContain(`більше${NBSP}75%`);
    expect(result.ingredientsText).toBe(typographUk('вода, сіль'));
  });
});
