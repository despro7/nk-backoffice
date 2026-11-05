import { describe, expect, it } from 'vitest';
import type { CatalogGoodAuditSnapshot } from '../types/catalogAudit.js';
import { catalogAuditTouchesSpec, diffCatalogGoodSnapshots } from './catalogGoodAuditDiff.js';

function snap(patch: Partial<CatalogGoodAuditSnapshot> = {}): CatalogGoodAuditSnapshot {
  return {
    id: 'g1',
    fields: { name: 'Борщ', sku: '100', specQty: 1 },
    components: [
      { componentGoodId: 'c1', name: 'Буряк', sku: '1', qty: 0.2, unitId: 'kg', note: null, cookingLossPercent: 0 },
      { componentGoodId: 'c2', name: 'Капуста', sku: '2', qty: 0.1, unitId: 'kg', note: null, cookingLossPercent: 0 },
    ],
    prices: { retail: 100 },
    barcodes: [{ code: '482', goodPart: '', goodPartName: null, kind: 'portion', activity: true }],
    images: [
      { id: 1, name: 'a.jpg', isPrimary: true },
      { id: 2, name: 'b.jpg', isPrimary: false },
    ],
    ...patch,
  };
}

describe('diffCatalogGoodSnapshots', () => {
  it('returns null when nothing changed', () => {
    expect(diffCatalogGoodSnapshots(snap(), snap())).toBeNull();
  });

  it('treats empty string and null as equal', () => {
    const a = snap({ fields: { name: 'Борщ', sku: '100', specQty: 1, note: '' } });
    const b = snap({ fields: { name: 'Борщ', sku: '100', specQty: 1, note: null } });
    expect(diffCatalogGoodSnapshots(a, b)).toBeNull();
  });

  it('reports scalar and price changes', () => {
    const after = snap({ fields: { name: 'Борщ червоний', sku: '100', specQty: 1 }, prices: { retail: 120 } });
    const diff = diffCatalogGoodSnapshots(snap(), after);
    expect(diff?.changes).toEqual([
      { field: 'name', from: 'Борщ', to: 'Борщ червоний' },
      { field: 'price:retail', from: 100, to: 120 },
    ]);
  });

  it('ignores component row reorder, reports qty change, add and remove', () => {
    const before = snap();
    const after = snap({
      components: [
        { componentGoodId: 'c2', name: 'Капуста', sku: '2', qty: 0.1, unitId: 'kg', note: null, cookingLossPercent: 0 },
        { componentGoodId: 'c1', name: 'Буряк', sku: '1', qty: 0.25, unitId: 'kg', note: null, cookingLossPercent: 0 },
        { componentGoodId: 'c3', name: 'Морква', sku: '3', qty: 0.05, unitId: 'kg', note: null, cookingLossPercent: 0 },
      ],
    });
    const diff = diffCatalogGoodSnapshots(before, after);
    expect(diff?.components?.added.map((r) => r.componentGoodId)).toEqual(['c3']);
    expect(diff?.components?.removed).toEqual([]);
    expect(diff?.components?.changed).toEqual([
      { componentGoodId: 'c1', name: 'Буряк', sku: '1', from: { qty: 0.2 }, to: { qty: 0.25 } },
    ]);
    expect(catalogAuditTouchesSpec(diff)).toBe(true);
  });

  it('stores only a marker for long text', () => {
    const long = 'x'.repeat(400);
    const diff = diffCatalogGoodSnapshots(
      snap(),
      snap({ fields: { name: 'Борщ', sku: '100', specQty: 1, fullDescription: long } }),
    );
    expect(diff?.changes).toEqual([{ field: 'fullDescription', from: null, to: null, truncated: true }]);
    expect(catalogAuditTouchesSpec(diff)).toBe(false);
  });

  it('reports barcode, image and primary changes', () => {
    const after = snap({
      barcodes: [{ code: '482', goodPart: '', goodPartName: null, kind: 'portion', activity: false }],
      images: [
        { id: 2, name: 'b.jpg', isPrimary: true },
        { id: 3, name: 'c.jpg', isPrimary: false },
      ],
    });
    const diff = diffCatalogGoodSnapshots(snap(), after);
    expect(diff?.barcodes?.changed).toEqual([{ code: '482', from: { activity: true }, to: { activity: false } }]);
    expect(diff?.images).toEqual({ added: ['c.jpg'], removed: ['a.jpg'], primary: { from: 'a.jpg', to: 'b.jpg' } });
  });

  it('diffs a created good against nothing', () => {
    const diff = diffCatalogGoodSnapshots(null, snap());
    expect(diff?.components?.added).toHaveLength(2);
    expect(diff?.changes?.find((c) => c.field === 'name')).toEqual({ field: 'name', from: null, to: 'Борщ' });
  });
});

describe('buildCatalogAuditLines', () => {
  it('formats fields, components and prices with dictionaries', async () => {
    const { buildCatalogAuditLines } = await import('./catalogGoodAuditFormat.js');
    const after = snap({
      fields: { name: 'Борщ', sku: '100', specQty: 2 },
      prices: { retail: 120 },
      components: [
        { componentGoodId: 'c1', name: 'Буряк', sku: '1', qty: 0.25, unitId: 'kg', note: null, cookingLossPercent: 0 },
      ],
    });
    const lines = buildCatalogAuditLines(diffCatalogGoodSnapshots(snap(), after), {
      units: [{ id: 'kg', name: 'кг' }],
      priceTypes: [{ id: 'retail', name: 'Роздріб' }],
    });
    expect(lines).toEqual([
      { kind: 'changed', label: 'Розрахунок на N шт.', text: '1 → 2' },
      { kind: 'changed', label: 'Ціна «Роздріб»', text: '100 → 120' },
      { kind: 'removed', label: 'Склад', text: 'Капуста (2) – 0,1 кг' },
      { kind: 'changed', label: 'Склад', text: 'Буряк (1) – к-сть: 0,2 → 0,25' },
    ]);
  });
});
