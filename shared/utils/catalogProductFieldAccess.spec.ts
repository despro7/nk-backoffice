import { describe, expect, it } from 'vitest';
import {
  hasSpecFieldsChanged,
  hasSpecFieldsOnCreate,
  hasStorefrontFieldsChanged,
  hasStorefrontFieldsOnCreate,
} from './catalogProductFieldAccess';
import type { CatalogGoodDetailDto } from '../types/catalog';

const baseGood = {
  id: '1',
  name: 'Test',
  specQty: 1,
  components: [],
  doNotPublish: false,
  storefrontPresetId: null,
  productIngredientsJson: null,
  productNutritionJson: null,
  storefrontDescriptionDoc: null,
  description: '',
} as unknown as CatalogGoodDetailDto;

describe('catalogProductFieldAccess', () => {
  it('detects specQty change', () => {
    expect(hasSpecFieldsChanged({ specQty: 2 }, baseGood)).toBe(true);
    expect(hasSpecFieldsChanged({ specQty: 1 }, baseGood)).toBe(false);
  });

  it('detects BOM change', () => {
    expect(
      hasSpecFieldsChanged(
        {
          components: [
            {
              componentGoodId: 'c1',
              qty: 1,
              rowNum: 1,
              unitId: 'u1',
              note: null,
              cookingLossPercent: 0,
            },
          ],
        },
        baseGood,
      ),
    ).toBe(true);
  });

  it('detects storefront description change', () => {
    expect(hasStorefrontFieldsChanged({ description: 'новий' }, baseGood)).toBe(true);
    expect(hasStorefrontFieldsOnCreate({ name: 'X', description: 'новий' })).toBe(true);
  });

  it('ignores empty spec on create', () => {
    expect(hasSpecFieldsOnCreate({ name: 'X', components: [], specQty: 1 })).toBe(false);
    expect(hasStorefrontFieldsOnCreate({ name: 'X' })).toBe(false);
  });
});
