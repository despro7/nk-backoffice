import { createContext, useContext } from 'react';
import type { ProductMovementsOpenParams } from '../types';

export interface ProductMovementsDrawerContextValue {
  open: (params: ProductMovementsOpenParams) => void;
  close: () => void;
}

/** Окремий модуль — один createContext на сесію; Provider не дублює контекст після HMR. */
export const ProductMovementsDrawerContext = createContext<ProductMovementsDrawerContextValue | null>(null);

const DEV_NOOP: ProductMovementsDrawerContextValue = {
  open: () => {
    if (import.meta.env.DEV) {
      console.warn(
        '[ProductMovementsDrawer] Контекст недоступний (часто після HMR). Перезавантажте сторінку, якщо «Рухи партії» не відкриваються.',
      );
    }
  },
  close: () => {},
};

export function useProductMovementsDrawer(): ProductMovementsDrawerContextValue {
  const ctx = useContext(ProductMovementsDrawerContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      return DEV_NOOP;
    }
    throw new Error('useProductMovementsDrawer must be used within ProductMovementsDrawerProvider');
  }
  return ctx;
}
