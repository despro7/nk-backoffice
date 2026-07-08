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
} from "@heroui/react";
import { useApi } from "@/hooks/useApi";
import type { DateRange } from "@react-types/datepicker";
import { CalendarDate, today, getLocalTimeZone } from "@internationalized/date";
import { DynamicIcon } from "lucide-react/dynamic";
import { createStandardDatePresets, getValueColor } from "@/lib";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { ToastService } from "@/services/ToastService";
import {
  CacheRefreshConfirmModal,
  CachePeriodSelectModal,
} from "@/components/modals/CacheRefreshConfirmModal";
import { ORDER_STATUSES } from "@/lib/formatUtils.js";
import { ReportCacheProgressCard } from "../../shared/ReportCacheProgressCard";
import { ReportLoadingOverlay } from "../../shared/ReportLoadingOverlay";
import { ReportRefreshCacheActions } from "../../shared/ReportRefreshCacheActions";
import { ReportTableEmptyState } from "../../shared/ReportTableEmptyState";
import {
  appendStatusParams,
  getOrderedQuantityTotal,
  getOrderedQuantityValues,
  sortReportItems,
} from "../../shared/ReportsSharedUtils";
import useReportClientCache from "../../shared/useReportClientCache";
import useReportCacheValidation from "../../shared/useReportCacheValidation";
import useReportProductStatsFetchers from "../../shared/useReportProductStatsFetchers";
import useReportStatsCacheClear from "../../shared/useReportStatsCacheClear";
import {
  ReportsFilterBuilder,
  type ReportFilterConfig,
} from "../../shared/filters";
import {
  createDateRangeFilterConfig,
  createProductToolbarFilterConfigs,
  createResetFilterConfig,
  createSingleDateFilterConfig,
} from "../../shared/filters/ReportFilterPresets";
import { ShipmentOrdersModal } from "./ShipmentOrdersModal";
import type {
  ProductDateStats,
  ProductDateStatsResponse,
  ProductShippedStatsTableProps,
  ProductStats,
  ProductStatsResponse,
  ShipmentSummary,
  ShipmentModalProduct,
  ShipmentProductOrder,
  ShipmentOrdersTabKey,
  ShipmentSortDescriptor,
} from "../ReportsShipmentTypes";
import {
  buildShipmentCacheKey,
  getPresetKeyForShipmentDate,
  SHIPMENT_DEFAULT_PRESET_KEY,
  toShipmentApiDateValue,
} from "../ReportsShipmentUtils";

function getDefaultShipmentDateRange() {
  const preset = createStandardDatePresets().find((item) => item.key === SHIPMENT_DEFAULT_PRESET_KEY);
  return preset ? preset.getRange() : null;
}

function getItemPortions(item: ProductStats): number {
  if (!item.isMonolithicSet) {
    return item.orderedQuantity;
  }

  return item.orderedQuantity * (item.setPortions ?? 0);
}

function buildShipmentSummary(
  productItems: ProductStats[],
  totalOrders: number,
  ordersWithMonolithicSetsCount: number,
): ShipmentSummary {
  const monolithicSetItems = productItems.filter((item) => item.isMonolithicSet);
  const regularItems = productItems.filter((item) => !item.isMonolithicSet);

  const regularPortions = regularItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
  const shippedSetsCount = monolithicSetItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
  const shippedSetPortions = monolithicSetItems.reduce((sum, item) => sum + getItemPortions(item), 0);
  const regularOrders = Math.max(0, totalOrders - ordersWithMonolithicSetsCount);

  return {
    totalOrders,
    regularOrders,
    totalPortions: regularPortions + shippedSetPortions,
    regularPortions,
    shippedSetsCount,
    shippedSetPortions,
    uniqueProducts: productItems.length,
  };
}

