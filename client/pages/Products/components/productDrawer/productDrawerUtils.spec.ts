import { describe, expect, it } from 'vitest';
import {
  emptyForm,
  getDrawerDirtyFields,
  isDrawerTabDirty,
  mergeStorefrontFieldsIntoDrawerBaseline,
  snapshotState,
} from './productDrawerUtils';

const baseForm = emptyForm();
const baseSnapshot = snapshotState(baseForm, [], [], [], [], 'good', 'folder-1');

describe('getDrawerDirtyFields', () => {
  it('marks sku as dirty when it changes', () => {
    const dirty = getDrawerDirtyFields(
      { ...baseForm, sku: 'NEW-SKU' },
      [],
      [],
      [],
      [],
      'good',
      'folder-1',
      baseSnapshot,
    );
    expect(dirty.has('sku')).toBe(true);
    expect(dirty.has('name')).toBe(false);
  });

  it('marks prices and barcodes as dirty when arrays change', () => {
    const dirty = getDrawerDirtyFields(
      baseForm,
      [],
      [{ priceType: '1', price: 100, currency: 'UAH' }],
      [{ code: '123', activity: true, goodPart: '', goodPartName: '' }],
      [],
      'good',
      'folder-1',
      baseSnapshot,
    );
    expect(dirty.has('prices')).toBe(true);
    expect(dirty.has('barcodes')).toBe(true);
  });

  it('marks images as dirty when gallery changes', () => {
    const dirty = getDrawerDirtyFields(
      baseForm,
      [],
      [],
      [],
      [
        {
          id: 1,
          goodId: 'g1',
          fileName: 'a.jpg',
          originalName: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 10,
          sortOrder: 0,
          isPrimary: true,
          url: '/uploads/a.jpg',
          createdAt: '',
          updatedAt: '',
        },
      ],
      'good',
      'folder-1',
      baseSnapshot,
    );
    expect(dirty.has('images')).toBe(true);
  });
});

describe('mergeStorefrontFieldsIntoDrawerBaseline', () => {
  it('updates storefront fields without touching sku', () => {
    const form = { ...baseForm, sku: 'CHANGED', storefrontDescriptionDoc: '{"type":"doc","content":[]}' };
    const merged = mergeStorefrontFieldsIntoDrawerBaseline(baseSnapshot, form);
    const dirty = getDrawerDirtyFields(form, [], [], [], [], 'good', 'folder-1', merged);
    expect(dirty.has('sku')).toBe(true);
    expect(dirty.has('storefrontDescriptionDoc')).toBe(false);
  });
});

describe('isDrawerTabDirty', () => {
  it('groups dirty fields by tab', () => {
    const dirty = new Set(['sku', 'description'] as const);
    expect(isDrawerTabDirty(dirty, 'main')).toBe(true);
    expect(isDrawerTabDirty(dirty, 'content')).toBe(true);
    expect(isDrawerTabDirty(new Set(['sku']), 'content')).toBe(false);
  });
});
