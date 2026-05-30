import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Button,
  Chip,
  Spinner,
} from "@heroui/react";
import { useApi } from "@/hooks/useApi";
import { getLocalTimeZone, today } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { createStandardDatePresets } from "@/lib/dateReportingUtils";
import { ORDER_STATUSES } from "@/lib/formatUtils";
import { getValueColor } from "@/lib/utils";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import {
  CacheRefreshConfirmModal,
  CachePeriodSelectModal,
} from "@/components/modals/CacheRefreshConfirmModal";
import { ReportCacheProgressCard } from "../../shared/ReportCacheProgressCard";
import { ReportLoadingOverlay } from "../../shared/ReportLoadingOverlay";
import { ReportRefreshCacheActions } from "../../shared/ReportRefreshCacheActions";
import { ReportTableEmptyState } from "../../shared/ReportTableEmptyState";
import {
  getOrderedQuantityTotal,
  getOrderedQuantityValues,
  formatCalendarDateValue,
  sortReportItems,
} from "../../shared/ReportsSharedUtils";
import useReportClientCache from "../../shared/useReportClientCache";
import useReportCacheValidation from "../../shared/useReportCacheValidation";
import useReportProductStatsFetchers from "../../shared/useReportProductStatsFetchers";
import useReportStatsCacheClear from "../../shared/useReportStatsCacheClear";
import {
  createDateRangeFilterConfig,
  createProductToolbarFilterConfigs,
  ReportsFilterBuilder,
  type ReportFilterConfig,
} from "../../shared/filters";
import type {
  ProductDateStats,
  ProductDateStatsResponse,
  ProductStats,
  ProductStatsResponse,
  ProductStatsSortDescriptor,
  ProductStatsTableProps,
} from "../ReportsGeneralTypes";
import {
  getMainStock,
  getSmallStock,
  getTotalStock,
} from "../ReportsGeneralUtils";

