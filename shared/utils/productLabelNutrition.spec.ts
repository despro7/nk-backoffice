import { describe, expect, it } from 'vitest';
import {
  calculateEnergyKcal,
  ensureNutritionText,
  formatNutritionText,
  getNutritionValidationErrors,
  isNutritionTextComplete,
  isNutritionTextPlaceholder,
  parseNutritionValues,
  patchNutritionValue,
  patchNutritionWithAutoEnergy,
  PRODUCT_LABEL_NUTRITION_TEMPLATE,
} from './productLabelNutrition.js';

describe('productLabelNutrition', () => {
  it('returns template for empty text', () => {
    expect(ensureNutritionText('')).toBe(PRODUCT_LABEL_NUTRITION_TEMPLATE);
  });

  it('detects placeholder state', () => {
    expect(isNutritionTextPlaceholder(PRODUCT_LABEL_NUTRITION_TEMPLATE)).toBe(true);
    expect(isNutritionTextPlaceholder('Білки 4,4г\nЖири 3,4г\nВуглеводи 5,3г\nЕнергетична цінність 68,3 ккал')).toBe(
      false,
    );
  });

  it('parses and formats nutrition values', () => {
    const values = {
      proteins: '4,4',
      fats: '3,4',
      carbs: '5,3',
      energy: '68,3',
    };
    const text = formatNutritionText(values);
    expect(parseNutritionValues(text)).toEqual(values);
  });

  it('patches a single nutrition field', () => {
    const next = patchNutritionValue(PRODUCT_LABEL_NUTRITION_TEMPLATE, 'proteins', '4,4');
    expect(parseNutritionValues(next).proteins).toBe('4,4');
  });

  it('validates complete nutrition block', () => {
    const complete = `Білки 4,4г
Жири 3,4г
Вуглеводи 5,3г
Енергетична цінність 68,3 ккал`;
    expect(isNutritionTextComplete(complete)).toBe(true);
    expect(getNutritionValidationErrors(complete)).toEqual([]);
  });

  it('reports missing fields in template', () => {
    const errors = getNutritionValidationErrors(PRODUCT_LABEL_NUTRITION_TEMPLATE);
    expect(errors.length).toBe(4);
    expect(isNutritionTextComplete(PRODUCT_LABEL_NUTRITION_TEMPLATE)).toBe(false);
  });

  it('calculates energy from macros', () => {
    expect(
      calculateEnergyKcal({ proteins: '4,4', fats: '3,4', carbs: '5,3' }),
    ).toBe('69,4');
  });

  it('auto-fills energy when macros change', () => {
    const result = patchNutritionWithAutoEnergy(PRODUCT_LABEL_NUTRITION_TEMPLATE, 'proteins', '4,4', false);
    expect(result.energyManual).toBe(false);
    expect(parseNutritionValues(result.text).proteins).toBe('4,4');
  });

  it('keeps manual energy override', () => {
    const text = `Білки 4,4г
Жири 3,4г
Вуглеводи 5,3г
Енергетична цінність 70 ккал`;
    const result = patchNutritionWithAutoEnergy(text, 'proteins', '5', true);
    expect(parseNutritionValues(result.text).energy).toBe('70');
    expect(result.energyManual).toBe(true);
  });
});
