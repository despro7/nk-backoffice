import { describe, expect, it } from 'vitest';
import { buildLabelInputs } from './labelInputs.js';
import {
  buildLabelMvtVariableMap,
  buildLabelMvtVariableMapFromInputs,
  parseMvtVariableNames,
} from './labelMvtVariables.js';

describe('labelMvtVariables', () => {
  it('parseMvtVariableNames extracts unique placeholders', () => {
    expect(parseMvtVariableNames('Білки {proteins} г, {proteins}')).toEqual(['proteins', 'proteins']);
  });

  it('buildLabelMvtVariableMap matches card source', () => {
    const map = buildLabelMvtVariableMap({
      name: 'Печеня',
      ingredientsText: 'Картопля',
      nutrition: { proteins: '6', fats: '7', carbs: '9', energy: '123' },
      weightKg: 0.38,
      barcode: '1',
      batchNumber: '61007',
      expiresAt: '09.2027',
    });
    expect(map.proteins).toBe('6');
    expect(map.kcal).toBe('123');
    expect(map.batch).toBe('61007');
    expect(map.expires).toBe('09.2027');
  });

  it('buildLabelMvtVariableMap includes portions per box from card', () => {
    const map = buildLabelMvtVariableMap({
      name: 'Суп',
      ingredientsText: 'Вода',
      nutrition: null,
      barcode: '1',
      batchNumber: '1',
      expiresAt: '',
      portionsPerBox: 24,
    });
    expect(map.portions_per_box).toBe('24');
  });

  it('buildLabelMvtVariableMapFromInputs reverses formatted label strings', () => {
    const inputs = buildLabelInputs({
      name: 'Суп',
      ingredientsText: 'Вода',
      nutrition: { proteins: '5,2', fats: '1', carbs: '1' },
      weightKg: 0.4,
      barcode: '1',
      batchNumber: '60915',
      expiresAt: '08.2027',
    });
    const map = buildLabelMvtVariableMapFromInputs(inputs);
    expect(map.proteins).toBe('5,2');
    expect(map.batch).toBe('60915');
    expect(map.expires).toBe('08.2027');
  });
});
