import { createContext, useContext } from 'react';
import type { WarehouseDocumentEditOpenParams } from '../types';

export interface WarehouseDocumentEditDrawerContextValue {
  open: (params: WarehouseDocumentEditOpenParams) => void;
  close: () => void;
}

/** Окремий модуль — один createContext на сесію; Provider не дублює контекст після HMR. */
export const WarehouseDocumentEditDrawerContext =
  createContext<WarehouseDocumentEditDrawerContextValue | null>(null);

const DEV_NOOP: WarehouseDocumentEditDrawerContextValue = {
  open: () => {
    if (import.meta.env.DEV) {
      console.warn(
        '[WarehouseDocumentEditDrawer] Контекст недоступний (часто після HMR). Перезавантажте сторінку, якщо редагування документа не відкривається.',
      );
    }
  },
  close: () => {},
};

export function useWarehouseDocumentEditDrawer(): WarehouseDocumentEditDrawerContextValue {
  const ctx = useContext(WarehouseDocumentEditDrawerContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      return DEV_NOOP;
    }
    throw new Error('useWarehouseDocumentEditDrawer must be used within WarehouseDocumentEditDrawerProvider');
  }
  return ctx;
}
