import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import type { ProductMovementsDrawerPlacement, ProductMovementsFilterState } from '../types';
import { createDefaultFilters } from '../productMovementsUtils';
import useProductMovementsMeta from '../hooks/useProductMovementsMeta';
import useProductMovementsQuery from '../hooks/useProductMovementsQuery';
import { useProductMovementsDrawerWidth } from '../hooks/useProductMovementsDrawerWidth';
import ProductMovementsFilters from './ProductMovementsFilters';
import ProductMovementsReportHeader from './ProductMovementsReportHeader';
import ProductMovementsTable from './ProductMovementsTable';

interface ProductMovementsDrawerProps {
  isOpen: boolean;
  initialFilters: ProductMovementsFilterState | null;
  autoGenerate?: boolean;
  placement?: ProductMovementsDrawerPlacement;
  /** Не закривати зовні + прозорий backdrop з кліками на фон. */
  nonDismissable?: boolean;
  onClose: () => void;
}

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
  const [activePlacement, setActivePlacement] = useState<ProductMovementsDrawerPlacement>(placement);
  const [activeNonDismissable, setActiveNonDismissable] = useState(nonDismissable);
  const openSessionRef = useRef(0);
  const autoGenerateSessionRef = useRef<number | null>(null);
  const {
    width: drawerWidth,
    isResizing,
    minWidth,
    maxWidth,
    onResizePointerDown,
  } = useProductMovementsDrawerWidth(activePlacement);

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
    setActivePlacement(placement);
    setActiveNonDismissable(nonDismissable);
    reset();
  }, [isOpen, initialFilters, autoGenerate, placement, nonDismissable, reset]);

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

  const pinTooltip = activeNonDismissable
    ? 'Відкріпити: закривати кліком зовні, блокувати фон'
    : 'Закріпити: фон інтерактивний, не закривати кліком зовні';
  const sideTooltip = activePlacement === 'right'
    ? 'Перемістити ліворуч'
    : 'Перемістити праворуч';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      placement={activePlacement}
      size="full"
      backdrop={activeNonDismissable ? 'transparent' : 'opaque'}
      isDismissable={!activeNonDismissable}
      isKeyboardDismissDisabled={activeNonDismissable}
      shouldBlockScroll={!activeNonDismissable}
      style={{
        width: drawerWidth,
        minWidth,
        maxWidth: drawerWidth,
      }}
      classNames={{
        // Пропускаємо кліки крізь overlay на фон; сам panel лишається інтерактивним.
        wrapper: activeNonDismissable ? 'pointer-events-none' : undefined,
        base: cn(
          'flex flex-col !max-w-none',
          activeNonDismissable && 'pointer-events-auto',
          isResizing && 'select-none',
        ),
        body: 'flex-1 min-h-0 overflow-y-auto',
        closeButton: 'top-3 right-3',
      }}
    >
      <DrawerContent>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Змінити ширину панелі рухів"
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={drawerWidth}
          className={cn(
            'absolute top-0 bottom-0 z-50 w-1.5 cursor-col-resize touch-none transition-colors',
            'hover:bg-primary/25 active:bg-primary/40',
            isResizing && 'bg-primary/35',
            activePlacement === 'right' ? 'left-0' : 'right-0',
          )}
          onPointerDown={onResizePointerDown}
        />
        <div className="absolute top-3 right-11 z-50 flex items-center gap-0.5">
          <Tooltip content={pinTooltip} placement="bottom" color="secondary">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={pinTooltip}
              aria-pressed={activeNonDismissable}
              className="min-w-8 w-8 h-8 text-default-500"
              onPress={() => setActiveNonDismissable((value) => !value)}
            >
              <DynamicIcon name={activeNonDismissable ? 'pin' : 'pin-off'} size={16} />
            </Button>
          </Tooltip>
          <Tooltip content={sideTooltip} placement="bottom" color="secondary">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={sideTooltip}
              className="min-w-8 w-8 h-8 text-default-500"
              onPress={() => setActivePlacement((value) => (value === 'right' ? 'left' : 'right'))}
            >
              <DynamicIcon
                name={activePlacement === 'right' ? 'arrow-left-to-line' : 'arrow-right-to-line'}
                size={16}
              />
            </Button>
          </Tooltip>
        </div>
        <DrawerHeader className="border-b border-default-200 shrink-0 flex flex-col items-start gap-1 pr-28">
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
