import { describe, expect, it } from 'vitest';
import {
  DILOVOD_PRODUCTION_STORAGE_ID,
  DILOVOD_RAW_MATERIALS_STORAGE_ID,
  buildIngredientStockJson,
  parseCatalogStockJson,
} from './catalogStock';

describe('parseCatalogStockJson', () => {
  it('returns zeros for empty or broken JSON', () => {
    expect(parseCatalogStockJson(null)).toMatchObject({ mainStock: 0, smallStock: 0, rawStock: 0, productionStock: 0, stockBalanceByStock: null });
    expect(parseCatalogStockJson('not json').stockBalanceByStock).toBeNull();
    expect(parseCatalogStockJson('[1,2]').stockBalanceByStock).toBeNull();
  });

  it('reads finished product slots 1 / 2', () => {
    const parsed = parseCatalogStockJson('{"1":12,"2":-3}');
    expect(parsed).toMatchObject({ mainStock: 12, smallStock: -3, rawStock: 0, productionStock: 0 });
  });

  it('reads ingredient storages by Dilovod storage id', () => {
    const parsed = parseCatalogStockJson(buildIngredientStockJson(29.26, 412.626));
    expect(parsed).toMatchObject({ mainStock: 0, smallStock: 0, rawStock: 29.26, productionStock: 412.626 });
  });
});

describe('buildIngredientStockJson', () => {
  it('has stable key order and rounds float noise', () => {
    const json = buildIngredientStockJson(0.1 + 0.2, 1);
    expect(json).toBe(`{"${DILOVOD_RAW_MATERIALS_STORAGE_ID}":0.3,"${DILOVOD_PRODUCTION_STORAGE_ID}":1}`);
  });
});
