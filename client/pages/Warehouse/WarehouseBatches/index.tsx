import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody } from '@heroui/react';
import { useProductMovementsDrawer } from '@/features/product-movements/context/ProductMovementsDrawerContext';
import MovementMobProductEditDrawer from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobProductEditDrawer';
import { ToastService } from '@/services/ToastService';
import { WarehouseBatchesFilterBar } from './components/WarehouseBatchesFilterBar';
import { WarehouseBatchesTable } from './components/WarehouseBatchesTable';
import { useWarehouseBatchesFilters } from './useWarehouseBatchesFilters';
import { useWarehouseBatchesList } from './useWarehouseBatchesList';
import type {
  WarehouseBatchKind,
  WarehouseBatchListItem,
  WarehouseBatchNegativeMode,
} from './WarehouseBatchesTypes';
import { WAREHOUSE_BATCH_DEFAULT_KINDS } from './WarehouseBatchesTypes';

export default function WarehouseBatches() {
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [negativeMode, setNegativeMode] = useState<WarehouseBatchNegativeMode>('all');
  const [batchKinds, setBatchKinds] = useState<WarehouseBatchKind[]>([
    ...WAREHOUSE_BATCH_DEFAULT_KINDS,
  ]);
  const [productDrawerId, setProductDrawerId] = useState<string | null>(null);
  const { open: openProductMovements } = useProductMovementsDrawer();

  const list = useWarehouseBatchesList({
    onlyWithStock,
    negativeMode,
    batchKinds,
  });
  const filters = useWarehouseBatchesFilters(list.items, {
    onlyWithStock,
    setOnlyWithStock,
    negativeMode,
    setNegativeMode,
    batchKinds,
    setBatchKinds,
  });

  useEffect(() => {
    if (!list.error) return;
    ToastService.show({ title: list.error, color: 'danger' });
  }, [list.error]);

  const handleProductOpen = useCallback((productId: string) => {
    setProductDrawerId(productId);
  }, []);

  const handleProductDrawerClose = useCallback(() => {
    setProductDrawerId(null);
  }, []);

  const handleProductSaved = useCallback(() => {
    void list.refetch();
  }, [list.refetch]);

  const handleBatchOpen = useCallback((item: WarehouseBatchListItem) => {
    openProductMovements({
      sku: item.sku ?? undefined,
      dilovodGoodId: item.productId || undefined,
      productName: item.productName,
      goodPartId: item.batchId,
      batchLabel: item.batchNumber,
      autoGenerate: true,
    });
  }, [openProductMovements]);

  return (
    <div className="flex flex-col gap-4 px-3 md:px-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-default-900">Партії</h1>
        <p className="text-sm text-default-500">
          Актуальні партії готової продукції з Dilovod та локальними штрихкодами.
        </p>
      </div>

      <WarehouseBatchesFilterBar
        onlyWithStock={filters.onlyWithStock}
        onOnlyWithStockChange={filters.setOnlyWithStock}
        negativeMode={filters.negativeMode}
        onNegativeModeChange={filters.setNegativeMode}
        batchKinds={filters.batchKinds}
        onBatchKindsChange={filters.setBatchKinds}
        columnReorderEnabled={filters.columnReorderEnabled}
        onColumnReorderEnabledChange={filters.setColumnReorderEnabled}
        searchQuery={filters.searchQuery}
        onSearchQueryChange={filters.setSearchQuery}
        dateRange={filters.dateRange}
        onDateRangeChange={filters.setDateRange}
        datePresetKey={filters.datePresetKey}
        onDatePresetKeyChange={filters.setDatePresetKey}
        onReset={filters.resetFilters}
        loading={list.loading}
        hasActiveFilters={filters.hasActiveFilters}
      />

      <Card shadow="none" className="rounded-xl">
        <CardBody className="p-3 overflow-x-auto">
          <WarehouseBatchesTable
            items={filters.filteredItems}
            loading={list.loading}
            columnReorderEnabled={filters.columnReorderEnabled}
            onProductOpen={handleProductOpen}
            onBatchOpen={handleBatchOpen}
          />
        </CardBody>
      </Card>

      <MovementMobProductEditDrawer
        catalogGoodId={productDrawerId}
        open={Boolean(productDrawerId)}
        onClose={handleProductDrawerClose}
        onSaved={handleProductSaved}
      />
    </div>
  );
}
