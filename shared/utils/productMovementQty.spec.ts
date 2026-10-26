import { describe, expect, it } from 'vitest';
import { normalizePortionQty } from './productMovementQty.js';

describe('normalizePortionQty', () => {
  it('округлює майже цілі значення після float-суми', () => {
    expect(normalizePortionQty(49.999999999)).toBe(50);
    expect(normalizePortionQty(14.861 + 1.314 + 17.884)).toBe(34.059);
  });

  it('залишає справжні дроби з 3 знаками', () => {
    expect(normalizePortionQty(1.2345)).toBe(1.235);
  });
});