export default function ProductShippedStatsTable({
  className,
  onSummaryChange,
}: ProductShippedStatsTableProps) {
  const { apiCall } = useApi();
  const { isAdmin } = useRoleAccess();
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [ordersWithMonolithicSetsCount, setOrdersWithMonolithicSetsCount] = useState(0);
  const [dateStats, setDateStats] = useState<ProductDateStats[]>([]);
  const [selectedProductInfo, setSelectedProductInfo] = useState<ShipmentModalProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [viewMode, setViewMode] = useState<"products" | "dates">("products");
  const [dateSortDescriptor, setDateSortDescriptor] = useState<ShipmentSortDescriptor>({
    column: "orderedQuantity",
    direction: "descending",
  });
  const [monolithicSortDescriptor, setMonolithicSortDescriptor] = useState<ShipmentSortDescriptor>({
    column: "name",
    direction: "ascending",
  });
  const [regularSortDescriptor, setRegularSortDescriptor] = useState<ShipmentSortDescriptor>({
    column: "name",
    direction: "ascending",
  });
  const [dateRange, setDateRange] = useState<DateRange | null>(() => getDefaultShipmentDateRange());
  const [datePresetKey, setDatePresetKey] = useState<string | null>(SHIPMENT_DEFAULT_PRESET_KEY);
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalOrders, setModalOrders] = useState<ShipmentProductOrder[]>([]);
  const [modalMonolithicOrders, setModalMonolithicOrders] = useState<ShipmentProductOrder[]>([]);
  const [modalDefaultTab, setModalDefaultTab] = useState<ShipmentOrdersTabKey>("regular");
  const [selectedProductForModal, setSelectedProductForModal] = useState<ShipmentModalProduct | null>(null);

  const statusOptions = ORDER_STATUSES;

  const columns = useMemo(() => {
    if (viewMode === "dates") {
      return [
        { key: "date", label: "Дата", sortable: true, className: "w-4/16" },
        { key: "name", label: "Назва товару", sortable: false, className: "w-8/16" },
        { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-4/16 text-center" },
      ];
    }

    return [
      { key: "name", label: "Назва товару", sortable: true, className: "w-10/16" },
      { key: "sku", label: "SKU", sortable: true, className: "w-3/16 text-left" },
      { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-3/16 text-center" },
    ];
  }, [viewMode]);

  const sortableColumnKeys = useMemo(
    () => columns.filter((column) => column.sortable).map((column) => column.key),
    [columns],
  );
  // Клієнтський кеш за фільтрами
  const { cache, clearCache, invalidateCacheKey, setCacheEntry } = useReportClientCache<{
    data: ProductStats[];
    totalOrders: number;
    ordersWithMonolithicSetsCount: number;
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
    consoleErrorLabel: 'Помилка валідації кешу статистики відвантажень:',
  });

  const buildProductStatsUrl = useCallback((currentDateRange: DateRange | null, currentStatusFilter: string) => {
    const params = new URLSearchParams();
    params.append("shippedOnly", "true");
    appendStatusParams(params, currentStatusFilter, ["1", "2", "3", "4", "5", "6", "7"]);

    if (currentDateRange?.start && currentDateRange?.end) {
      params.append("startDate", toShipmentApiDateValue(currentDateRange.start));
      params.append("endDate", toShipmentApiDateValue(currentDateRange.end));
    }

    return `/api/orders/products/stats?${params.toString()}`;
  }, []);

  const buildDateStatsUrl = useCallback((sku: string, currentDateRange: DateRange | null, currentStatusFilter: string) => {
    const params = new URLSearchParams();
    params.append("sku", sku);
    params.append("shippedOnly", "true");
    appendStatusParams(params, currentStatusFilter, ["1", "2", "3", "4", "5", "6", "7"]);

    if (currentDateRange?.start && currentDateRange?.end) {
      params.append("startDate", toShipmentApiDateValue(currentDateRange.start));
      params.append("endDate", toShipmentApiDateValue(currentDateRange.end));
    }

    return `/api/orders/products/stats/dates?${params.toString()}`;
  }, []);

  const syncSummary = useCallback((nextProductStats: ProductStats[], nextTotalOrders: number, nextOrdersWithMonolithicSetsCount: number) => {
    if (!onSummaryChange) {
      return;
    }

    onSummaryChange(buildShipmentSummary(nextProductStats, nextTotalOrders, nextOrdersWithMonolithicSetsCount));
  }, [onSummaryChange]);

  const handleDateStatsSuccess = useCallback((validatedData: ProductDateStats[], product: ShipmentModalProduct) => {
    setDateStats(validatedData);
    setSelectedProductInfo(product);
    setViewMode("dates");
  }, []);

  const handleProductStatsCacheHit = useCallback((entry: { data: ProductStats[]; totalOrders: number; ordersWithMonolithicSetsCount: number; timestamp: number }) => {
    const cachedData = entry.data;
    const nextTotalOrders = entry.totalOrders ?? 0;
    const nextOrdersWithMonolithicSetsCount = entry.ordersWithMonolithicSetsCount ?? 0;

    setProductStats(cachedData);
    setTotalOrders(nextTotalOrders);
    setOrdersWithMonolithicSetsCount(nextOrdersWithMonolithicSetsCount);
  }, []);

  const handleProductStatsNetworkSuccess = useCallback((validatedData: ProductStats[], metadata: ProductStatsResponse["metadata"]) => {
    setProductStats(validatedData);
    setTotalOrders(metadata.totalOrders);
    setOrdersWithMonolithicSetsCount(metadata.ordersWithMonolithicSetsCount);
  }, []);

  const handleDateSortChange = useCallback((descriptor: ShipmentSortDescriptor) => {
    setDateSortDescriptor((current) => {
      if (
        current.column === descriptor.column
        && current.direction === descriptor.direction
      ) {
        return current;
      }

      return descriptor;
    });
  }, []);

  const handleMonolithicSortChange = useCallback((descriptor: ShipmentSortDescriptor) => {
    setMonolithicSortDescriptor((current) => {
      if (
        current.column === descriptor.column
        && current.direction === descriptor.direction
      ) {
        return current;
      }

      return descriptor;
    });
  }, []);

  const handleRegularSortChange = useCallback((descriptor: ShipmentSortDescriptor) => {
    setRegularSortDescriptor((current) => {
      if (
        current.column === descriptor.column
        && current.direction === descriptor.direction
      ) {
        return current;
      }

      return descriptor;
    });
  }, []);

  const { fetchProductDateStats, fetchProductStats } = useReportProductStatsFetchers<
    ProductStats,
    ProductDateStats,
    ProductStatsResponse["metadata"],
    ProductDateStatsResponse["product"],
    { data: ProductStats[]; totalOrders: number; ordersWithMonolithicSetsCount: number; timestamp: number }
  >({
    apiCall,
    buildProductStatsUrl,
    buildDateStatsUrl,
    cache,
    cacheDuration: CACHE_DURATION,
    dateRange,
    dateStatsErrorMessage: 'Помилка завантаження статистики відвантажень по датах:',
    getCacheKey: buildShipmentCacheKey,
    markCacheUpdated,
    onDateStatsSuccess: handleDateStatsSuccess,
    onProductStatsCacheHit: handleProductStatsCacheHit,
    onProductStatsNetworkSuccess: handleProductStatsNetworkSuccess,
    productStatsErrorMessage: 'Помилка завантаження статистики відвантажень:',
    selectedProduct,
    setCacheEntry,
    setLoading,
    statusFilter,
    toCacheEntry: (validatedData, metadata, timestamp) => ({
      data: validatedData,
      totalOrders: metadata.totalOrders,
      ordersWithMonolithicSetsCount: metadata.ordersWithMonolithicSetsCount,
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
    consoleErrorLabel: "Помилка очищення серверного кешу статистики відвантажень:",
  });

  // Функція для завантаження замовлень конкретного товару
  // source визначає, з якої таблиці відбувся клік, щоб встановити дефолтний таб:
  //   "regular"    — клік з «Звичайні порції» або з режиму дат
  //   "monolithic" — клік з «Монолітні набори»
  const fetchOrdersForProduct = useCallback(async (
    sku: string,
    name: string,
    date?: string,
    source: ShipmentOrdersTabKey = "regular",
  ) => {
    setSelectedProductForModal({ name, sku });
    setModalDefaultTab(source);
    setIsOrdersModalOpen(true);
    setModalLoading(true);
    setModalOrders([]);
    setModalMonolithicOrders([]);

    try {
      const params = new URLSearchParams();
      params.append("sku", sku);
      params.append("shippedOnly", "true");

      if (statusFilter === "all") {
        ["1","2","3","4","5","6","7"].forEach(status => {
          params.append("status", status);
        });
      } else {
        params.append("status", statusFilter);
      }

      if (date) {
        // Якщо передана конкретна дата (з режиму "dates")
        params.append("startDate", date);
        params.append("endDate", date);
      } else if (dateRange?.start && dateRange?.end) {
        // Інакше використовуємо загальний діапазон
        const startDate = toShipmentApiDateValue(dateRange.start);
        const endDate = toShipmentApiDateValue(dateRange.end);
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const response = await apiCall(`/api/orders/products/orders?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        // regularOrders — звичайні порції (data.data)
        setModalOrders(data.data ?? []);
        // monolithicOrders — замовлення, де товар був компонентом монолітного набору
        setModalMonolithicOrders(data.monolithicOrders ?? []);
      }
    } catch (error) {
      console.error('Помилка завантаження замовлень для товару:', error);
      ToastService.show({
        title: "Помилка",
        description: "Не вдалося завантажити список замовлень.",
        color: "danger",
        icon: "triangle-alert",
      });
    } finally {
      setModalLoading(false);
    }
  }, [statusFilter, dateRange, apiCall]);

  // Обгортка для кнопки оновлення даних
  const handleRefreshData = useCallback(() => {
    // Очищаємо кеш для поточних фільтрів
    const cacheKey = buildShipmentCacheKey(statusFilter, dateRange);
    invalidateCacheKey(cacheKey);

    if (viewMode === "dates" && selectedProduct) {
      fetchProductDateStats(true).catch(console.error);
    } else {
      fetchProductStats(true).catch(console.error);
    }
  }, [fetchProductStats, fetchProductDateStats, statusFilter, dateRange, viewMode, selectedProduct, invalidateCacheKey]);

  const handleSortChange = useCallback((descriptor: ShipmentSortDescriptor) => {
    setDateSortDescriptor((current) => {
      if (
        current.column === descriptor.column
        && current.direction === descriptor.direction
      ) {
        return current;
      }

      return descriptor;
    });
  }, []);

  // Попередньо встановлені діапазони дат
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const maxDate = useMemo(() => today(getLocalTimeZone()), []);
  const isSingleDate = Boolean(
    dateRange?.start
    && dateRange?.end
    && (dateRange.start as CalendarDate).compare(dateRange.end as CalendarDate) === 0,
  );

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
    setDateRange(getDefaultShipmentDateRange());
    setDatePresetKey(SHIPMENT_DEFAULT_PRESET_KEY);
    setSelectedProduct("");
    setViewMode("products");
    setDateStats([]);
    setSelectedProductInfo(null);
    clearCache(); // Очищаємо весь кеш при скиданні фільтрів
  }, [clearCache]);

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
    if (viewMode !== "dates") {
      return;
    }

    if (sortableColumnKeys.includes(dateSortDescriptor.column)) {
      return;
    }

    const fallbackColumn = "orderedQuantity";

    setDateSortDescriptor((current) => {
      if (current.column === fallbackColumn) {
        return current;
      }

      return {
        column: fallbackColumn,
        direction: current.direction,
      };
    });
  }, [sortableColumnKeys, dateSortDescriptor.column, viewMode]);

  // Сортування даних
  const sortedItems = useMemo(() => {
    return sortReportItems({
      dateItems: dateStats,
      productItems: productStats,
      sortDescriptor: dateSortDescriptor,
      viewMode,
    });
  }, [productStats, dateStats, dateSortDescriptor, viewMode]);

  const monolithicSetStats = useMemo(
    () => productStats.filter((item) => item.isMonolithicSet),
    [productStats],
  );

  const regularProductStats = useMemo(
    () => productStats.filter((item) => !item.isMonolithicSet),
    [productStats],
  );

  const sortedMonolithicSetStats = useMemo(
    () => sortReportItems({
      dateItems: dateStats,
      productItems: monolithicSetStats,
      sortDescriptor: monolithicSortDescriptor,
      viewMode: "products",
    }) as ProductStats[],
    [dateStats, monolithicSetStats, monolithicSortDescriptor],
  );

  const sortedRegularProductStats = useMemo(
    () => sortReportItems({
      dateItems: dateStats,
      productItems: regularProductStats,
      sortDescriptor: regularSortDescriptor,
      viewMode: "products",
    }) as ProductStats[],
    [dateStats, regularProductStats, regularSortDescriptor],
  );

  const monolithicSetQuantities = useMemo(
    () => sortedMonolithicSetStats.map((item) => item.orderedQuantity),
    [sortedMonolithicSetStats],
  );

  const regularProductQuantities = useMemo(
    () => sortedRegularProductStats.map((item) => item.orderedQuantity),
    [sortedRegularProductStats],
  );

  const monolithicSetPortionsTotal = useMemo(
    () => monolithicSetStats.reduce((sum, item) => sum + getItemPortions(item), 0),
    [monolithicSetStats],
  );

  const regularProductTotal = useMemo(
    () => regularProductStats.reduce((sum, item) => sum + item.orderedQuantity, 0),
    [regularProductStats],
  );

  // Отримання всіх значень для кожного стовпця
  const getAllOrderedQuantities = useMemo(
    () => getOrderedQuantityValues(viewMode, dateStats, productStats),
    [productStats, dateStats, viewMode],
  );

  // Розрахунок підсумкових значень
  const totals = useMemo(() => {
    if (viewMode === "dates") {
      return {
        orderedQuantity: getOrderedQuantityTotal(viewMode, dateStats, productStats),
      };
    } else {
      return {
        orderedQuantity: getOrderedQuantityTotal(viewMode, dateStats, productStats),
      };
    }
  }, [productStats, dateStats, viewMode]);

  const renderProductStatsTable = useCallback((
    items: ProductStats[],
    orderedQuantities: number[],
    emptyMessage: string,
    title: string,
    itemLabel: string,
    quantityLabel: string,
    footerLabel: string,
    totalPortions?: number,
    sortDescriptor?: ShipmentSortDescriptor,
    onSortChange?: (descriptor: ShipmentSortDescriptor) => void,
    source: ShipmentOrdersTabKey = "regular",
  ) => {
    const totalOrderedQuantity = items.reduce((sum, item) => sum + item.orderedQuantity, 0);

    // Для таблиці "Монолітні набори" колонку "Порції" показуємо як "Кіл-ть наборів"
    const renderedColumns = title === "Монолітні набори"
      ? columns.map((column) =>
          column.key === "orderedQuantity"
            ? { ...column, label: "Кіл-ть наборів" }
            : column,
        )
      : columns;

    return (
      <div className="relative mt-10">
        <div className="mb-0 flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-default-500">
            {title}
          </div>
          <div className="text-sm text-default-500">
            {items.length} {itemLabel} • {totalOrderedQuantity} {quantityLabel}
            {totalPortions !== undefined ? ` • ${totalPortions} порцій` : ''}
          </div>
        </div>
        <Table
          aria-label={title}
          sortDescriptor={sortDescriptor}
          onSortChange={onSortChange ? (descriptor) => onSortChange(descriptor as ShipmentSortDescriptor) : undefined}
          classNames={{
            wrapper: "min-h-72 px-0 shadow-none",
            th: "bg-default-200/60 first:rounded-s-sm last:rounded-e-sm",
            td: [
              "py-2 text-default-700 cursor-pointer",
              "[&>*]:z-1 [&>*]:relative",
              "before:pointer-events-none before:content-[''] before:absolute before:z-0 before:inset-0 before:opacity-0 before:bg-default/40",
              "group-hover/tr:before:opacity-40",
              "first:before:rounded-s-sm last:before:rounded-e-sm",
            ],
          }}
        >
          <TableHeader>
            {renderedColumns.map((column) => (
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
            items={items as any}
            emptyContent={
              <ReportTableEmptyState
                loading={loading}
                emptyMessage={emptyMessage}
              />
            }
            isLoading={loading}
          >
            {(item) => {
              const productItem = item as ProductStats;
              return (
                <TableRow
                  key={productItem.sku}
                  onClick={() => fetchOrdersForProduct(productItem.sku, productItem.name, undefined, source)}
                >
                  <TableCell className="font-medium text-base">
                    <div className="flex items-center gap-2">
                      {productItem.name}
                      {productItem.isMonolithicSet ? (
                        <Chip size="sm" variant="flat" color="warning" className="shrink-0">
                          Монолітний набір
                        </Chip>
                      ) : productItem.isSet ? (
                        <Chip size="sm" variant="flat" color="default" className="shrink-0">
                          Набір
                        </Chip>
                      ) : null}
                      <DynamicIcon name="external-link" size={14} className="text-neutral-300" />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-base">
                    <Button
                      size="sm"
                      variant="light"
                      className="font-mono text-base h-auto p-1 min-w-0 text-blue-600 hover:bg-blue-50"
                      onPress={() => {
                        handleProductChange(productItem.sku);
                      }}
                    >
                      {productItem.sku}
                    </Button>
                  </TableCell>
                  <TableCell className="text-center text-base">
                    <Chip
                      size="md"
                      variant="flat"
                      classNames={{
                        base: getValueColor(productItem.orderedQuantity, orderedQuantities).base,
                        content: getValueColor(productItem.orderedQuantity, orderedQuantities).content,
                      }}
                    >
                      {productItem.orderedQuantity}
                    </Chip>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
        <div className="border-t-1 border-gray-200 py-2">
          <div className="flex items-center justify-between">
            <div className="font-bold text-gray-800 pl-3">
              {footerLabel}
            </div>
            <div className="text-center font-bold text-gray-800 min-w-[100px] w-3/16">
              {totalOrderedQuantity}
            </div>
          </div>
        </div>
      </div>
    );
  }, [columns, fetchOrdersForProduct, handleProductChange, loading]);

  useEffect(() => {
    if (viewMode !== "products") {
      return;
    }

    syncSummary(productStats, totalOrders, ordersWithMonolithicSetsCount);
  }, [productStats, totalOrders, ordersWithMonolithicSetsCount, syncSummary, viewMode]);

  const filters = useMemo<ReportFilterConfig[]>(() => {
    const extraFilters: ReportFilterConfig[] = [];

    if (isSingleDate) {
      extraFilters.push(createSingleDateFilterConfig({
        value: dateRange?.start ?? null,
        onChange: (value) => {
          if (!value) {
            return;
          }

          const nextDate = value as CalendarDate;
          setDateRange({ start: nextDate, end: nextDate });
          setDatePresetKey(getPresetKeyForShipmentDate(nextDate));
        },
        maxValue: maxDate,
        className: "w-auto",
        triggerClassName: "h-10 rounded-none",
        previousButtonClassName: "h-10 rounded-r-none border-r-0",
        nextButtonClassName: "h-10 rounded-l-none border-l-0",
      }));
    } else {
      extraFilters.push(createDateRangeFilterConfig({
        value: dateRange,
        onChange: (value) => {
          setDateRange(value);
          setDatePresetKey(null);
        },
        maxValue: maxDate,
        className: "flex-1",
        inputWrapperClassName: "h-10",
      }));
    }

    return createProductToolbarFilterConfigs({
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
      statusOptions,
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
      periodPresetOptions: [
        ...datePresets,
        ...(datePresetKey === "custom" ? [{ key: "custom", label: "Обрана дата" }] : []),
      ],
      loading,
      productClassName: "flex-1 max-w-70",
      productBaseClassName: "max-w-70",
      productTriggerClassName: "h-10",
      statusClassName: "max-w-50",
      statusTriggerClassName: "h-10",
      periodClassName: "max-w-50 ml-auto",
      periodTriggerClassName: "h-10",
      periodIconName: "calendar-check",
      extraFilters,
      includeReset: false,
    }).concat(
      createResetFilterConfig({
        onPress: resetFilters,
        disabled: loading,
      }),
    );
  }, [
    datePresetKey,
    datePresets,
    dateRange,
    handleProductChange,
    isSingleDate,
    loading,
    maxDate,
    productStats,
    resetFilters,
    selectedProduct,
    statusFilter,
    statusOptions,
  ]);

  return (
    <div className={`${className}`}>
      {/* Фільтри */}
      <ReportsFilterBuilder filters={filters} />

      <ReportCacheProgressCard progress={cacheProgress} />

      {/* Таблиця */}
      <div className="relative">
        {viewMode === "dates" ? (
          <Table
            aria-label="Статистика відвантажених товарів"
            sortDescriptor={dateSortDescriptor}
            onSortChange={(descriptor) =>
              handleSortChange(descriptor as ShipmentSortDescriptor)
            }
            classNames={{
              wrapper: "min-h-128 px-0 shadow-none",
              th: "bg-default-200/60 first:rounded-s-sm last:rounded-e-sm",
              td: [
                "py-2 text-default-700 cursor-pointer",
                "[&>*]:z-1 [&>*]:relative",
                "before:pointer-events-none before:content-[''] before:absolute before:z-0 before:inset-0 before:opacity-0 before:bg-default/40",
                "group-hover/tr:before:opacity-40",
                "first:before:rounded-s-sm last:before:rounded-e-sm",
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
                  emptyMessage="Немає даних по датах для цього товару"
                />
              }
              isLoading={loading}
            >
              {(item) => {
                const dateItem = item as ProductDateStats;
                return (
                  <TableRow 
                    key={`${selectedProductInfo?.sku || ''}-${dateItem.date}`} 
                    onClick={() => fetchOrdersForProduct(selectedProductInfo?.sku || '', selectedProductInfo?.name || '', dateItem.date)}
                  >
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
                  </TableRow>
                );
              }}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col gap-6">
            {monolithicSetStats.length > 0 ? renderProductStatsTable(
              sortedMonolithicSetStats,
              monolithicSetQuantities,
              "Немає монолітних наборів у вибірці",
              "Монолітні набори",
              "позицій",
              "наборів",
              `Знайдено ${sortedMonolithicSetStats.length} унікальних наборів`,
              monolithicSetPortionsTotal,
              monolithicSortDescriptor,
              handleMonolithicSortChange,
              "monolithic",
            ) : null}

            {renderProductStatsTable(
              sortedRegularProductStats,
              regularProductQuantities,
              "Немає звичайних порцій у вибірці",
              "Звичайні порції",
              "позицій",
              "порцій",
              `Знайдено ${sortedRegularProductStats.length} унікальних товарів`,
              undefined,
              regularSortDescriptor,
              handleRegularSortChange,
            )}
          </div>
        )}

        {/* Підсумковий рядок */}
        {viewMode === "dates" && dateStats.length > 0 && (
          <div className="border-t-1 border-gray-200 py-2">
            <div className="flex items-center justify-between">
              <div className={`font-bold text-gray-800 ${viewMode === "dates" ? "w-12/16" : "w-13/16"} pl-3`}>
                {viewMode === "dates"
                  ? `Знайдено ${dateStats.length} днів для товару ${selectedProductInfo?.name || selectedProduct}`
                  : `Знайдено ${productStats.length} унікальних товарів`
                }
              </div>
              <div className={`text-center font-bold text-gray-800 min-w-[100px] ${viewMode === "dates" ? "w-4/16" : "w-3/16"}`}>
                {totals.orderedQuantity}
              </div>
            </div>
          </div>
        )}

        {/* Напівпрозорий бекдроп лоадера з анімацією */}
        <ReportLoadingOverlay
          loading={loading}
          message="Завантаження відвантажень..."
        />
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

      <ShipmentOrdersModal
        isOpen={isOrdersModalOpen}
        onOpenChange={setIsOrdersModalOpen}
        isLoading={modalLoading}
        orders={modalOrders}
        monolithicOrders={modalMonolithicOrders}
        defaultTab={modalDefaultTab}
        useMonolithicModal={modalDefaultTab === "monolithic"}
        product={selectedProductForModal}
      />
    </div>
  );
}
