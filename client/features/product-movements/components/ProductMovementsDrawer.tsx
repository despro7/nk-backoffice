import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductMovementsFilterState } from '../types';
import { createDefaultFilters } from '../productMovementsUtils';
import useProductMovementsMeta from '../hooks/useProductMovementsMeta';
import useProductMovementsQuery from '../hooks/useProductMovementsQuery';
import ProductMovementsFilters from './ProductMovementsFilters';
import ProductMovementsTable from './ProductMovementsTable';

interface ProductMovementsDrawerProps {
  isOpen: boolean;
  initialFilters: ProductMovementsFilterState | null;
  autoGenerate?: boolean;
  onClose: () => void;
}

export default function ProductMovementsDrawer({
  isOpen,
  initialFilters,
  autoGenerate = false,
  onClose,
}: ProductMovementsDrawerProps) {
  const { meta, loading: metaLoading, error: metaError } = useProductMovementsMeta(isOpen);
  const {
    result,
    hasGenerated,
    loading,
    error,
    generate,
    reset,
  } = useProductMovementsQuery();
  const [filters, setFilters] = useState<ProductMovementsFilterState>(createDefaultFilters());
  const openSessionRef = useRef(0);
  const autoGenerateSessionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      autoGenerateSessionRef.current = null;
      return;
    }

    const nextFilters = initialFilters ?? createDefaultFilters();
    const sessionId = openSessionRef.current + 1;
    openSessionRef.current = sessionId;
    autoGenerateSessionRef.current = autoGenerate ? sessionId : null;

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
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      placement="right"
      size="4xl"
      classNames={{
        base: 'flex flex-col',
        body: 'flex-1 min-h-0 overflow-y-auto',
        closeButton: 'top-3 right-3',
      }}
    >
      <DrawerContent>
        <DrawerHeader className="border-b border-default-200 shrink-0 flex flex-col items-start gap-1">
          <div className="text-base font-semibold">{title}</div>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-4 py-4 overflow-y-auto min-h-0">
          {metaError ? (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger">
              {metaError}
            </div>
          ) : null}

          <ProductMovementsFilters
            meta={meta}
            filters={filters}
            onChange={setFilters}
            compact
            productLocked={Boolean(initialFilters?.sku || initialFilters?.dilovodGoodId)}
          />

          {error ? (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <ProductMovementsTable
            result={result}
            loading={loading || metaLoading}
            hasGenerated={hasGenerated}
            compact
          />
        </DrawerBody>

        <DrawerFooter className="border-t border-default-200 shrink-0 gap-2">
          <Button variant="light" onPress={onClose}>
            Закрити
          </Button>
          <Button
            color="primary"
            startContent={<DynamicIcon name={loading ? 'loader-circle' : 'table-properties'} size={16} className={loading ? 'animate-spin' : ''} />}
            onPress={() => generate(filters, meta)}
          >
            Сформувати
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