export default function ProductStatsTable({ className }: ProductStatsTableProps) {
  const { apiCall } = useApi();
  const { isAdmin } = useRoleAccess();
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const maxDate = useMemo(() => today(getLocalTimeZone()), []);
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [dateStats, setDateStats] = useState<ProductDateStats[]>([]);
  const [selectedProductInfo, setSelectedProductInfo] = useState<{ name: string; sku: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [viewMode, setViewMode] = useState<"products" | "dates">("products");
  const [sortDescriptor, setSortDescriptor] = useState<ProductStatsSortDescriptor>({
    column: "orderedQuantity",
    direction: "descending",
  });
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const preset = createStandardDatePresets().find((item) => item.key === "last30Days");
    return preset ? preset.getRange() : null;
  });
  const [datePresetKey, setDatePresetKey] = useState<string | null>("last30Days");

  const columns = useMemo(() => {
    return [
      {
        key: viewMode === "dates" ? "date" : "name",
        label: viewMode === "dates" ? "Дата" : "Назва товару",
        sortable: true,
        className: viewMode === "dates" ? "w-3/16" : "w-6/16",
      },
      {
        key: viewMode === "dates" ? "name" : "sku",
        label: viewMode === "dates" ? "Назва товару" : "SKU",
        sortable: viewMode !== "dates",
        className: viewMode === "dates" ? "w-5/16" : "w-2/16",
      },
      { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-2/16 text-center" },
      { key: "totalStock", label: "Залишки Σ", sortable: true, className: "w-2/16 text-center" },
      { key: "mainStock", label: "Склад ГП", sortable: true, className: "w-2/16 text-center" },
      { key: "smallStock", label: "Склад М", sortable: true, className: "w-2/16 text-center" },
    ];
  }, [viewMode]);

  const sortableColumnKeys = useMemo(
    () => columns.filter((column) => column.sortable).map((column) => column.key),
    [columns],
  );

  // Клієнтський кеш за фільтрами
  const { cache, clearCache, invalidateCacheKey, setCacheEntry } = useReportClientCache<{
    data: ProductStats[];
    timestamp: number;
  }>();
  const CACHE_DURATION = 30000; // 30 секунд кешування на клієнті
  const fetchProductStatsRef = useRef<(() => Promise<void>) | null>(null);
  const fetchProductDateStatsRef = useRef<(() => Promise<void>) | null>(null);

  const {
    cacheLoading,
    cacheModals,
    cacheProgress,
    handleRefreshAllCache,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    markCacheUpdated,
  } = useReportCacheValidation({
    apiCall,
    dateRange,
    onCacheValidated: async () => {
      clearCache();
      await fetchProductStatsRef.current?.();
    },
    consoleErrorLabel: 'Помилка валідації кешу статистики:',
  });

  const fetchCacheKey = useCallback(
    (currentStatusFilter: string, currentDateRange: DateRange | null) =>
      `${currentStatusFilter}_${currentDateRange ? `${currentDateRange.start?.toString()}_${currentDateRange.end?.toString()}` : 'no_date'}`,
    [],
  );

  const buildProductStatsUrl = useCallback((currentDateRange: DateRange | null, currentStatusFilter: string) => {
    const params = new URLSearchParams();

    if (currentStatusFilter !== "all") {
      params.append("status", currentStatusFilter);
    }

    if (currentDateRange?.start && currentDateRange?.end) {
      params.append("startDate", formatCalendarDateValue(currentDateRange.start));
      params.append("endDate", formatCalendarDateValue(currentDateRange.end));
    }

    const queryString = params.toString();
    return queryString ? `/api/orders/products/stats?${queryString}` : `/api/orders/products/stats`;
  }, []);

  const buildDateStatsUrl = useCallback((sku: string, currentDateRange: DateRange | null, currentStatusFilter: string) => {
    const params = new URLSearchParams();
    params.append("sku", sku);

    if (currentStatusFilter !== "all") {
      params.append("status", currentStatusFilter);
    }

    if (currentDateRange?.start && currentDateRange?.end) {
      params.append("startDate", formatCalendarDateValue(currentDateRange.start));
      params.append("endDate", formatCalendarDateValue(currentDateRange.end));
    }

    const queryString = params.toString();
    return queryString ? `/api/orders/products/stats/dates?${queryString}` : `/api/orders/products/stats/dates`;
  }, []);

  const { fetchProductDateStats, fetchProductStats } = useReportProductStatsFetchers<
    ProductStats,
    ProductDateStats,
    ProductStatsResponse["metadata"],
    ProductDateStatsResponse["product"],
    { data: ProductStats[]; timestamp: number }
  >({
    apiCall,
    buildProductStatsUrl,
    buildDateStatsUrl,
    cache,
    cacheDuration: CACHE_DURATION,
    dateRange,
    dateStatsErrorMessage: 'Помилка завантаження статистики товару по датах:',
    getCacheKey: fetchCacheKey,
    markCacheUpdated,
    onDateStatsSuccess: (validatedData, product) => {
      setDateStats(validatedData);
      setSelectedProductInfo(product);
      setViewMode("dates");
    },
    onProductStatsCacheHit: (entry) => {
      setProductStats(entry.data);
    },
    onProductStatsNetworkSuccess: (validatedData) => {
      setProductStats(validatedData);
    },
    productStatsErrorMessage: 'Помилка завантаження статистики товарів:',
    selectedProduct,
    setCacheEntry,
    setLoading,
    statusFilter,
    toCacheEntry: (validatedData, _metadata, timestamp) => ({
      data: validatedData,
      timestamp,
    }),
  });

  const { clearStatsCacheLoading, handleClearStatsCache } = useReportStatsCacheClear({
    apiCall,
    onCacheCleared: async () => {
      clearCache();
      if (viewMode === "dates" && selectedProduct) {
        await fetchProductDateStats(true);
        return;
      }

      await fetchProductStats(true);
    },
    consoleErrorLabel: "Помилка очищення серверного кешу статистики товарів:",
  });

  // Обгортка для кнопки оновлення даних
  const handleRefreshData = useCallback(() => {
    // Очищаємо кеш для поточних фільтрів
    const cacheKey = fetchCacheKey(statusFilter, dateRange);
    invalidateCacheKey(cacheKey);

    if (viewMode === "dates" && selectedProduct) {
      fetchProductDateStats(true).catch(console.error);
    } else {
      fetchProductStats(true).catch(console.error);
    }
  }, [fetchCacheKey, fetchProductStats, fetchProductDateStats, statusFilter, dateRange, viewMode, selectedProduct, invalidateCacheKey]);

  const handleSortChange = useCallback((descriptor: ProductStatsSortDescriptor) => {
    setSortDescriptor((current) => {
      if (current.column === descriptor.column && current.direction === descriptor.direction) {
        return current;
      }

      return descriptor;
    });
  }, []);

  // Обробник зміни вибраного товару
  const handleProductChange = useCallback((sku: string) => {
    setSelectedProduct(sku);
    if (sku) {
      // Переключаємося в режим по датах
      setViewMode("dates");
      // Не викликаємо fetchProductDateStats тут, він викличеться в useEffect
    } else {
      // Повертаємося до загального режиму
      setViewMode("products");
      setDateStats([]);
      setSelectedProductInfo(null);
    }
  }, []);

  // Функція скидання фільтрів
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    const preset = datePresets.find((item) => item.key === "last30Days");
    setDateRange(preset ? preset.getRange() : null);
    setDatePresetKey("last30Days");
    setSelectedProduct("");
    setViewMode("products");
    setDateStats([]);
    setSelectedProductInfo(null);
    clearCache(); // Очищаємо весь кеш при скиданні фільтрів
  }, [clearCache, datePresets]);

  useEffect(() => {
    fetchProductStatsRef.current = () => fetchProductStats(true);
    fetchProductDateStatsRef.current = () => fetchProductDateStats(true);
  }, [fetchProductDateStats, fetchProductStats]);

  // Завантаження даних при зміні фільтрів
  useEffect(() => {
    if (viewMode === "dates" && selectedProduct) {
      fetchProductDateStatsRef.current?.();
    } else {
      fetchProductStatsRef.current?.();
    }
  }, [viewMode, selectedProduct, statusFilter, dateRange?.start, dateRange?.end]);

  useEffect(() => {
    if (sortableColumnKeys.includes(sortDescriptor.column)) {
      return;
    }

    setSortDescriptor((current) => {
      if (current.column === "orderedQuantity") {
        return current;
      }

      return {
        column: "orderedQuantity",
        direction: current.direction,
      };
    });
  }, [sortDescriptor.column, sortableColumnKeys]);
  // Сортування даних
  const sortedItems = useMemo(() => {
    return sortReportItems({
      dateItems: dateStats,
      productItems: productStats,
      sortDescriptor,
      viewMode,
      compareDateItems: (first, second, column) => {
        if (column === "totalStock") {
          return getTotalStock(first.stockBalances) - getTotalStock(second.stockBalances);
        }

        if (column === "mainStock") {
          return getMainStock(first.stockBalances) - getMainStock(second.stockBalances);
        }

        if (column === "smallStock") {
          return getSmallStock(first.stockBalances) - getSmallStock(second.stockBalances);
        }

        return null;
      },
      compareProductItems: (first, second, column) => {
        if (column === "totalStock") {
          return getTotalStock(first.stockBalances) - getTotalStock(second.stockBalances);
        }

        if (column === "mainStock") {
          return getMainStock(first.stockBalances) - getMainStock(second.stockBalances);
        }

        if (column === "smallStock") {
          return getSmallStock(first.stockBalances) - getSmallStock(second.stockBalances);
        }

        return null;
      },
    });
  }, [productStats, dateStats, sortDescriptor, viewMode]);

  // Отримання всіх значень для кожного стовпця
  const getAllOrderedQuantities = useMemo(
    () => getOrderedQuantityValues(viewMode, dateStats, productStats),
    [productStats, dateStats, viewMode],
  );

  const getAllTotalStocks = useMemo(() =>
    viewMode === "dates"
      ? dateStats.map(item => getTotalStock(item.stockBalances))
      : productStats.map(item => getTotalStock(item.stockBalances)),
    [productStats, dateStats, viewMode]);

  const getAllMainStocks = useMemo(() =>
    viewMode === "dates"
      ? dateStats.map(item => getMainStock(item.stockBalances))
      : productStats.map(item => getMainStock(item.stockBalances)),
    [productStats, dateStats, viewMode]);

  const getAllSmallStocks = useMemo(() =>
    viewMode === "dates"
      ? dateStats.map(item => getSmallStock(item.stockBalances))
      : productStats.map(item => getSmallStock(item.stockBalances)),
    [productStats, dateStats, viewMode]);

  // Розрахунок підсумкових значень
  const totals = useMemo(() => {
    if (viewMode === "dates") {
      return {
        orderedQuantity: getOrderedQuantityTotal(viewMode, dateStats, productStats),
        totalStock: dateStats.reduce((sum, item) => sum + getTotalStock(item.stockBalances), 0),
        mainStock: dateStats.reduce((sum, item) => sum + getMainStock(item.stockBalances), 0),
        smallStock: dateStats.reduce((sum, item) => sum + getSmallStock(item.stockBalances), 0),
      };
    } else {
      return {
        orderedQuantity: getOrderedQuantityTotal(viewMode, dateStats, productStats),
        totalStock: productStats.reduce((sum, item) => sum + getTotalStock(item.stockBalances), 0),
        mainStock: productStats.reduce((sum, item) => sum + getMainStock(item.stockBalances), 0),
        smallStock: productStats.reduce((sum, item) => sum + getSmallStock(item.stockBalances), 0),
      };
    }
  }, [productStats, dateStats, viewMode]);

  // Форматування розбивки по складах
  const formatStockBreakdown = (stockBalances: { [warehouse: string]: number }) => {
    const entries = Object.entries(stockBalances);
    if (entries.length === 0) return "Немає даних";

    return entries.map(([warehouseId, balance]) => (
      <Chip
        key={warehouseId}
        size="sm"
        variant="flat"
        className="mr-1 mb-1"
      >
        Склад {warehouseId}: {balance}
      </Chip>
    ));
  };

  // Генерація опцій для вибору товару
  const filters = useMemo<ReportFilterConfig[]>(() => createProductToolbarFilterConfigs({
    products: productStats.map((product) => ({
      sku: product.sku,
      name: product.name,
    })),
    selectedProduct: selectedProduct || null,
    onSelectedProductChange: (sku) => handleProductChange(sku ?? ""),
    statusFilter: statusFilter === "all" ? null : statusFilter,
    onStatusFilterChange: (selectedKey) => {
      setStatusFilter(selectedKey ?? "all");
    },
    statusOptions: ORDER_STATUSES,
    periodPresetKey: datePresetKey,
    onPeriodPresetChange: (selectedKey) => {
      if (!selectedKey) {
        return;
      }

      setDatePresetKey(selectedKey);
      const preset = datePresets.find((item) => item.key === selectedKey);
      if (preset) {
        setDateRange(preset.getRange());
      }
    },
    periodPresetOptions: datePresets,
    onReset: resetFilters,
    loading,
    productClassName: "flex-1",
    productTriggerClassName: "h-10 max-w-60",
    statusClassName: "flex-1",
    statusTriggerClassName: "h-10",
    periodClassName: "flex-1",
    periodTriggerClassName: "h-10",
    resetClassName: "h-10 px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500",
    extraFilters: [
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: (value) => {
          setDateRange(value);
          setDatePresetKey(null);
        },
        className: "flex-1",
        inputWrapperClassName: "h-10",
        maxValue: maxDate,
      }),
    ],
  }), [
    datePresetKey,
    datePresets,
    dateRange,
    handleProductChange,
    loading,
    maxDate,
    productStats,
    resetFilters,
    selectedProduct,
    statusFilter,
  ]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Фільтри */}
      <ReportsFilterBuilder filters={filters} className="flex flex-wrap gap-4 items-end" />

      <ReportCacheProgressCard progress={cacheProgress} />

      {/* Таблиця */}
      <div className="relative">
        <Table
          aria-label="Статистика товарів"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) =>
            handleSortChange(descriptor as ProductStatsSortDescriptor)
          }
          classNames={{
            wrapper: "min-h-128 px-0 shadow-none",
            th: [
              "first:rounded-s-md",
              "last:rounded-e-md",
            ],
          }}
        >
          <TableHeader>
            {columns.map((column) => (
              <TableColumn
                key={column.key}
                allowsSorting={column.sortable}
                className={`${column.className} text-sm`}
              >
                {column.label}
              </TableColumn>
            ))}
          </TableHeader>
          <TableBody
            items={sortedItems as any}
            emptyContent={
              <ReportTableEmptyState
                loading={loading}
                emptyMessage={
                  viewMode === "dates"
                    ? "Немає даних по датах для цього товару"
                    : "Немає даних для відображення"
                }
              />
            }
            isLoading={loading}
          >
            {(item) => {
              if (viewMode === "dates") {
                const dateItem = item as ProductDateStats;
                return (
                  <TableRow key={`${selectedProductInfo?.sku || ''}-${dateItem.date}`} className="hover:bg-neutral-50 transition-colors duration-200">
                    <TableCell className="font-medium text-base">
                      {new Date(dateItem.date).toLocaleDateString('uk-UA', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </TableCell>
                    <TableCell className="font-medium text-base">{selectedProductInfo?.name || selectedProduct}</TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(dateItem.orderedQuantity, getAllOrderedQuantities).base,
                          content: getValueColor(dateItem.orderedQuantity, getAllOrderedQuantities).content,
                        }}
                      >
                        {dateItem.orderedQuantity}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(getTotalStock(dateItem.stockBalances), getAllTotalStocks).base,
                          content: getValueColor(getTotalStock(dateItem.stockBalances), getAllTotalStocks).content,
                        }}
                      >
                        {getTotalStock(dateItem.stockBalances)}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(getMainStock(dateItem.stockBalances), getAllMainStocks).base,
                          content: getValueColor(getMainStock(dateItem.stockBalances), getAllMainStocks).content,
                        }}
                      >
                        {getMainStock(dateItem.stockBalances)}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(getSmallStock(dateItem.stockBalances), getAllSmallStocks).base,
                          content: getValueColor(getSmallStock(dateItem.stockBalances), getAllSmallStocks).content,
                        }}
                      >
                        {getSmallStock(dateItem.stockBalances)}
                      </Chip>
                    </TableCell>
                  </TableRow>
                );
              } else {
                const productItem = item as any;
                return (
                  <TableRow key={productItem.sku} className="hover:bg-neutral-50 transition-colors duration-200">
                    <TableCell className="font-medium text-base">{productItem.name}</TableCell>
                    <TableCell className="font-mono text-base">{productItem.sku}</TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(productItem.orderedQuantity, getAllOrderedQuantities).base,
                          content: getValueColor(productItem.orderedQuantity, getAllOrderedQuantities).content,
                        }}
                      >
                        {productItem.orderedQuantity}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(getTotalStock(productItem.stockBalances), getAllTotalStocks).base,
                          content: getValueColor(getTotalStock(productItem.stockBalances), getAllTotalStocks).content,
                        }}
                      >
                        {getTotalStock(productItem.stockBalances)}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(getMainStock(productItem.stockBalances), getAllMainStocks).base,
                          content: getValueColor(getMainStock(productItem.stockBalances), getAllMainStocks).content,
                        }}
                      >
                        {getMainStock(productItem.stockBalances)}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-center text-base">
                      <Chip
                        size="md"
                        variant="flat"
                        classNames={{
                          base: getValueColor(getSmallStock(productItem.stockBalances), getAllSmallStocks).base,
                          content: getValueColor(getSmallStock(productItem.stockBalances), getAllSmallStocks).content,
                        }}
                      >
                        {getSmallStock(productItem.stockBalances)}
                      </Chip>
                    </TableCell>
                  </TableRow>
                );
              }
            }}
          </TableBody>
        </Table>

        {/* Підсумковий рядок */}
        {((viewMode === "products" && productStats.length > 0) || (viewMode === "dates" && dateStats.length > 0)) && (
          <div className="border-t-1 border-gray-200 py-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-gray-800 w-8/16 pl-3">
                {viewMode === "dates"
                  ? `Знайдено ${dateStats.length} днів для товару ${selectedProductInfo?.name || selectedProduct}`
                  : `Знайдено ${productStats.length} товарів`
                }
              </div>
              <div className="text-center font-bold text-gray-800 min-w-[100px] w-2/16">
                {totals.orderedQuantity}
              </div>
              <div className="text-center font-bold text-gray-800 min-w-[100px] w-2/16">
                {totals.totalStock}
              </div>
              <div className="text-center font-bold text-gray-800 min-w-[100px] w-2/16">
                {totals.mainStock}
              </div>
              <div className="text-center font-bold text-gray-800 min-w-[100px] w-2/16">
                {totals.smallStock}
              </div>
            </div>
          </div>
        )}

        {/* Напівпрозорий бекдроп лоадера з анімацією */}
        <ReportLoadingOverlay loading={loading} />
      </div>

      {/* Інформація про результати та кеш з кнопками */}
      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div></div>
        <div className="flex items-center gap-4">
          <ReportRefreshCacheActions
            lastCacheUpdate={lastCacheUpdate}
            loading={loading}
            cacheLoading={cacheLoading}
            clearStatsCacheLoading={clearStatsCacheLoading}
            canManageCache={isAdmin()}
            onRefreshData={handleRefreshData}
            onRefreshAllCache={handleRefreshAllCache}
            onRefreshPeriodCache={handleRefreshPeriodCache}
            onClearStatsCache={handleClearStatsCache}
          />
          <CacheRefreshConfirmModal {...cacheModals.confirmModalProps} />
          <CachePeriodSelectModal
            {...cacheModals.periodModalProps}
            cacheLoading={cacheLoading}
          />
        </div>
      </div>
    </div>
  );
}