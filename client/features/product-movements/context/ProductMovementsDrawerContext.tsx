import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ProductMovementsOpenParams } from '../types';
import { filtersFromOpenParams } from '../productMovementsUtils';
import type { ProductMovementsFilterState } from '../types';
import ProductMovementsDrawer from '../components/ProductMovementsDrawer';

interface ProductMovementsDrawerContextValue {
  open: (params: ProductMovementsOpenParams) => void;
  close: () => void;
}

const ProductMovementsDrawerContext = createContext<ProductMovementsDrawerContextValue | null>(null);

export function ProductMovementsDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialFilters, setInitialFilters] = useState<ProductMovementsFilterState | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);

  const open = useCallback((params: ProductMovementsOpenParams) => {
    setInitialFilters(filtersFromOpenParams(params));
    setAutoGenerate(params.autoGenerate ?? false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <ProductMovementsDrawerContext.Provider value={value}>
      {children}
      <ProductMovementsDrawer
        isOpen={isOpen}
        initialFilters={initialFilters}
        autoGenerate={autoGenerate}
        onClose={close}
      />
    </ProductMovementsDrawerContext.Provider>
  );
}

export function useProductMovementsDrawer(): ProductMovementsDrawerContextValue {
  const ctx = useContext(ProductMovementsDrawerContext);
  if (!ctx) {
    throw new Error('useProductMovementsDrawer must be used within ProductMovementsDrawerProvider');
  }
  return ctx;
}
