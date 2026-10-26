import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import {
  PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH,
  PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH,
  PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH,
} from '../hooks/useProductMovementsDrawerWidth';
import type { ProductMovementsDrawerPlacement, ProductMovementsFilterState } from '../types';
import { createDefaultFilters, normalizeProductMovementsFilters } from '../productMovementsUtils';
import useProductMovementsMeta from '../hooks/useProductMovementsMeta';
import useProductMovementsQuery from '../hooks/useProductMovementsQuery';
import ProductMovementsFilters from './ProductMovementsFilters';
import ProductMovementsReportHeader from './ProductMovementsReportHeader';
import ProductMovementsTable from './ProductMovementsTable';
import ProductMovementsRebatchButton from './ProductMovementsRebatchButton';

interface ProductMovementsDrawerProps {
  isOpen: boolean;
  initialFilters: ProductMovementsFilterState | null;
  autoGenerate?: boolean;
  placement?: ProductMovementsDrawerPlacement;
  /** Не закривати зовні + прозорий backdrop з кліками на фон. */
  nonDismissable?: boolean;
  onClose: () => void;
}

const WIDTH_STORAGE_KEY = 'product-movements-drawer-width-v1';

export default function ProductMovementsDrawer({
  isOpen,
  initialFilters,
  autoGenerate = false,
  placement = 'right',
  nonDismissable = false,
  onClose,
}: ProductMovementsDrawerProps) {
  const { meta, loading: metaLoading, error: metaError } = useProductMovementsMeta(isOpen);
  const {
    result,
    generatedFilters,
    hasGenerated,
    loading,
    error,
    generate,
    reset,
  } = useProductMovementsQuery();
  const [filters, setFilters] = useState<ProductMovementsFilterState>(createDefaultFilters());
  const [filtersMountKey, setFiltersMountKey] = useState(0);
  const openSessionRef = useRef(0);
  const autoGenerateSessionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      autoGenerateSessionRef.current = null;
      return;
    }

    const nextFilters = normalizeProductMovementsFilters(initialFilters ?? createDefaultFilters());
    const sessionId = openSessionRef.current + 1;
    openSessionRef.current = sessionId;
    autoGenerateSessionRef.current = autoGenerate ? sessionId : null;

    setFiltersMountKey((value) => value + 1);
    setFilters(nextFilters);
    reset();
  }, [isOpen, initialFilters, autoGenerate, reset]);

  useEffect(() => {
    const sessionId = autoGenerateSessionRef.current;
    if (!isOpen || sessionId == null || metaLoading || !meta) return;

    const activeFilters = initialFilters;
    if (!activeFilters?.sku && !activeFilters?.dilovodGoodId) return;

    autoGenerateSessionRef.current = null;
    generate(activeFilters, meta);
  }, [isOpen, metaLoading, initialFilters, meta, generate]);

  const title = useMemo(() => {
    const name = filters.productName || filters.sku || 'Товар';
    const batch = filters.batchLabel || filters.goodPartId;
    return batch ? `Рухи: ${name} · ${batch}` : `Рухи: ${name}`;
  }, [filters.batchLabel, filters.goodPartId, filters.productName, filters.sku]);

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement={placement}
      initialNonDismissable={nonDismissable}
      stackLevel={0}
      widthStorageKey={WIDTH_STORAGE_KEY}
      defaultWidth={PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH}
      minWidth={PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH}
      maxWidth={PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH}
      resizeAriaLabel="Змінити ширину панелі рухів"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <ProductMovementsRebatchButton
            filters={filters}
            size="sm"
            onAfterNavigate={onClose}
          />
          <div className="flex items-center gap-2">
            <Button variant="light" onPress={onClose}>
              Закрити
            </Button>
            <Button
              color="primary"
              startContent={
                <DynamicIcon
                  name={loading ? 'loader-circle' : 'table-properties'}
                  size={16}
                  className={loading ? 'animate-spin' : ''}
                />
              }
              onPress={() => generate(filters, meta)}
            >
              Сформувати
            </Button>
          </div>
        </div>
      }
    >
      {metaError ? (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger">
          {metaError}
        </div>
      ) : null}

      <ProductMovementsFilters
        key={filtersMountKey}
        meta={meta}
        filters={filters}
        onChange={(next) => setFilters(normalizeProductMovementsFilters(next))}
        compact
        productLocked={Boolean(initialFilters?.sku || initialFilters?.dilovodGoodId)}
      />

      {error ? (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {result && generatedFilters ? (
        <ProductMovementsReportHeader
          result={result}
          filters={generatedFilters}
          meta={meta}
          showIdentity={false}
        />
      ) : null}

      <ProductMovementsTable
        result={result}
        loading={loading || metaLoading}
        hasGenerated={hasGenerated}
        compact
      />
    </ResizableAppDrawer>
  );
}
