import { describe, expect, it } from 'vitest';
import { buildLabelInputs, diffLabelOverrides, mergeLabelOverrides } from './labelInputs';

describe('label inputs', () => {
  it('seeds ingredients, nutrition and weight from the product card', () => {
    const inputs = buildLabelInputs({
      name: 'Суп гречаний зі свининою',
      ingredientsText: 'Картопля, сіль',
      nutrition: { proteins: '5,2', fats: '5,5', carbs: '4,8', salt: '1' },
      weightKg: 0.47,
      mainProductWeightKg: 0.4,
      barcode: '2200000001146',
      batchNumber: '60915',
      expiresAt: '08.2027',
    });

    expect(inputs.ingredients).toContain('Картопля, сіль');
    expect(inputs.nutrition_proteins).toContain('5,2');
    expect(inputs.nutrition_energy).toContain('ккал');
    expect(inputs.net_weight).toContain('470');
    expect(inputs.main_product_weight).toContain('400');
    expect(inputs.batch_number).toContain('60915');
    expect(inputs.barcode).toBe('2200000001146');
  });

  it('keeps only keys that differ from the card baseline', () => {
    const base = buildLabelInputs({
      name: 'Суп',
      ingredientsText: 'Вода',
      nutrition: { proteins: '1', fats: '1', carbs: '1' },
      weightKg: 0.4,
      barcode: '1',
      batchNumber: '1',
      expiresAt: '01.2027',
    });
    const current = { ...base, ingredients: 'Вода, сіль' };
    const overrides = diffLabelOverrides(base, current);
    expect(overrides).toEqual({ ingredients: 'Вода, сіль' });
    expect(mergeLabelOverrides(base, overrides).ingredients).toBe('Вода, сіль');
    expect(mergeLabelOverrides(base, overrides).title_line1).toBe(base.title_line1);
  });
});
