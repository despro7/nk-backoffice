import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Button,
  Select,
  SelectItem,
  DateRangePicker,
  Chip,
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { useApi } from "../hooks/useApi";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusColor, getStatusLabel, ORDER_STATUSES } from "../lib/formatUtils";
import { I18nProvider } from "@react-aria/i18n";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { addToast } from "@heroui/react";

interface SalesData {
  date: string;
  ordersCount: number;
  portionsCount: number;
  ordersByStatus: { [status: string]: number };
  portionsByStatus: { [status: string]: number };
  ordersBySource: { [source: string]: number };
  portionsBySource: { [source: string]: number };
  ordersWithDiscountReason: number;
  portionsWithDiscountReason: number;
  discountReasonText: string;
  orders: Array<{
    orderNumber: string;
    portionsCount: number;
    source: string;
    createdAt: string;
    orderDate: string;
    orderTime: string;
    externalId: string;
    status: string;
  }>;
}

interface SalesReportResponse {
  success: boolean;
  data: SalesData[];
  metadata: {
    source: string;
    filters: {
      status: string;
      dateRange: { startDate: string; endDate: string } | null;
      products: string[];
    };
    totalOrders: number;
    totalPortions: number;
    fetchedAt: string;
  };
}

interface SalesReportTableProps {
  className?: string;
}

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

// Опции товаров (для фильтрации)
const productOptions = [
  { key: "all", label: "Всі товари" },
  { key: "first_courses", label: "Перші страви" },
  { key: "main_courses", label: "Другі страви" },
];

