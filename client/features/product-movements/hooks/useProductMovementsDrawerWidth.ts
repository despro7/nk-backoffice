import type { ProductMovementsDrawerPlacement } from '../types';
import {
  useResizableDrawerWidth,
} from '@/hooks/useResizableDrawerWidth';

const STORAGE_KEY = 'product-movements-drawer-width-v1';

/** Близько до HeroUI size="4xl" (max-w-4xl ≈ 56rem). */
export const PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH = 840;
export const PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH = 622;
export const PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH = 1024;

export function useProductMovementsDrawerWidth(placement: ProductMovementsDrawerPlacement) {
  return useResizableDrawerWidth({
    storageKey: STORAGE_KEY,
    defaultWidth: PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH,
    minWidth: PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH,
    maxWidth: PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH,
    placement,
  });
}
