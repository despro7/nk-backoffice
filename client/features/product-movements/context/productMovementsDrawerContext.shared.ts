import { createContext, useContext } from 'react';
import type { ProductMovementsOpenParams } from '../types';

export interface ProductMovementsDrawerContextValue {
  open: (params: ProductMovementsOpenParams) => void;
  close: () => void;
}

/** Окремий модуль — один createContext на сесію; Provider не дублює контекст після HMR. */
export const ProductMovementsDrawerContext = createContext<ProductMovementsDrawerContextValue | null>(null);

let missingProviderWarned = false;

function warnMissingProvider(): void {
  if (missingProviderWarned) return;
  missingProviderWarned = true;
  console.warn(
    '[ProductMovementsDrawer] Provider недоступний (HMR або дубль контексту в chunk). «Рухи партії» не відкриються — перезавантажте сторінку.',
  );
}

const MISSING_PROVIDER_NOOP: ProductMovementsDrawerContextValue = {
  open: () => {
    warnMissingProvider();
  },
  close: () => {},
};

/** null — якщо Provider не в дереві або інший екземпляр createContext у lazy-chunk. */
export function useProductMovementsDrawerOptional(): ProductMovementsDrawerContextValue | null {
  return useContext(ProductMovementsDrawerContext);
}

export function useProductMovementsDrawer(): ProductMovementsDrawerContextValue {
  const ctx = useProductMovementsDrawerOptional();
  if (!ctx) {
    return MISSING_PROVIDER_NOOP;
  }
  return ctx;
}
