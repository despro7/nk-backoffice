import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody } from '@heroui/react';
import MovementMobProductEditDrawer from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobProductEditDrawer';
import { ToastService } from '@/services/ToastService';
import { WarehouseBatchesFilterBar } from './components/WarehouseBatchesFilterBar';
import { WarehouseBatchesTable } from './components/WarehouseBatchesTable';
import { useWarehouseBatchesFilters } from './useWarehouseBatchesFilters';
import { useWarehouseBatchesList } from './useWarehouseBatchesList';

export default function WarehouseBatches() {
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [productDrawerId, setProductDrawerId] = useState<string | null>(null);
  const list = useWarehouseBatchesList(onlyWithStock);
  const filters = useWarehouseBatchesFilters(list.items, {
    onlyWithStock,
    setOnlyWithStock,
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