export default function SalesReportTable({ className }: SalesReportTableProps) {
  const { isAdmin } = useRoleAccess();
  const { apiCall } = useApi();
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "date",
    direction: "descending",
  });

  // Модальное окно с деталями
  const [selectedDateDetails, setSelectedDateDetails] =
    useState<SalesData | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Кеширование
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{
    processed: number;
    total: number;
    errors: number;
  } | null>(null);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  // Клиентский кеш по фильтрам
  const [cache, setCache] = useState<
    Record<string, { data: SalesData[]; timestamp: number }>
  >({});
  const CACHE_DURATION = 30000; // 30 секунд кеширования на клиенте

  // Модальное окно выбора периода для обновления кеша
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [cachePeriodRange, setCachePeriodRange] = useState<DateRange | null>(
    null,
  );

  // Предустановленные диапазоны дат
  const getCurrentDate = () => today(getLocalTimeZone());

  const datePresets = [
    {
      key: "today",
      label: "Сьогодні",
      getRange: () => {
        const todayDate = getCurrentDate();
        return { start: todayDate, end: todayDate };
      },
    },
    {
      key: "yesterday",
      label: "Вчора",
      getRange: () => {
        const yesterday = getCurrentDate().subtract({ days: 1 });
        return { start: yesterday, end: yesterday };
      },
    },
    {
      key: "thisWeek",
      label: "Цього тижня",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfWeek = todayDate.subtract({ days: todayDate.day - 1 }); // Понедельник
        return { start: startOfWeek, end: todayDate };
      },
    },
    {
      key: "last7Days",
      label: "Останні 7 днів",
      getRange: () => {
        const todayDate = getCurrentDate();
        const weekAgo = todayDate.subtract({ days: 6 });
        return { start: weekAgo, end: todayDate };
      },
    },
    {
      key: "last14Days",
      label: "Останні 14 днів",
      getRange: () => {
        const todayDate = getCurrentDate();
        const twoWeeksAgo = todayDate.subtract({ days: 13 });
        return { start: twoWeeksAgo, end: todayDate };
      },
    },
    {
      key: "last30Days",
      label: "Останні 30 днів",
      getRange: () => {
        const todayDate = getCurrentDate();
        const twoWeeksAgo = todayDate.subtract({ days: 29 });
        return { start: twoWeeksAgo, end: todayDate };
      },
    },
    {
      key: "thisMonth",
      label: "Цього місяця",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfMonth = todayDate.subtract({ days: todayDate.day - 1 });
        return { start: startOfMonth, end: todayDate };
      },
    },
    {
      key: "lastMonth",
      label: "Минулого місяця",
      getRange: () => {
        const todayDate = getCurrentDate();
        const lastMonth = todayDate.subtract({ months: 1 });
        const startOfLastMonth = lastMonth.subtract({
          days: lastMonth.day - 1,
        });
        // Для последнего дня месяца используем приблизительное значение
        const endOfLastMonth = startOfLastMonth.add({ days: 30 }); // Примерно 30 дней
        return { start: startOfLastMonth, end: endOfLastMonth };
      },
    },
    {
      key: "thisYear",
      label: "Цього року",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfYear = new CalendarDate(todayDate.year, 1, 1);
        return { start: startOfYear, end: todayDate };
      },
    },
    {
      key: "lastYear",
      label: "Минулого року",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfLastYear = new CalendarDate(todayDate.year - 1, 1, 1);
        const endOfLastYear = new CalendarDate(todayDate.year - 1, 12, 31);
        return { start: startOfLastYear, end: endOfLastYear };
      },
    },
  ];

  // Фильтры
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("last7Days");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const preset = datePresets.find((p) => p.key === "last7Days");
    return preset ? preset.getRange() : null;
  });
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set(),
  );

  // Загрузка данных для таблицы
  const fetchSalesData = useCallback(
    async (force?: boolean) => {
      if (!dateRange?.start || !dateRange?.end) {
        setSalesData([]);
        return;
      }

      // Создаем ключ кеша на основе фильтров
      const selectedProductsKey = Array.from(selectedProducts).sort().join(",");
      const cacheKey = `sales_${statusFilter}_${dateRange.start?.toString()}_${dateRange.end?.toString()}_${selectedProductsKey}`;

      const now = Date.now();

      // Проверяем клиентский кеш для текущих фильтров
      if (
        !force &&
        cache[cacheKey] &&
        now - cache[cacheKey].timestamp < CACHE_DURATION
      ) {
        setSalesData(cache[cacheKey].data);
        return;
      }

      setLoading(true);

      try {
        const params = new URLSearchParams();

        if (statusFilter !== "all") {
          params.append("status", statusFilter);
        }

        // Конвертируем CalendarDate в строку YYYY-MM-DD
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, "0")}-${String(dateRange.start.day).padStart(2, "0")}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, "0")}-${String(dateRange.end.day).padStart(2, "0")}`;
        params.append("startDate", startDate);
        params.append("endDate", endDate);

        // Добавляем выбранные товары
        if (selectedProducts.size > 0) {
          const selectedSKUs = Array.from(selectedProducts);
          selectedSKUs.forEach((sku) => {
            params.append("products", sku);
          });
        }

        const queryString = params.toString();
        const url = `/api/orders/sales/report?${queryString}`;

        const response = await apiCall(url);
        const data = await response.json();

        if (data.success) {
          // Валидация данных
          const validatedData = Array.isArray(data.data) ? data.data : [];

          setSalesData(validatedData);

          // Сохраняем в клиентский кеш
          setCache((prev) => ({
            ...prev,
            [cacheKey]: { data: validatedData, timestamp: now },
          }));

          // Обновляем время последнего обновления кеша
          setLastCacheUpdate(new Date());
        } else {
          console.error("❌ Sales report API returned error:", data.error);
          setSalesData([]);
        }
      } catch (error) {
        console.error("❌ Error fetching sales report data:", error);
        setSalesData([]);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, dateRange?.start, dateRange?.end, selectedProducts, apiCall],
  );

  // Обертка для кнопки обновления данных
  const handleRefreshData = useCallback(() => {
    // Очищаем кеш для текущих фильтров
    const selectedProductsKey = Array.from(selectedProducts).sort().join(",");
    const cacheKey = `sales_${statusFilter}_${dateRange?.start?.toString()}_${dateRange?.end?.toString()}_${selectedProductsKey}`;

    setCache((prev) => {
      const newCache = { ...prev };
      delete newCache[cacheKey];
      return newCache;
    });

    // Обновляем данные
    fetchSalesData(true).catch(console.error);
  }, [fetchSalesData, statusFilter, dateRange, selectedProducts]);

  // Функция сброса фильтров
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setDatePresetKey("last7Days");
    const preset = datePresets.find((p) => p.key === "last7Days");
    if (preset) setDateRange(preset.getRange());
    setSelectedProducts(new Set());
    setCache({}); // Очищаем весь кеш при сбросе фильтров
  }, []);

  // Обработчики для dropdown меню обновления кеша
  const handleRefreshAllCache = () => {
    refreshCache("full");
  };

  const handleRefreshPeriodCache = () => {
    setIsPeriodModalOpen(true);
  };

  const handleConfirmPeriodRefresh = async () => {
    if (cachePeriodRange?.start && cachePeriodRange?.end) {
      await refreshCache("period", cachePeriodRange);
      setIsPeriodModalOpen(false);
      setCachePeriodRange(null);
    } else {
      addToast({
        title: "Помилка",
        description: "Будь ласка, оберіть період для оновлення кеша.",
        color: "warning",
        timeout: 5000,
      });
    }
  };

  // Обновление кеша с поддержкой разных режимов
  const refreshCache = async (
    mode: "full" | "period" = "full",
    periodRange?: DateRange | null,
  ) => {
    setCacheLoading(true);
    setCacheProgress(null);

    try {
      // Показываем уведомление о начале
      const modeText = mode === "full" ? "всі записи" : "період";
      addToast({
        title: "Початок оновлення",
        description: `🚀 Початок валідації та оновлення кеша (${modeText}). Використовується новий метод з інтелектуальною перевіркою.`,
        color: "primary",
        timeout: 3000,
      });

      // Подготавливаем параметры для нового endpoint
      const params: any = {
        force: "false", // Принудительное обновление всех записей
        mode: mode, // Режим валидации
      };

      // Если выбран диапазон дат, используем его для фильтрации
      const rangeToUse = periodRange || (mode === "period" ? dateRange : null);
      if (rangeToUse?.start && rangeToUse?.end) {
        params.startDate = `${rangeToUse.start.year}-${String(rangeToUse.start.month).padStart(2, "0")}-${String(rangeToUse.start.day).padStart(2, "0")}`;
        params.endDate = `${rangeToUse.end.year}-${String(rangeToUse.end.month).padStart(2, "0")}-${String(rangeToUse.end.day).padStart(2, "0")}`;
        params.mode = "period";
      }

      // Вызываем новый endpoint валидации кеша
      console.log("🚀 [CLIENT] Sending cache validation request:", params);
      
      // Создаем query параметры из объекта params
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
      
      const response = await apiCall(`/api/orders/cache/validate?${queryParams}`, {
        method: "POST",
        credentials: "include"
      });

      if (response.status === 403) {
        throw new Error(
          "Недостатньо прав доступу. Необхідні права адміністратора.",
        );
      }

      if (!response.ok) {
        throw new Error("Failed to validate cache");
      }

      const result = await response.json();

      if (result.success) {
        // Обновляем время последнего обновления кеша
        setLastCacheUpdate(new Date());

        const stats = result.data.stats;
        const summary = result.data.summary;

        // Показываем детальное уведомление об успешном завершении
        const message =
          `✅ Кеш успішно провалідовано та оновлено!\n\n` +
          `📊 Статистика:\n` +
          `• Оброблено: ${stats.processed} замовлень\n` +
          `• Оновлено: ${stats.updated} замовлень\n` +
          `• Попадань в кеш: ${stats.cacheHits}\n` +
          `• Промахів кеша: ${stats.cacheMisses}\n` +
          `• Застарілих записів: ${stats.cacheStale}\n` +
          `• Помилки: ${stats.errors}\n\n` +
          `⚡ Ефективність: ${summary.cacheHitRate}% попадань в кеш\n` +
          `📦 Пачок: ${summary.batchesProcessed} (по ${summary.batchSize} замовлень)\n` +
          `⏱️ Час: ~${summary.estimatedProcessingTime} сек`;

        addToast({
          title: "Успішно оновлено",
          description: "Кеш статистики успішно провалідовано та оновлено!",
          color: "success",
          timeout: 10000,
        });

        // Очищаем клиентский кеш и обновляем данные
        setCache({});
        await fetchSalesData(true); // force = true для принудительного запроса
      } else {
        throw new Error(result.error || "Cache validation failed");
      }
    } catch (error) {
      console.error("❌ Error validating cache:", error);
      addToast({
        title: "Помилка",
        description: "❌ Помилка при валідації кеша: " + error,
        color: "danger",
        timeout: 7000,
      });
    } finally {
      setCacheLoading(false);
      setCacheProgress(null);
    }
  };

  // Загрузка данных при изменении фильтров
  useEffect(() => {
    if (dateRange?.start && dateRange?.end) {
      fetchSalesData();
    } else {
      setSalesData([]);
    }
  }, [
    fetchSalesData,
    dateRange?.start,
    dateRange?.end,
    statusFilter,
    selectedProducts,
  ]);

  // Инициализация времени последнего обновления
  useEffect(() => {
    if (!lastCacheUpdate) {
      setLastCacheUpdate(new Date());
    }
  }, [lastCacheUpdate]);

  // Сортировка данных
  const sortedItems = useMemo(() => {
    const items = [...salesData];

    items.sort((a, b) => {
      let cmp = 0;

      if (sortDescriptor.column === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortDescriptor.column === "ordersCount") {
        cmp = a.ordersCount - b.ordersCount;
      } else if (sortDescriptor.column === "portionsCount") {
        cmp = a.portionsCount - b.portionsCount;
      }
      // Новые колонки не сортируемые, поэтому оставляем без изменений

      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });

    return items;
  }, [salesData, sortDescriptor]);

  // Расчет итоговых значений
  const totals = useMemo(
    () => ({
      ordersCount: salesData.reduce((sum, item) => sum + item.ordersCount, 0),
      portionsCount: salesData.reduce(
        (sum, item) => sum + item.portionsCount,
        0,
      ),
      sourceWebsite: salesData.reduce(
        (sum, item) => sum + (item.ordersBySource["Сайт"] || 0),
        0,
      ),
      sourceWebsitePortions: salesData.reduce(
        (sum, item) => sum + (item.portionsBySource["Сайт"] || 0),
        0,
      ),
      sourceRozetka: salesData.reduce(
        (sum, item) => sum + (item.ordersBySource["Розетка"] || 0),
        0,
      ),
      sourceRozetkaPortions: salesData.reduce(
        (sum, item) => sum + (item.portionsBySource["Розетка"] || 0),
        0,
      ),
      sourceProm: salesData.reduce(
        (sum, item) => sum + (item.ordersBySource["Пром"] || 0),
        0,
      ),
      sourcePromPortions: salesData.reduce(
        (sum, item) => sum + (item.portionsBySource["Пром"] || 0),
        0,
      ),
      sourceChat: salesData.reduce(
        (sum, item) => sum + (item.ordersBySource["Інше"] || 0),
        0,
      ),
      sourceChatPortions: salesData.reduce(
        (sum, item) => sum + (item.portionsBySource["Інше"] || 0),
        0,
      ),
      discountReason: salesData.reduce(
        (sum, item) => sum + item.ordersWithDiscountReason,
        0,
      ),
      discountReasonPortions: salesData.reduce(
        (sum, item) => sum + item.portionsWithDiscountReason,
        0,
      ),
    }),
    [salesData],
  );

  // Получение статуса по ключу
  // const getStatusLabel = (statusKey: string) => {
  //   const status = statusOptions.find((s) => s.key === statusKey);
  //   return status ? status.label : statusKey;
  // };

  // Обработчик открытия модального окна с деталями
  const handleOpenDetails = (dateData: SalesData) => {
    setSelectedDateDetails(dateData);
    setIsDetailsModalOpen(true);
  };

  // Цветовая градация для значений
  const getValueColor = (value: number, values: number[]) => {
    if (values.length === 0 || value === 0) {
      return {
        base: "bg-transparent",
        content: "text-gray-400 font-medium",
      };
    }

    const min = Math.min(...values.filter((v) => v > 0));
    const max = Math.max(...values);

    if (min === max) {
      return {
        base: "bg-neutral-100/50",
        content: "text-gray-700 font-medium",
      };
    }

    const normalized = (value - min) / (max - min);

    if (normalized < 0.1) {
      return {
        base: "bg-danger/10",
        content: "text-danger font-medium",
      };
    } else if (normalized < 0.35) {
      return {
        base: "bg-yellow-500/10",
        content: "text-yellow-700/80 font-medium",
      };
    } else if (normalized < 0.75) {
      return {
        base: "bg-lime-500/10",
        content: "text-lime-600/80 font-medium",
      };
    } else {
      return {
        base: "bg-lime-500/20",
        content: "text-lime-600 font-medium",
      };
    }
  };

  // Получение всех значений для каждого столбца
  const getAllOrdersCounts = useMemo(
    () => salesData.map((item) => item.ordersCount),
    [salesData],
  );

  const getAllPortionsCounts = useMemo(
    () => salesData.map((item) => item.portionsCount),
    [salesData],
  );

  const getAllSourceWebsiteCounts = useMemo(
    () => salesData.map((item) => item.ordersBySource["Сайт"] || 0),
    [salesData],
  );

  const getAllSourceRozetkaCounts = useMemo(
    () => salesData.map((item) => item.ordersBySource["Розетка"] || 0),
    [salesData],
  );

  const getAllSourcePromCounts = useMemo(
    () => salesData.map((item) => item.ordersBySource["Пром"] || 0),
    [salesData],
  );

  const getAllSourceChatCounts = useMemo(
    () => salesData.map((item) => item.ordersBySource["Інше"] || 0),
    [salesData],
  );

  const getAllDiscountReasonCounts = useMemo(
    () => salesData.map((item) => item.ordersWithDiscountReason),
    [salesData],
  );

  const columns = [
    { key: "date", label: "Дата", sortable: true, className: "w-2/16" },
    {
      key: "ordersCount",
      label: "Замовлення",
      sortable: true,
      className: "w-2/16 text-center",
    },
    {
      key: "portionsCount",
      label: "Порції",
      sortable: true,
      className: "w-2/16 text-center",
    },
    {
      key: "sourceWebsite",
      label: "Сайт",
      sortable: false,
      className: "w-2/16 text-center",
    },
    {
      key: "sourceRozetka",
      label: "Розетка",
      sortable: false,
      className: "w-2/16 text-center",
    },
    {
      key: "sourceProm",
      label: "Пром",
      sortable: false,
      className: "w-2/16 text-center",
    },
    {
      key: "sourceChat",
      label: "Інше",
      sortable: false,
      className: "w-2/16 text-center",
    },
    {
      key: "discountReason",
      label: "Зі знижкою",
      sortable: false,
      className: "w-2/16 text-center",
    },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Фильтры */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1">
          <Select
            aria-label="Статус замовлення"
            placeholder="Всі статуси"
            selectedKeys={statusFilter === "all" ? [] : [statusFilter]}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys);
              const newStatus =
                selected.length > 0 ? (selected[0] as string) : "all";
              setStatusFilter(newStatus);
            }}
            size="md"
            startContent={
              <DynamicIcon name="filter" className="text-gray-400" size={19} />
            }
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2",
            }}
          >
            {ORDER_STATUSES.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        </div>

        <div className="flex-1">
          <Select
            aria-label="Швидкий вибір періоду"
            placeholder="Оберіть період"
            selectedKeys={datePresetKey ? [datePresetKey] : []}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              setDatePresetKey(selectedKey);
              const preset = datePresets.find((p) => p.key === selectedKey);
              if (preset) {
                setDateRange(preset.getRange());
              }
            }}
            size="md"
            startContent={
              <DynamicIcon
                name="calendar"
                className="text-gray-400"
                size={19}
              />
            }
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2",
            }}
          >
            {datePresets.map((preset) => (
              <SelectItem key={preset.key}>{preset.label}</SelectItem>
            ))}
          </Select>
        </div>

        <div className="flex-1">
          <I18nProvider locale="uk-UA">
            <DateRangePicker
              aria-label="Або власний період"
              value={dateRange}
              onChange={(value) => {
                setDateRange(value);
                setDatePresetKey(null);
              }}
              size="md"
              selectorButtonPlacement="start"
              selectorIcon={<DynamicIcon name="calendar" size={18} />}
              classNames={{
                inputWrapper: "h-10",
                segment: "rounded",
              }}
            />
          </I18nProvider>
        </div>

        <div className="flex-1">
          <Select
            aria-label="Фільтр товарів"
            placeholder="Всі товари"
            selectionMode="multiple"
            selectedKeys={selectedProducts}
            onSelectionChange={(keys) => {
              setSelectedProducts(new Set(Array.from(keys) as string[]));
            }}
            size="md"
            startContent={
              <DynamicIcon name="package" className="text-gray-400" size={19} />
            }
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2",
            }}
          >
            {productOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        </div>

        {/* Кнопка сброса фильтров */}
        <Button
          onPress={resetFilters}
          disabled={loading}
          size="md"
          variant="flat"
          className="h-10 px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500"
        >
          <DynamicIcon name="rotate-ccw" size={16} />
          Скинути
        </Button>
      </div>

      {/* Прогресс кеширования */}
      {cacheProgress && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DynamicIcon
                name="database"
                size={20}
                className="text-blue-600"
              />
              <span className="text-sm font-medium text-blue-800">
                Оновлення кеша статистики
              </span>
            </div>
            <span className="text-sm text-blue-600">
              {cacheProgress.processed} / {cacheProgress.total}
            </span>
          </div>

          <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(cacheProgress.processed / cacheProgress.total) * 100}%`,
              }}
            />
          </div>

          <div className="flex justify-between text-xs text-blue-600">
            <span>Оброблено: {cacheProgress.processed}</span>
            <span>Помилки: {cacheProgress.errors}</span>
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="relative">
        <Table
          aria-label="Звіт продажів"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) =>
            setSortDescriptor(descriptor as SortDescriptor)
          }
          classNames={{
            wrapper:
              "min-h-80 p-0 pb-1 shadow-none bg-transparent rounded-none",
            th: ["first:rounded-s-md", "last:rounded-e-md"],
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
            items={sortedItems}
            emptyContent={
              loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-3 text-gray-600">Завантаження...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 h-110 text-gray-500">
                  <DynamicIcon
                    name="bar-chart-3"
                    size={48}
                    className="text-gray-300"
                  />
                  <span className="ml-3">Немає даних для відображення</span>
                </div>
              )
            }
            isLoading={loading}
          >
            {(item) => (
              <TableRow
                key={item.date}
                className="hover:bg-neutral-100 cursor-pointer transition-colors duration-200"
                onClick={() => handleOpenDetails(item)}
              >
                <TableCell className="font-medium text-base">
                  {(() => {
                    const dateObj = new Date(item.date);
                    const day = dateObj.getDay();
                    const isWeekend = day === 0 || day === 6;
                    const dateStr = dateObj.toLocaleDateString("uk-UA", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      weekday: "short",
                    });
                    return (
                      <span className={isWeekend ? "text-gray-400" : ""}>
                        {dateStr}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(item.ordersCount, getAllOrdersCounts)
                        .base,
                      content: getValueColor(
                        item.ordersCount,
                        getAllOrdersCounts,
                      ).content,
                    }}
                  >
                    {item.ordersCount}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.portionsCount,
                        getAllPortionsCounts,
                      ).base,
                      content: getValueColor(
                        item.portionsCount,
                        getAllPortionsCounts,
                      ).content,
                    }}
                  >
                    {item.portionsCount}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["Сайт"] || 0,
                        getAllSourceWebsiteCounts,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["Сайт"] || 0,
                        getAllSourceWebsiteCounts,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["Сайт"] || 0} /{" "}
                    {item.portionsBySource["Сайт"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["Розетка"] || 0,
                        getAllSourceRozetkaCounts,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["Розетка"] || 0,
                        getAllSourceRozetkaCounts,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["Розетка"] || 0} /{" "}
                    {item.portionsBySource["Розетка"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["Пром"] || 0,
                        getAllSourcePromCounts,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["Пром"] || 0,
                        getAllSourcePromCounts,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["Пром"] || 0} /{" "}
                    {item.portionsBySource["Пром"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["Інше"] || 0,
                        getAllSourceChatCounts,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["Інше"] || 0,
                        getAllSourceChatCounts,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["Інше"] || 0} /{" "}
                    {item.portionsBySource["Інше"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersWithDiscountReason,
                        getAllDiscountReasonCounts,
                      ).base,
                      content: getValueColor(
                        item.ordersWithDiscountReason,
                        getAllDiscountReasonCounts,
                      ).content,
                    }}
                  >
                    {item.ordersWithDiscountReason} /{" "}
                    {item.portionsWithDiscountReason}
                  </Chip>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Итоговая строка */}
        {salesData.length > 0 && (
          <div className="border-t-1 border-gray-200 py-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-gray-800 w-2/16 pl-3"></div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.ordersCount}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.portionsCount}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.sourceWebsite} / {totals.sourceWebsitePortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.sourceRozetka} / {totals.sourceRozetkaPortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.sourceProm} / {totals.sourcePromPortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.sourceChat} / {totals.sourceChatPortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/16">
                {totals.discountReason} / {totals.discountReasonPortions}
              </div>
            </div>
          </div>
        )}

        {/* Полупрозрачный бекдроп лоадера с анимацией */}
        <div
          className={`absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10 transition-all duration-300 ease-in-out ${
            loading ? "opacity-100 visible" : "opacity-0 invisible"
          }`}
        >
          <div className="flex flex-col items-center">
            <Spinner size="lg" color="primary" />
            <span className="mt-3 text-gray-700 font-medium">
              Завантаження даних...
            </span>
          </div>
        </div>
      </div>

      {/* Модальное окно с деталями дня */}
      <Modal
        isOpen={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Деталі за{" "}
                {selectedDateDetails
                  ? new Date(selectedDateDetails.date).toLocaleDateString(
                      "uk-UA",
                      {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      },
                    )
                  : ""}
              </ModalHeader>
              <ModalBody>
                {selectedDateDetails && (
                  <div className="space-y-4">
                    {/* Главные карточки */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg text-center">
                        <div className="text-sm text-blue-600 font-medium">
                          Загалом замовлень
                        </div>
                        <div className="text-3xl font-bold text-blue-800">
                          {selectedDateDetails.ordersCount}
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg text-center">
                        <div className="text-sm text-green-600 font-medium">
                          Загалом порцій
                        </div>
                        <div className="text-3xl font-bold text-green-800">
                          {selectedDateDetails.portionsCount}
                        </div>
                      </div>
                    </div>

                    {/* Оптимизированные секции */}
                    <div className="flex gap-4">
                      <div className="flex flex-1 flex-col gap-4">
                        {/* Источники */}
                        <div className="flex-1 bg-neutral-50 rounded-lg p-3">
                          <h4 className="text-sm font-semibold mb-2 text-neutral-700">
                            По джерелах
                          </h4>
                          <div className="space-y-1">
                            {Object.entries(
                              selectedDateDetails.ordersBySource)
                              .sort((a, b) => b[1] - a[1]).map(([source, orders]) => {
                                const portions =
                                selectedDateDetails.portionsBySource[source] ||
                                0;
                              return (
                                <div
                                  key={source}
                                  className="flex justify-between items-center"
                                >
                                  <span className="text-neutral-600 text-sm">
                                    {source}
                                  </span>
                                  <span className="font-medium">
                                    {orders} / {portions}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Скидки */}
                        <div className="flex-1 bg-neutral-50 rounded-lg p-3">
                          <h4 className="text-sm font-semibold mb-2 text-neutral-700">
                            Зі знижкою
                          </h4>
                          <div className="flex justify-between items-center font-medium text-neutral-800">
                            {selectedDateDetails.discountReasonText && (
                              <span className="text-sm text-neutral-500">
                                {selectedDateDetails.discountReasonText}
                              </span>
                            )}
                            {selectedDateDetails.ordersWithDiscountReason} /{" "}
                            {selectedDateDetails.portionsWithDiscountReason}
                          </div>
                        </div>
                      </div>

                      {/* Статусы */}
                      <div className="flex-1 bg-neutral-50 rounded-lg p-3">
                        <h4 className="text-sm font-semibold mb-2 text-neutral-700">
                          По статусах
                        </h4>
                        <div className="flex flex-col gap-2">
                          {Object.keys({
                            ...selectedDateDetails.ordersByStatus,
                            ...selectedDateDetails.portionsByStatus,
                          }).sort((a, b) => (selectedDateDetails.ordersByStatus[b] || 0) - (selectedDateDetails.ordersByStatus[a] || 0)).map((status) => {
                            const orders =
                              selectedDateDetails.ordersByStatus[status] || 0;
                            const portions =
                              selectedDateDetails.portionsByStatus[status] || 0;
                            return (
                              <div
                                key={status}
                                className="flex justify-between items-center"
                              >
                                <span className="text-neutral-600 text-sm">
                                  {getStatusLabel(status)}
                                </span>
                                <span className="font-medium">
                                  {orders} / {portions}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Таблица заказов */}
                    {selectedDateDetails.orders &&
                      selectedDateDetails.orders.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-lg font-semibold mb-3 text-neutral-700">
                            Замовлення за день
                          </h4>
                          <div className="border border-neutral-200 rounded-lg overflow-hidden">
                            <Table
                              isHeaderSticky
                              aria-label="Замовлення за день"
                              classNames={{
                                wrapper: "min-h-0 max-h-96 overflow-auto p-3",
                                table: "min-w-full",
                                th: ["first:rounded-s-sm", "last:rounded-e-sm"],
                              }}
                            >
                              <TableHeader>
                                <TableColumn className="text-sm font-medium">
                                  № замовлення
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Дата
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Кіл-ть порцій
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Джерело
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Статус
                                </TableColumn>
                              </TableHeader>
                              <TableBody
                                items={selectedDateDetails.orders}
                                emptyContent="Немає замовлень за цей день"
                              >
                                {(order) => (
                                  <TableRow key={order.externalId}>
                                    <TableCell className="font-medium text-sm">
                                      {order.orderNumber}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                      {order.orderDate}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                      {order.portionsCount || 0}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                      {order.source || ""}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      <Chip
                                        size="sm"
                                        variant="flat"
                                        className="text-xs"
                                        classNames={{
                                          base: getStatusColor(order.status),
                                        }}
                                      >
                                        {getStatusLabel(order.status)}
                                      </Chip>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="light" onPress={onClose}>
                  Закрити
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Информация о результатах и кеше с кнопками */}
      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div className="flex items-center gap-4">
          <span className="font-medium">
            Звіт:{" "}
            {salesData.length > 0 ? `${salesData.length} днів` : "Немає даних"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 items-end text-[13px]">
            <DynamicIcon
              name="database"
              size={14}
              className="text-neutral-400"
            />
            <span className="leading-none">
              Оновлено:{" "}
              <span className="font-medium">
                {lastCacheUpdate
                  ? formatRelativeDate(
                      lastCacheUpdate.toISOString(),
                    ).toLowerCase()
                  : "немає даних"}
              </span>
            </span>
          </div>

          <Button
            onPress={handleRefreshData}
            disabled={loading}
            size="sm"
            variant="flat"
            className="h-8"
          >
            <DynamicIcon name="refresh-cw" size={14} />
            Оновити дані
          </Button>

          {isAdmin() && (
            <Dropdown>
              <DropdownTrigger>
                <Button
                  disabled={cacheLoading}
                  size="sm"
                  variant="flat"
                  className="h-8"
                >
                  <DynamicIcon name="database" size={14} />
                  {cacheLoading ? "Оновлення..." : "Оновити кеш"}
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Опції оновлення кеша">
                <DropdownItem
                  key="refresh-all"
                  onPress={handleRefreshAllCache}
                  startContent={<DynamicIcon name="database" size={14} />}
                >
                  Оновити всі записи
                </DropdownItem>
                <DropdownItem
                  key="refresh-period"
                  onPress={handleRefreshPeriodCache}
                  startContent={<DynamicIcon name="calendar" size={14} />}
                >
                  За період
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}

          {/* Модальное окно выбора периода для обновления кеша */}
          <Modal
            isOpen={isPeriodModalOpen}
            onClose={() => setIsPeriodModalOpen(false)}
            size="md"
          >
            <ModalContent>
              <ModalHeader>
                <h3 className="text-lg font-semibold">
                  Обрати період для оновлення кеша
                </h3>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Оберіть період, за який потрібно оновити кеш статистики
                    товарів
                  </p>
                  <I18nProvider locale="uk-UA">
                    <DateRangePicker
                      aria-label="Період"
                      value={cachePeriodRange}
                      maxValue={today(getLocalTimeZone())}
                      onChange={setCachePeriodRange}
                      variant="bordered"
                      size="lg"
                      classNames={{
                        input: "w-full",
                        segment: "rounded",
                      }}
                    />
                  </I18nProvider>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="flat"
                  size="sm"
                  onPress={() => {
                    setIsPeriodModalOpen(false);
                    setCachePeriodRange(null);
                  }}
                >
                  Скасувати
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  onPress={handleConfirmPeriodRefresh}
                  disabled={cacheLoading}
                >
                  {cacheLoading ? "Оновлення..." : "Оновити кеш"}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </div>
      </div>
    </div>
  );
}
