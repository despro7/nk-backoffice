import type { WooCommerceProduct } from '../types/storefront.js';

export function resolveStorefrontProductUrl(
  siteUrl: string | null | undefined,
  product: Pick<WooCommerceProduct, 'id' | 'permalink'> | null | undefined,
): string | null {
  const permalink = product?.permalink?.trim();
  if (permalink) return permalink;
  const base = siteUrl?.trim().replace(/\/+$/, '');
  const id = product?.id;
  if (!base || id == null) return null;
  return `${base}/?p=${id}`;
}
