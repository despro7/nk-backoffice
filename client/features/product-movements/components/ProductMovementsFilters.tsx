import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Autocomplete, AutocompleteItem, Input, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import { getLocalTimeZone, today } from '@internationalized/date';
import { CATALOG_FINISHED_PRODUCTS_FOLDER_NAME } from '@shared/types/catalog';
import { useBatchNumbers, type BatchNumber } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import {
  ReportsFilterBuilder,
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
} from '@/pages/Reports/shared/filters';
import type { ProductMovementsFilterState, ProductMovementsMetaResponse } from '../types';
import {
  createDatePresets,
  dateRangeToPeriod,
  formatProductDisplayLabel,
  periodToDateRange,
} from '../productMovementsUtils';
import {
  formatRecentSearchHint,
  loadProductMovementsRecentSearches,
  subscribeProductMovementsRecentSearches,
} from '../productMovementsRecentSearches';

type CatalogSearchItem = {
  id: string;
  name: string;
  sku: string | null;
};

interface ProductMovementsFiltersProps {
  meta: ProductMovementsMetaResponse | null;
  filters: ProductMovementsFilterState;
  onChange: (next: ProductMovementsFilterState) => void;
  onRecentSearchSelect?: (filters: ProductMovementsFilterState) => void;
  actions?: ReactNode;
  compact?: boolean;
  productLocked?: boolean;
}

function formatBatchOptionLabel(batch: BatchNumber): string {
  const parts = [batch.batchNumber || batch.batchId];
  if (batch.storageDisplayName) {
    parts.push(batch.storageDisplayName);
  }
  if (Number.isFinite(batch.quantity)) {
    parts.push(`${batch.quantity} шт.`);
  }
  return parts.join(' · ');
}

function BatchOptionContent({ batch }: { batch: BatchNumber }) {
  const title = batch.batchNumber || batch.batchId;
  const qtyLabel = Number.isFinite(batch.quantity) ? `${batch.quantity} шт.` : null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1 truncate text-sm">
        <span>{title}</span>
        {batch.storageDisplayName ? (
          <span className="text-default-400"> · {batch.storageDisplayName}</span>
        ) : null}
      </div>
      {qtyLabel ? (
        <span className="shrink-0 text-xs font-semibold text-foreground">{qtyLabel}</span>
      ) : null}
    </div>
  );
}

async function searchCatalogProducts(
  q: string,
  options?: { underFolderName?: string },
): Promise<CatalogSearchItem[]> {
  const params = new URLSearchParams({ q });
  if (options?.underFolderName) {
    params.set('underFolderName', options.underFolderName);
  }
  const res = await fetch(`/api/catalog/search?${params.toString()}`, { credentials: 'include' });
  const json = await res.json();
  if (!res.ok || json?.success === false) return [];
  return (json.data || [])
    .filter((row: { isGroup?: boolean }) => !row.isGroup)
    .map((row: { id: string; name: string; sku: string | null }) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
    }));
}

