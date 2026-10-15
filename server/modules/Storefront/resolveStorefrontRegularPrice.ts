import {
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
} from '../../../shared/types/catalog.js';

/** Роздріб (ІМ), інакше Звичайна — для WC `regular_price`. */
export function resolveStorefrontRegularPrice(
  prices: Array<{ priceType: string; price: number }>,
): string | null {
  const retail = prices.find((row) => row.priceType === CATALOG_PRICE_TYPE_RETAIL_ID);
  if (retail != null && retail.price > 0) return String(retail.price);
  const regular = prices.find((row) => row.priceType === CATALOG_PRICE_TYPE_REGULAR_ID);
  if (regular != null && regular.price > 0) return String(regular.price);
  return null;
}
