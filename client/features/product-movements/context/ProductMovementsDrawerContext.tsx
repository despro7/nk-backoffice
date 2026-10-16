import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ProductMovementsDrawerPlacement, ProductMovementsOpenParams } from '../types';
import { filtersFromOpenParams } from '../productMovementsUtils';
import type { ProductMovementsFilterState } from '../types';

/** Lazy: context-модуль не тягне drawer eager-ом (менше ризик broken context після HMR). */
const ProductMovementsDrawer = lazy(() => import('../components/ProductMovementsDrawer'));

interface ProductMovementsDrawerContextValue {
  open: (params: ProductMovementsOpenParams) => void;
  close: () => void;
}

const ProductMovementsDrawerContext = createContext<ProductMovementsDrawerContextValue | null>(null);

const DEFAULT_PLACEMENT: ProductMovementsDrawerPlacement = 'right';
const DEFAULT_NON_DISMISSABLE = false;

export function ProductMovementsDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialFilters, setInitialFilters] = useState<ProductMovementsFilterState | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [placement, setPlacement] = useState<ProductMovementsDrawerPlacement>(DEFAULT_PLACEMENT);
  const [nonDismissable, setNonDismissable] = useState(DEFAULT_NON_DISMISSABLE);

  const open = useCallback((params: ProductMovementsOpenParams) => {
    setInitialFilters(filtersFromOpenParams(params));
    setAutoGenerate(params.autoGenerate ?? false);
    setPlacement(params.placement ?? DEFAULT_PLACEMENT);
    setNonDismissable(params.nonDismissable ?? DEFAULT_NON_DISMISSABLE);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <ProductMovementsDrawerContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <ProductMovementsDrawer
          isOpen={isOpen}
          initialFilters={initialFilters}
          autoGenerate={autoGenerate}
          placement={placement}
          nonDismissable={nonDismissable}
          onClose={close}
        />
      </Suspense>
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
