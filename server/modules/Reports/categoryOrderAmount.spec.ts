import { describe, expect, it } from 'vitest';
import { getCategoryOrderAmount, getOrderLeafAmounts, type CategoryAmountProduct } from './categoryOrderAmount.js';

const products: Record<string, CategoryAmountProduct> = {
  asian: { sku: 'asian', name: 'Asian dish' },
  soup: { sku: 'soup', name: 'Soup' },
  inner: { sku: 'inner', set: [{ id: 'asian', quantity: 1 }, { id: 'soup', quantity: 1 }] },
  box: { sku: 'box', set: [{ id: 'inner', quantity: 1 }, { id: 'soup', quantity: 2 }] },
};

const lookup = async (sku: string) => products[sku] ?? null;
const isIncluded = (sku: string) => sku === 'asian';

const amount = (items: Array<{ sku: string; quantity: number; price?: number }>, totalPrice: number) =>
  getCategoryOrderAmount({ items, totalPrice, lookup, isIncluded });

describe('getCategoryOrderAmount', () => {
  it('takes only the included plain line', async () => {
    await expect(
      amount([{ sku: 'asian', quantity: 2, price: 100 }, { sku: 'soup', quantity: 1, price: 50 }], 250),
    ).resolves.toBe(200);
  });

  it('returns zero for an order without included items', async () => {
    await expect(amount([{ sku: 'soup', quantity: 1, price: 50 }], 50)).resolves.toBe(0);
  });

  it('splits a nested set line by portion count', async () => {
    // box = 1 asian + 3 soup portions
    await expect(
      amount([{ sku: 'box', quantity: 2, price: 400 }, { sku: 'asian', quantity: 1, price: 100 }], 900),
    ).resolves.toBe(300);
  });

  it('scales by the order total when it differs from the lines sum', async () => {
    await expect(
      amount([{ sku: 'asian', quantity: 1, price: 100 }, { sku: 'soup', quantity: 1, price: 100 }], 180),
    ).resolves.toBe(90);
  });

  it('keeps unknown lines in the lines sum', async () => {
    await expect(
      amount([{ sku: 'asian', quantity: 1, price: 100 }, { sku: 'delivery', quantity: 1, price: 100 }], 200),
    ).resolves.toBe(100);
  });

  it('returns amounts per leaf sku across lines', async () => {
    const result = await getOrderLeafAmounts({
      items: [{ sku: 'box', quantity: 1, price: 400 }, { sku: 'asian', quantity: 1, price: 100 }],
      totalPrice: 500,
      lookup,
    });
    expect(result.get('asian')?.amount).toBe(200);
    expect(result.get('soup')?.amount).toBe(300);
  });

  it('falls back to portion share when lines have no prices', async () => {
    await expect(
      amount([{ sku: 'asian', quantity: 1 }, { sku: 'soup', quantity: 3 }], 400),
    ).resolves.toBe(100);
  });
});
