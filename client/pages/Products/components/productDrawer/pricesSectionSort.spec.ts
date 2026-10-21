import { describe, expect, it } from 'vitest';
import { reorderPriceRows, sortPriceEntries } from './pricesSectionSort';

describe('pricesSectionSort', () => {
  it('зберігає ручний порядок', () => {
    const rows = [
      { priceType: '1', price: 10, currency: 'UAH' },
      { priceType: '2', price: 20, currency: 'UAH' },
    ];
    const sorted = sortPriceEntries(rows);
    expect(sorted.map((e) => e.row.priceType)).toEqual(['1', '2']);
  });

  it('переставляє рядки', () => {
    const rows = [
      { priceType: '1', price: 10, currency: 'UAH' },
      { priceType: '2', price: 20, currency: 'UAH' },
    ];
    expect(reorderPriceRows(rows, 0, 1).map((r) => r.priceType)).toEqual(['2', '1']);
  });
});