export default function ProductMovementsFilters({
  meta,
  filters,
  onChange,
  onRecentSearchSelect,
  actions,
  compact = false,
  productLocked = false,
}: ProductMovementsFiltersProps) {
  const [datePresetKey, setDatePresetKey] = useState<string | null>('last30Days');
  const datePresets = useMemo(() => createDatePresets(), []);
  const maxDate = today(getLocalTimeZone());
  const dateRange = periodToDateRange(filters.startDate, filters.endDate);

  const storageOptions = useMemo(
    () => (meta?.storages ?? []).map((item) => ({ key: item.id, label: item.name })),
    [meta?.storages],
  );
  const firmOptions = useMemo(
    () => (meta?.firms ?? []).map((item) => ({ key: item.id, label: item.name })),
    [meta?.firms],
  );

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    const period = dateRangeToPeriod(range);
    if (!period) return;
    onChange({ ...filters, startDate: period.startDate, endDate: period.endDate });
    setDatePresetKey('custom');
  }, [filters, onChange]);

  const handleDatePresetChange = useCallback((key: string | null) => {
    setDatePresetKey(key);
    if (!key || key === 'custom') return;
    const preset = datePresets.find((item) => item.key === key);
    if (!preset) return;
    const period = dateRangeToPeriod(preset.getRange());
    if (!period) return;
    onChange({ ...filters, startDate: period.startDate, endDate: period.endDate });
  }, [datePresets, filters, onChange]);

  const filterControlHeight = compact ? 'h-8' : 'h-10';

  const periodFilters = useMemo(() => [
    createPeriodFilterConfig({
      selectedKey: datePresetKey,
      onChange: handleDatePresetChange,
      options: [
        ...datePresets.map((preset) => ({ key: preset.key, label: preset.label })),
        ...(datePresetKey === 'custom' ? [{ key: 'custom', label: 'Обраний період' }] : []),
      ],
      size: compact ? 'sm' : 'md',
      className: compact ? 'w-40' : 'w-44',
      triggerClassName: filterControlHeight,
    }),
    createDateRangeFilterConfig({
      value: dateRange,
      onChange: handleDateRangeChange,
      maxValue: maxDate,
      size: compact ? 'sm' : 'md',
      inputWrapperClassName: filterControlHeight,
    }),
  ], [compact, datePresetKey, datePresets, dateRange, filterControlHeight, handleDatePresetChange, handleDateRangeChange, maxDate]);

  const { batches, loading: batchesLoading, fetchBatches } = useBatchNumbers();
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productOptions, setProductOptions] = useState<CatalogSearchItem[]>([]);
  const [recentSearches, setRecentSearches] = useState(() => loadProductMovementsRecentSearches(meta));
  const [batchQuery, setBatchQuery] = useState('');
  const productInputRef = useRef<HTMLInputElement>(null);
  const productSearchQueryRef = useRef('');
  const ignoreProductSelectionClearRef = useRef(false);
  const selectedProductKey = filters.sku || filters.dilovodGoodId || null;

  const clearProductSelection = useCallback(() => {
    onChange({
      ...filters,
      sku: null,
      dilovodGoodId: null,
      productName: null,
      goodPartId: null,
      batchLabel: null,
    });
    setProductSearchQuery('');
    productSearchQueryRef.current = '';
    setBatchQuery('');
  }, [filters, onChange]);

  useEffect(() => {
    return subscribeProductMovementsRecentSearches(() => {
      setRecentSearches(loadProductMovementsRecentSearches(meta));
    });
  }, [meta]);

  useEffect(() => {
    setRecentSearches(loadProductMovementsRecentSearches(meta));
  }, [meta]);

  const productDisplayLabel = useMemo(
    () => formatProductDisplayLabel(filters.productName, filters.sku),
    [filters.productName, filters.sku],
  );

  const productItems = useMemo((): CatalogSearchItem[] => {
    if (!productSearchQuery.trim()) {
      return [];
    }

    if (!selectedProductKey || !filters.productName) {
      return productOptions;
    }

    const selectedItem: CatalogSearchItem = {
      id: filters.dilovodGoodId || selectedProductKey,
      name: filters.productName,
      sku: filters.sku,
    };
    const selectedKey = selectedItem.sku || selectedItem.id;
    const hasSelected = productOptions.some(
      (item) => (item.sku || item.id) === selectedKey,
    );

    return hasSelected ? productOptions : [selectedItem, ...productOptions];
  }, [
    filters.dilovodGoodId,
    filters.productName,
    filters.sku,
    productOptions,
    productSearchQuery,
    selectedProductKey,
  ]);

  const productInputValue = !productMenuOpen && selectedProductKey
    ? productDisplayLabel
    : productSearchQuery;

  const handleProductInputChange = useCallback((value: string) => {
    productSearchQueryRef.current = value;
    setProductSearchQuery(value);
    if (productMenuOpen && !value.trim() && selectedProductKey) {
      clearProductSelection();
    }
  }, [clearProductSelection, productMenuOpen, selectedProductKey]);

  const closeProductMenu = useCallback(() => {
    setProductMenuOpen(false);
    setProductSearchQuery('');
    productSearchQueryRef.current = '';
  }, []);

  const applyProductSelection = useCallback((key: string) => {
    const hit = productItems.find(
      (item) => item.sku === key || item.id === key,
    );
    ignoreProductSelectionClearRef.current = true;
    onChange({
      ...filters,
      sku: hit?.sku ?? key,
      dilovodGoodId: hit?.id ?? null,
      productName: hit?.name ?? null,
      goodPartId: null,
      batchLabel: null,
    });
    closeProductMenu();
    setBatchQuery('');
    window.setTimeout(() => {
      ignoreProductSelectionClearRef.current = false;
    }, 0);
  }, [closeProductMenu, filters, onChange, productItems]);

  const handleRecentSearchApply = useCallback((nextFilters: ProductMovementsFilterState) => {
    ignoreProductSelectionClearRef.current = true;
    onChange(nextFilters);
    onRecentSearchSelect?.(nextFilters);
    closeProductMenu();
    setBatchQuery('');
    window.setTimeout(() => {
      ignoreProductSelectionClearRef.current = false;
    }, 0);
  }, [closeProductMenu, onChange, onRecentSearchSelect]);

  const recentSearchesEmptyContent = useMemo(() => {
    if (productSearchQuery.trim()) {
      return 'Товарів не знайдено';
    }
    if (recentSearches.length === 0) {
      return 'Немає збережених запитів';
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="px-2 py-1 text-xs font-medium text-default-400">Останні запити</div>
        {recentSearches.map((recent) => (
          <button
            key={recent.id}
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-default-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleRecentSearchApply(recent.filters)}
          >
            <DynamicIcon name="history" size={14} className="shrink-0 text-default-400" />
            <div className="min-w-0">
              <span className="truncate text-sm">{recent.label}</span>
              <span className="truncate text-xs text-default-400 bg-default-50/25 border border-default-500/15 rounded px-1 py-0.5 ml-1.5">
                {formatRecentSearchHint(recent.hint)}
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  }, [handleRecentSearchApply, productSearchQuery, recentSearches]);

  useEffect(() => {
    if (!productMenuOpen || !productSearchQuery.trim()) {
      if (!productMenuOpen) {
        setProductOptions([]);
      }
      return;
    }
    const handle = window.setTimeout(() => {
      void searchCatalogProducts(productSearchQuery.trim(), {
        underFolderName: CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
      }).then(setProductOptions);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [productMenuOpen, productSearchQuery]);

  useEffect(() => {
    if (!filters.sku) return;
    const asOfDate = filters.endDate
      ? new Date(`${filters.endDate}T23:59:59`)
      : undefined;
    void fetchBatches(
      filters.sku,
      asOfDate,
      filters.firmId ?? undefined,
      false,
      filters.storageId ?? undefined,
      { includeSmallStorage: true, includeNonPositiveQty: true },
    );
  }, [filters.sku, filters.endDate, filters.firmId, filters.storageId, fetchBatches]);

  const batchOptions = useMemo(() => {
    const needle = batchQuery.trim().toLowerCase();
    const seen = new Map<string, BatchNumber>();
    for (const batch of batches) {
      if (filters.storageId && batch.storage !== filters.storageId) continue;
      if (filters.firmId && batch.firm !== filters.firmId) continue;
      const label = formatBatchOptionLabel(batch).toLowerCase();
      if (needle && !label.includes(needle) && !batch.batchId.includes(needle)) continue;
      if (!seen.has(batch.batchId)) seen.set(batch.batchId, batch);
    }
    return [...seen.values()].sort((left, right) =>
      (left.batchNumber || left.batchId).localeCompare(right.batchNumber || right.batchId, 'uk'),
    );
  }, [batchQuery, batches, filters.firmId, filters.storageId]);

  const batchDisplayValue = filters.batchLabel
    || batchOptions.find((batch) => batch.batchId === filters.goodPartId)?.batchNumber
    || filters.goodPartId
    || '';

  return (
    <div className={`flex flex-col gap-3 ${compact ? 'mb-6' : 'bg-white rounded-xl p-4 border border-default-200'}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className={compact ? 'min-w-[220px] flex-1' : 'min-w-[280px] flex-1'}>
          {productLocked && selectedProductKey ? (
            <Input
              label="Товар"
              labelPlacement="outside"
              value={productDisplayLabel}
              isReadOnly
              size={compact ? 'sm' : 'md'}
              classNames={{ inputWrapper: filterControlHeight }}
            />
          ) : (
            <Autocomplete
              ref={productInputRef}
              aria-label="Товар"
              label={compact ? undefined : 'Товар'}
              labelPlacement="outside"
              placeholder="Пошук товару за назвою або SKU"
              inputValue={productInputValue}
              onInputChange={handleProductInputChange}
              onOpenChange={(open) => {
                setProductMenuOpen(open);
                if (open) {
                  const nextQuery = productDisplayLabel;
                  productSearchQueryRef.current = nextQuery;
                  setProductSearchQuery(nextQuery);
                  return;
                }
                productSearchQueryRef.current = '';
                setProductSearchQuery('');
              }}
              selectedKey={selectedProductKey}
              onClear={clearProductSelection}
              onSelectionChange={(key) => {
                if (!key) {
                  if (ignoreProductSelectionClearRef.current) {
                    return;
                  }
                  clearProductSelection();
                  closeProductMenu();
                  return;
                }

                applyProductSelection(String(key));
              }}
              items={productItems}
              isClearable
              allowsCustomValue={false}
              menuTrigger="focus"
              defaultFilter={() => true}
              isVirtualized={false}
              size={compact ? 'sm' : 'md'}
              startContent={<DynamicIcon name="package" size={16} className="text-default-400" />}
              listboxProps={{
                emptyContent: recentSearchesEmptyContent,
                classNames: {
                  emptyContent: 'p-0',
                },
              }}
            >
              {(item) => (
                <AutocompleteItem
                  key={item.sku || item.id}
                  textValue={`${item.name} ${item.sku ?? ''}`}
                >
                  {item.name}{item.sku ? ` (${item.sku})` : ''}
                </AutocompleteItem>
              )}
            </Autocomplete>
          )}
        </div>

        <ReportsFilterBuilder filters={periodFilters} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Autocomplete
          aria-label="Партія"
          label="Партія"
          labelPlacement="outside"
          placeholder={
            !filters.sku
              ? 'Спочатку оберіть товар'
              : batchesLoading
                ? 'Завантаження партій…'
                : 'Оберіть партію'
          }
          isDisabled={!filters.sku}
          isLoading={batchesLoading}
          inputValue={batchQuery || batchDisplayValue}
          onInputChange={setBatchQuery}
          selectedKey={filters.goodPartId}
          onSelectionChange={(key) => {
            if (!key) {
              onChange({ ...filters, goodPartId: null, batchLabel: null });
              setBatchQuery('');
              return;
            }
            const hit = batchOptions.find((batch) => batch.batchId === key);
            onChange({
              ...filters,
              goodPartId: String(key),
              batchLabel: hit?.batchNumber || String(key),
            });
            setBatchQuery('');
          }}
          items={batchOptions}
          isClearable
          size={compact ? 'sm' : 'md'}
          className="min-w-0 flex-1 md:min-w-[200px]"
          startContent={<DynamicIcon name="layers" size={16} className="text-default-400" />}
          listboxProps={{ emptyContent: filters.sku ? 'Партій не знайдено' : 'Оберіть товар' }}
        >
          {(batch) => (
            <AutocompleteItem
              key={batch.batchId}
              textValue={formatBatchOptionLabel(batch)}
            >
              <BatchOptionContent batch={batch} />
            </AutocompleteItem>
          )}
        </Autocomplete>

        {meta?.filters.storage ? (
          <Select
            label="Склад"
            labelPlacement="outside"
            placeholder="Усі склади"
            selectedKeys={filters.storageId ? [filters.storageId] : []}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0];
              onChange({ ...filters, storageId: value ? String(value) : null });
            }}
            size={compact ? 'sm' : 'md'}
            className="min-w-0 flex-1 md:min-w-[160px] md:max-w-[240px]"
          >
            {storageOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        ) : null}

        {meta?.filters.firm ? (
          <Select
            label="Фірма"
            labelPlacement="outside"
            placeholder="Усі фірми"
            selectedKeys={filters.firmId ? [filters.firmId] : []}
            onSelectionChange={(keys) => {
              const value = Array.from(keys)[0];
              onChange({ ...filters, firmId: value ? String(value) : null });
            }}
            size={compact ? 'sm' : 'md'}
            className="min-w-0 flex-1 md:min-w-[160px] md:max-w-[200px]"
          >
            {firmOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        ) : null}

        {actions ? (
          <div className="flex w-full items-center justify-end gap-2 md:ml-auto md:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
