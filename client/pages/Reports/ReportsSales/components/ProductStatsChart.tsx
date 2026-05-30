import { useState, useEffect, useMemo, useCallback, useRef } from "react";

import {
  Card,
  CardBody,
  CardHeader,
  CardFooter,
} from "@heroui/react";
import { useApi } from "@/hooks/useApi";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { createStandardDatePresets, convertCalendarRangeToReportingRange } from "@/lib/dateReportingUtils";
import {
  CacheRefreshConfirmModal,
  CachePeriodSelectModal,
} from "@/components/modals/CacheRefreshConfirmModal";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ReportCacheProgressCard } from "../../shared/ReportCacheProgressCard";
import { ReportLoadingOverlay } from "../../shared/ReportLoadingOverlay";
import { ReportRefreshCacheActions } from "../../shared/ReportRefreshCacheActions";
import useReportStatsCacheClear from "../../shared/useReportStatsCacheClear";
import useReportCacheValidation from "../../shared/useReportCacheValidation";
import useReportClientCache from "../../shared/useReportClientCache";
import useReportingDayStartHour from "../../shared/useReportingDayStartHour";
import type {
  ProductChartGroupBy,
  ProductStatsAvailableSeries,
  ProductStats,
  ProductStatsChartProps,
  ProductStatsResponse,
  ProductStatsSortDescriptor,
} from "../ReportsSalesTypes";
import {
  buildProductStatsCacheKey,
  buildProductStatsChartCacheKey,
  PRODUCT_CHART_GROUP_BY_OPTIONS,
} from "../ReportsSalesUtils";
import { ProductStatsChartFilters } from "./ProductStatsChartFilters";
import { ProductStatsChartTooltip } from "./ProductStatsChartTooltip";

type ChartDataPoint = Record<string, string | number>;

type ProductStatsCacheEntry = {
  data: unknown;
  timestamp: number;
  availableSeries?: ProductStatsAvailableSeries;
};

function buildFallbackAvailableSeries(products: ProductStats[]): ProductStatsAvailableSeries {
  const categories = new Map<string, { categoryId: number | null; label: string; count: number }>();

  products.forEach((product) => {
    if (!product.categoryKey || !product.categoryName) {
      return;
    }

    const current = categories.get(product.categoryKey) ?? {
      categoryId: product.categoryId ?? null,
      label: product.categoryName,
      count: 0,
    };

    current.count += 1;
    categories.set(product.categoryKey, current);
  });

  return {
    default: {
      key: "all_categories",
      label: "Всі категорії",
    },
    categories: Array.from(categories.entries())
      .map(([key, value]) => ({
        key,
        categoryId: value.categoryId,
        label: value.label,
        count: value.count,
      }))
      .sort((first, second) => first.label.localeCompare(second.label, "uk-UA")),
  };
}

function normalizeSelectedSeries(keys: Iterable<string>): Set<string> {
  return new Set(Array.from(keys).filter((key) => key.startsWith("category_")));
}

export default function ProductStatsChart({ className }: ProductStatsChartProps) {
  const { isAdmin } = useRoleAccess();
  const { apiCall } = useApi();
  const { dayStartHour } = useReportingDayStartHour();
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [availableSeries, setAvailableSeries] = useState<ProductStatsAvailableSeries | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<ProductStatsSortDescriptor>({
    column: "orderedQuantity",
    direction: "descending"
  });

  // Фільтри

  // Використовуємо централізовані preset'и дат
  const datePresets = createStandardDatePresets();

  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("last30Days");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const preset = datePresets.find(p => p.key === "last30Days");
    return preset ? preset.getRange() : null;
  });

  // Фільтр за категоріями (множинний вибір)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());



  // Групування даних
  const [groupBy, setGroupBy] = useState<ProductChartGroupBy>("day");
  const [dataAvailability, setDataAvailability] = useState<{
    hasData: boolean;
    message: string;
    periodInfo: string;
  }>({ hasData: false, message: '', periodInfo: '' });
  const { cache, clearCache, invalidateCacheKey, setCacheEntry } = useReportClientCache<ProductStatsCacheEntry>();

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
      await fetchProductStats(true);
      if (dateRange?.start && dateRange?.end) {
        await fetchChartData(true);
      }
    },
    consoleErrorLabel: "Помилка валідації кешу статистики графіка:",
    buildRangeParams: (range) => {
      const reportingDates = convertCalendarRangeToReportingRange(range, dayStartHour);
      return {
        startDate: reportingDates.startDate,
        endDate: reportingDates.endDate,
      };
    },
  });

  const { clearStatsCacheLoading, handleClearStatsCache } = useReportStatsCacheClear({
    apiCall,
    onCacheCleared: async () => {
      clearCache();
      await fetchProductStats(true);
      if (dateRange?.start && dateRange?.end) {
        await fetchChartData(true);
      }
    },
    consoleErrorLabel: "Помилка очищення серверного кешу статистики графіка:",
  });

  const CACHE_DURATION = 30000; // 30 секунд кешування на клієнті

  // Завантаження даних для графіка
  const firstLoadRef = useRef(true);
  const fetchChartData = useCallback(async (force?: boolean) => {
    if (!dateRange?.start || !dateRange?.end) {
      setChartData([]);
      return;
    }

    // Невелика затримка перед першим fetch, щоб уникнути race condition
    if (firstLoadRef.current) {
      await new Promise(res => setTimeout(res, 30));
      firstLoadRef.current = false;
    }

    // Створюємо ключ кеша на основі фільтрів
    const cacheKey = buildProductStatsChartCacheKey(statusFilter, dateRange, groupBy, selectedProducts);

    const now = Date.now();

    // Перевіряємо клієнтський кеш для поточних фільтрів
    if (!force && cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      setChartData((cache[cacheKey].data as ChartDataPoint[]) ?? []);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      // Конвертуємо CalendarDate діапазон в звітні дати з урахуванням dayStartHour
      const reportingDates = convertCalendarRangeToReportingRange({ start: dateRange.start, end: dateRange.end }, dayStartHour);
      params.append("startDate", reportingDates.startDate);
      params.append("endDate", reportingDates.endDate);
      params.append("groupBy", groupBy);

      // Додаємо вибрані товари
      if (selectedProducts.size > 0) {
        const selectedSKUs = Array.from(selectedProducts);
        selectedSKUs.forEach(sku => {
          params.append("products", sku);
        });
      }

      const queryString = params.toString();
      const url = `/api/orders/products/chart?${queryString}`;

      const response = await apiCall(url);
      const data = await response.json();

      if (data.success) {
        const validatedData = Array.isArray(data.data) ? (data.data as ChartDataPoint[]) : [];

        setChartData(validatedData);

        // Зберігаємо в клієнтський кеш
        setCacheEntry(cacheKey, { data: validatedData, timestamp: now });

        // Оновлюємо час останнього оновлення кешу
        markCacheUpdated();
      } else {
        console.error('Помилка API графіка статистики:', data.error);
        setChartData([]);
      }
    } catch (error) {
      console.error('Помилка завантаження даних графіка:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange?.start, dateRange?.end, groupBy, selectedProducts, apiCall, dayStartHour]);

  // Завантаження статистики товарів для фільтрів
  const firstProductStatsLoadRef = useRef(true);
  const fetchProductStats = useCallback(async (force?: boolean) => {
    // Невелика затримка перед першим запитом, щоб уникнути race condition
    if (firstProductStatsLoadRef.current) {
      await new Promise(res => setTimeout(res, 30));
      firstProductStatsLoadRef.current = false;
    }
    // Створюємо ключ кешу на основі фільтрів
    const cacheKey = buildProductStatsCacheKey(statusFilter, dateRange);

    const now = Date.now();

    // Перевіряємо клієнтський кеш для поточних фільтрів
    if (!force && cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      const cachedEntry = cache[cacheKey];
      const cachedProducts = Array.isArray(cachedEntry.data) ? (cachedEntry.data as ProductStats[]) : [];

      setProductStats(cachedProducts);
      setAvailableSeries(cachedEntry.availableSeries ?? buildFallbackAvailableSeries(cachedProducts));
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      if (dateRange?.start && dateRange?.end) {
        // Конвертуємо CalendarDate діапазон в звітні дати з урахуванням dayStartHour
        const reportingDates = convertCalendarRangeToReportingRange(dateRange, dayStartHour);
        params.append("startDate", reportingDates.startDate);
        params.append("endDate", reportingDates.endDate);
      }

      const queryString = params.toString();
      const url = queryString ? `/api/orders/products/stats?${queryString}` : `/api/orders/products/stats`;

      const response = await apiCall(url);
      const data: ProductStatsResponse = await response.json();

      if (data.success) {
        // Валідація даних
        const validatedData = Array.isArray(data.data) ? data.data : [];
        const nextAvailableSeries = data.metadata?.availableSeries ?? buildFallbackAvailableSeries(validatedData);

        setProductStats(validatedData);
        setAvailableSeries(nextAvailableSeries);

        // Зберігаємо в клієнтський кеш
        setCacheEntry(cacheKey, {
          data: validatedData,
          timestamp: now,
          availableSeries: nextAvailableSeries,
        });

        // Оновлюємо час останнього оновлення кешу
        markCacheUpdated();
      }
    } catch (error) {
      console.error('Помилка завантаження статистики товарів для графіка:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange?.start, dateRange?.end, cache, CACHE_DURATION, dayStartHour, setCacheEntry, markCacheUpdated]);

  // Обгортка для кнопки оновлення даних
  const handleRefreshData = useCallback(() => {
    // Очищаємо кеш для поточних фільтрів
    const productCacheKey = buildProductStatsCacheKey(statusFilter, dateRange);
    const chartCacheKey = buildProductStatsChartCacheKey(statusFilter, dateRange, groupBy, selectedProducts);

    invalidateCacheKey(productCacheKey);
    invalidateCacheKey(chartCacheKey);

    // Оновлюємо і статистику товарів, і дані графіка
    fetchProductStats(true).catch(console.error);
    if (dateRange?.start && dateRange?.end) {
      fetchChartData(true).catch(console.error);
    }
  }, [fetchProductStats, fetchChartData, statusFilter, dateRange, groupBy, selectedProducts, invalidateCacheKey]);

  // Функція скидання фільтрів
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setDatePresetKey("last30Days");
    const preset = datePresets.find(p => p.key === "last30Days");
    if (preset) setDateRange(preset.getRange());
    setSelectedProducts(new Set());
    setGroupBy("day");
    clearCache();
  }, [clearCache, datePresets]);

  // Завантаження даних при зміні фільтрів
  useEffect(() => {
    fetchProductStats();
  }, [fetchProductStats]);

  // Завантаження даних графіка при зміні параметрів
  useEffect(() => {
    if (dateRange?.start && dateRange?.end) {
      fetchChartData();
    } else {
      setChartData([]);
    }
  }, [fetchChartData, dateRange?.start, dateRange?.end, statusFilter, groupBy, selectedProducts]);

  // Сортування даних
  const sortedItems = useMemo(() => {
    const items = [...productStats];

    items.sort((a, b) => {
      const first = a[sortDescriptor.column as keyof ProductStats];
      const second = b[sortDescriptor.column as keyof ProductStats];

      let cmp = 0;

      if (sortDescriptor.column === "totalStock") {
        // Для загальної кількості на складах
        const firstTotal = Object.values(a.stockBalances).reduce((sum, balance) => sum + balance, 0);
        const secondTotal = Object.values(b.stockBalances).reduce((sum, balance) => sum + balance, 0);
        cmp = firstTotal - secondTotal;
      } else if (typeof first === "string" && typeof second === "string") {
        cmp = first.localeCompare(second);
      } else if (typeof first === "number" && typeof second === "number") {
        cmp = first - second;
      }

      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });

    return items;
  }, [productStats, sortDescriptor]);

  const allFilterOptions = useMemo(() => {
    const options: Array<{
      key: string;
      label: string;
      kind: "header" | "category";
    }> = [];

    if (availableSeries?.categories.length) {
      options.push({
        key: "header_categories",
        label: "Категорії",
        kind: "header",
      });

      availableSeries.categories.forEach((category) => {
        options.push({
          key: category.key,
          label: `${category.label} (${category.count})`,
          kind: "category",
        });
      });
    }

    return options;
  }, [availableSeries]);

  // Загальна кількість товарів для placeholder
  const totalProductsCount = useMemo(() => {
    return sortedItems.length;
  }, [sortedItems]);

  // Розрахунок кількості серій у вибраних фільтрах
  const selectedProductsCount = useMemo(() => {
    return selectedProducts.size;
  }, [selectedProducts]);

  const selectionSummary = useMemo(() => {
    if (selectedProducts.size === 0) {
      return "Порції, середній чек та замовлення";
    }

    return selectedProducts.size === 1 ? "Агрегована лінія категорії" : "Порівняння категорій";
  }, [selectedProducts]);

  const renderedLineKeys = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    return Object.keys(chartData[0]).filter((key) => {
      if (key.endsWith("_name")) {
        return false;
      }

      return key === "ordersCount" || key === "portionsCount" || key === "averageCheck" || key.startsWith("category_");
    });
  }, [chartData]);

  useEffect(() => {
    const validKeys = new Set(allFilterOptions.filter((item) => item.kind !== "header").map((item) => item.key));

    setSelectedProducts((current) => {
      const next = normalizeSelectedSeries(Array.from(current).filter((key) => validKeys.has(key)));

      if (next.size === current.size && Array.from(next).every((key) => current.has(key))) {
        return current;
      }

      return next;
    });
  }, [allFilterOptions]);

  // Оновлюємо стан доступності даних
  useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) {
      setDataAvailability({
        hasData: false,
        message: 'Оберіть період для відображення графіка',
        periodInfo: 'Період не вибрано'
      });
    } else if (chartData.length === 0) {
      setDataAvailability({
        hasData: false,
        message: `За період ${dateRange.start.day.toString().padStart(2, '0')}.${dateRange.start.month.toString().padStart(2, '0')} - ${dateRange.end.day.toString().padStart(2, '0')}.${dateRange.end.month.toString().padStart(2, '0')} немає даних про продажі`,
        periodInfo: 'Дані відсутні'
      });
    } else {
      setDataAvailability({
        hasData: true,
        message: `Дані за ${dateRange.start.day.toString().padStart(2, '0')}.${dateRange.start.month.toString().padStart(2, '0')} - ${dateRange.end.day.toString().padStart(2, '0')}.${dateRange.end.month.toString().padStart(2, '0')}`,
        periodInfo: `${chartData.length} точок`
      });
    }
  }, [chartData, dateRange]);

  // Кольори для ліній графіка
  const colors = [
    "hsl(210, 70%, 50%)", // Синій
    "hsl(142, 70%, 45%)", // Зелений
    "hsl(25, 85%, 55%)",  // Помаранчевий
    "hsl(162, 70%, 45%)", // Салатовий
    "hsl(270, 70%, 50%)", // Пурпуровий
    "hsl(300, 70%, 50%)", // Рожевий
    "hsl(330, 70%, 50%)", // Червоний
    "hsl(45, 85%, 55%)",  // Жовтий
    "hsl(195, 70%, 50%)", // Блакитний
  ];

  // Опції групування
  const groupByOptions = PRODUCT_CHART_GROUP_BY_OPTIONS;

  // Опції сортування для графіка
  const sortOptions = [
    { key: "orderedQuantity", label: "За порціями" },
    { key: "totalStock", label: "За залишками" },
    { key: "name", label: "За назвою" },
    { key: "sku", label: "За SKU" },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <ProductStatsChartFilters
        loading={loading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        datePresetKey={datePresetKey}
        datePresets={datePresets}
        onDatePresetChange={(selectedKey) => {
          if (!selectedKey) {
            return;
          }
          setDatePresetKey(selectedKey);
          const preset = datePresets.find((item) => item.key === selectedKey);
          if (preset) {
            setDateRange(preset.getRange());
          }
        }}
        dateRange={dateRange}
        onDateRangeChange={(value) => {
          setDateRange(value);
          setDatePresetKey(null);
        }}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        selectedProducts={selectedProducts}
        onSelectedProductsChange={(value) => {
          setSelectedProducts(normalizeSelectedSeries(value));
        }}
        totalProductsCount={totalProductsCount}
        selectedProductsCount={selectedProductsCount}
        allFilterOptions={allFilterOptions}
        sortDescriptor={sortDescriptor}
        onSortDescriptorChange={setSortDescriptor}
        sortOptions={sortOptions}
        onReset={resetFilters}
      />

      <ReportCacheProgressCard progress={cacheProgress} />

      {/* Графік */}
      <Card className="min-h-128">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {chartData.length > 0
                  ? `${dataAvailability.periodInfo} • ${selectionSummary} • Групування: ${groupByOptions.find(opt => opt.key === groupBy)?.label}`
                  : dataAvailability.hasData === false && dataAvailability.message
                    ? dataAvailability.message
                    : 'Оберіть період для відображення графіка'
                }
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DynamicIcon name="trending-up" size={16} />
              <span>{selectionSummary}</span>
            </div>
          </div>
        </CardHeader>
        <CardBody className="relative">
          {productStats.length === 0 && !loading ? (
            <div className="flex items-center justify-center py-16 h-96 text-gray-500">
              <div className="text-center">
                <DynamicIcon
                  name="area-chart"
                  size={64}
                  className="text-gray-300 mx-auto mb-4"
                />
                <span className="text-lg">Немає даних для відображення</span>
              </div>
            </div>
          ) : (
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <defs>
                    {colors.map((color, index) => (
                      <linearGradient key={index} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="portions"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="orders"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ProductStatsChartTooltip />} />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                  />
                  {renderedLineKeys.map((lineKey, index) => {
                    const lineName = String(chartData[0]?.[`${lineKey}_name`] || lineKey);
                    const color = lineKey === "ordersCount"
                      ? "hsl(142, 70%, 45%)"
                      : lineKey === "averageCheck"
                        ? "hsl(25, 85%, 55%)"
                      : lineKey === "portionsCount"
                        ? "hsl(210, 70%, 50%)"
                        : colors[index % colors.length];

                    return (
                      <Area
                        key={lineKey}
                        type="monotone"
                        dataKey={lineKey}
                        yAxisId={lineKey === "ordersCount" ? "orders" : "portions"}
                        stroke={color}
                        fill="none"
                        strokeWidth={lineKey === "ordersCount" || lineKey === "portionsCount" || lineKey === "averageCheck" ? 3 : 2}
                        name={lineName.length > 28 ? `${lineName.slice(0, 28)}...` : lineName}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <ReportLoadingOverlay loading={loading} className="rounded-lg" />
        </CardBody>
        <CardFooter className="pt-2">
          <div className="flex items-center justify-between w-full text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>
                {dateRange?.start && dateRange?.end
                  ? `Період: ${dateRange.start.day}.${dateRange.start.month} - ${dateRange.end.day}.${dateRange.end.month}`
                  : 'Оберіть період для аналізу'
                }
              </span>
              <span>
                {chartData.length > 0 ? `${chartData.length} точок даних` : 'Немає даних'}
              </span>
              <span>
                {chartData.length > 0
                  ? `${renderedLineKeys.length} ліні${renderedLineKeys.length === 1 ? 'я' : renderedLineKeys.length < 5 ? 'ї' : 'й'}`
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>Групування: {groupByOptions.find(opt => opt.key === groupBy)?.label}</span>
              {chartData.length > 0 && (
                <span>
                  Показується: {renderedLineKeys.length} сер{renderedLineKeys.length === 1 ? 'ія' : 'ії'}
                </span>
              )}
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Інформація про результати та кеш із кнопками */}
      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div className="flex items-center gap-4">
          <span className="font-medium">
            Графік: {chartData.length > 0 ? `${chartData.length} точок` : 'Немає даних'}
          </span>
          {chartData.length > 0 && chartData[0] && (
            <span className="text-xs text-gray-500">
              ({`${renderedLineKeys.length} ліні${renderedLineKeys.length === 1 ? 'я' : renderedLineKeys.length < 5 ? 'ї' : 'й'}`})
            </span>
          )}
        </div>
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
