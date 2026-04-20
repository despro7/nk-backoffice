import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import type { DateRange } from "@react-types/datepicker";
import { CacheRefreshConfirmModal, CachePeriodSelectModal, useCacheRefreshModals } from "./modals/CacheRefreshConfirmModal";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusColor, getStatusLabel, ORDER_STATUSES, convertCalendarRangeToReportingRange, createStandardDatePresets, getValueColor } from "../lib";
import { I18nProvider } from "@react-aria/i18n";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { addToast } from "@heroui/react";
import { useAuth } from "../contexts/AuthContext";
import { useExportFunctions } from "../hooks/useExportFunctions";

interface SalesData {
  date: string;
  ordersCount: number;
  portionsCount: number;
  ordersByStatus: { [status: string]: number };
  portionsByStatus: { [status: string]: number };
  ordersBySource: { [source: string]: number };
  portionsBySource: { [source: string]: number };
  priceBySource: { [source: string]: number };
  ordersWithDiscountReason: number;
  portionsWithDiscountReason: number;
  priceWithDiscountReason: number;
  discountReasonText: string;
  totalPrice: number | undefined;
  vidskoduvannaTotal: number;    // кількість замовлень з відшкодуванням за день
  vidskoduvannaGrnTotal: number; // загальна сума відшкодувань за день (грн)
  vidskoduvannaPortions: number; // кількість порцій з відшкодуванням за день
  orders: Array<{
    orderNumber: string;
    portionsCount: number;
    source: string;
    createdAt: string;
    orderDate: string;
    orderTime: string;
    externalId: string;
    status: string;
    // per-order fields from backend
    totalPrice?: number | undefined;
    hasDiscount?: boolean;
    discountReasonCode?: string | null;
    vidskoduvanna?: number | null;    // кількість відшкодованих порцій із rawData
    vidskoduvannaGrn?: number | null; // сума відшкодування в грн із rawData
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

// Опції додаткового фільтра
const extraFilterOptions = [
  { key: "noDiscount", label: "Виключити 'Зі знижкою'" },
  { key: "noMarketplaces", label: "Виключити маркетплейси" },
  { key: "noOther", label: "Виключити 'Інше'" },
];

export default function SalesReportTable({ className }: SalesReportTableProps) {
  // Додатковий фільтр
  const [extraFilters, setExtraFilters] = useState<Set<string>>(new Set());
  // Кольорове форматування таблиці
  const [colored, setColored] = useState(true);
  const { isAdmin } = useRoleAccess();
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "date",
    direction: "descending",
  });

  // Модальное окно с деталями
  const [selectedDateDetails, setSelectedDateDetails] = useState<SalesData | null>(null);
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
  const cacheModals = useCacheRefreshModals({
    apiCall,
    onRefreshAll: () => refreshCache('full'),
    onRefreshPeriod: (range) => refreshCache('period', range),
  });

  // Предустановленные диапазоны дат
  const datePresets = useMemo(() => createStandardDatePresets(), []);

  // Фильтры
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("last7Days");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const presets = createStandardDatePresets();
    const preset = presets.find((p) => p.key === "last7Days");
    return preset ? preset.getRange() : null;
  });
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set(),
  );

  // Налаштування звітного дня
  const [dayStartHour, setDayStartHour] = useState<number>(0); // Default to midnight

  // Загрузка данных для таблицы
  const firstLoadRef = useRef(true);
  const fetchSalesData = useCallback(
    async (force?: boolean) => {
      if (firstLoadRef.current) {
        await new Promise((res) => setTimeout(res, 30));
        firstLoadRef.current = false;
      }
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

        // Конвертируем CalendarDate в звітні дати з урахуванням dayStartHour
        const reportingDates = convertCalendarRangeToReportingRange(dateRange, dayStartHour);
        params.append("startDate", reportingDates.startDate);
        params.append("endDate", reportingDates.endDate);

        // Для одиночних днів агрегуємо в один запис
        const isPresetSingleDay = datePresetKey === "today" || datePresetKey === "yesterday";
        const singleDay = isPresetSingleDay || reportingDates.isSingleDate;
        params.append("singleDay", singleDay.toString());

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
    [statusFilter, dateRange?.start, dateRange?.end, selectedProducts, apiCall, dayStartHour],
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
    // Скидаємо також додаткові фільтри
    setExtraFilters(new Set());
    setCache({}); // Очищаем весь кеш при сбросе фильтров
  }, []);

  // Обработчики для dropdown меню обновления кеша
  const handleRefreshAllCache = () => cacheModals.openRefreshAll();
  const handleRefreshPeriodCache = () => cacheModals.openRefreshPeriod();

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
    if (isAuthLoading) return; // Чекаємо, поки авторизація ініціалізується
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
    dayStartHour, // Додаємо dayStartHour як dependency
    isAuthLoading,
  ]);

  // Инициализация времени последнего обновления
  useEffect(() => {
    if (!lastCacheUpdate) {
      setLastCacheUpdate(new Date());
    }
  }, [lastCacheUpdate]);

  // Отримання налаштувань звітного дня при ініціалізації
  useEffect(() => {
    const fetchDayStartHour = async () => {
      try {
        const response = await apiCall('/api/settings/reporting-day-start-hour');
        const data = await response.json();
        if (data.dayStartHour !== undefined) {
          setDayStartHour(data.dayStartHour);
        }
      } catch (error) {
        console.warn('Failed to fetch dayStartHour, using default (0):', error);
        // Keep default value of 0
      }
    };

    if (!isAuthLoading) {
      fetchDayStartHour();
    }
  }, [apiCall, isAuthLoading]);

  // Фільтрація salesData згідно додаткових фільтрів
  // Фільтрація orders всередині кожного дня, агрегати перераховуються по відфільтрованих orders
  const filteredSalesData = useMemo((): SalesData[] => {
    if (extraFilters.size === 0) return salesData;
    return salesData
      .map((item) => {
        // Debug: log item and filters to help trace mismatches between row and modal
        try {
          console.debug('[SalesReportTable] aggregating item ' + JSON.stringify({
            date: item.date,
            originalOrdersCount: item.orders?.length || 0,
            extraFilters: Array.from(extraFilters),
          }));
        } catch (e) {
          // ignore logging errors
        }
        let filteredOrders = item.orders;
        if (extraFilters.has("noMarketplaces")) {
          filteredOrders = filteredOrders.filter((order) => !["rozetka", "prom.ua"].includes(order.source));
        }
        if (extraFilters.has("noOther")) {
          filteredOrders = filteredOrders.filter((order) => order.source !== "інше");
        }
        if (extraFilters.has("noDiscount")) {
          // Support both new per-order flags and legacy markers
          filteredOrders = filteredOrders.filter((order) => {
            const o: any = order as any;
            const hasDiscountFlag = o.hasDiscount === true || (o.discountReasonCode != null && String(o.discountReasonCode).trim() !== '');
            const legacyPricina = o.pricinaZnizki && String(o.pricinaZnizki).trim() !== '';
            const legacyStatus = o.status === 'discount';
            return !(hasDiscountFlag || legacyPricina || legacyStatus);
          });
        }
        if (filteredOrders.length === 0) return null;
        
        let ordersCount = filteredOrders.length;
        let portionsCount = filteredOrders.reduce((sum, o) => sum + (o.portionsCount || 0), 0);
        // totalPrice: використовуємо тільки реальні per-order totalPrice (якщо вони є).
        // Якщо у жодного order немає totalPrice, то показуємо undefined (в UI відображається "—").
        const anyOrderHasTotalPrice = filteredOrders.some((o) => (o as any).totalPrice !== undefined && (o as any).totalPrice !== null);
        let totalPrice: number | undefined;
        if (anyOrderHasTotalPrice) {
          totalPrice = filteredOrders.reduce((sum, o) => sum + (Number((o as any).totalPrice) || 0), 0);
        } else {
          totalPrice = undefined; // no per-order totals available
        }
        const ordersBySource: Record<string, number> = {};
        const portionsBySource: Record<string, number> = {};
        filteredOrders.forEach((o) => {
          ordersBySource[o.source] = (ordersBySource[o.source] || 0) + 1;
          portionsBySource[o.source] = (portionsBySource[o.source] || 0) + (o.portionsCount || 0);
        });
        const priceBySource: Record<string, number> = {};
        filteredOrders.forEach((o) => {
          priceBySource[o.source] = (priceBySource[o.source] || 0) + (Number((o as any).totalPrice) || 0);
        });
        const ordersByStatus: Record<string, number> = {};
        const portionsByStatus: Record<string, number> = {};
        filteredOrders.forEach((o) => {
          ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
          portionsByStatus[o.status] = (portionsByStatus[o.status] || 0) + (o.portionsCount || 0);
        });
  // discountReason — використовуємо тільки реальні per-order мітки (status === 'discount').
        // Consider new per-order flags and legacy markers for discount detection
        const explicitDiscountOrders = filteredOrders.filter((o) => {
          const or: any = o as any;
          return or.hasDiscount === true || (or.discountReasonCode != null && String(or.discountReasonCode).trim() !== '') || (or.pricinaZnizki && String(or.pricinaZnizki).trim() !== '') || or.status === 'discount';
        });
  let ordersWithDiscountReason = explicitDiscountOrders.length;
  let portionsWithDiscountReason = explicitDiscountOrders.reduce((sum, o) => sum + (o.portionsCount || 0), 0);

  // Ми відмовилися від пропорційних фолбеків; якщо користувач просить виключити знижки,
  // то вони вже були відфільтровані раніше через filteredOrders (status === 'discount').

        // Debug: print computed totals for this item after filtering
        try {
          console.debug('[SalesReportTable] computed ' + JSON.stringify({
            date: item.date,
            ordersCount,
            portionsCount,
            anyOrderHasTotalPrice,
            totalPrice,
            explicitDiscountOrders: explicitDiscountOrders.length,
            ordersWithDiscountReason,
            portionsWithDiscountReason,
            filteredOrdersPreview: filteredOrders.slice(0, 6).map((o) => ({ orderNumber: o.orderNumber, status: o.status, totalPrice: (o as any).totalPrice }))
          }));
        } catch (e) {}
        return {
          ...item,
          orders: filteredOrders,
          ordersCount,
          portionsCount,
          totalPrice,
          ordersBySource,
          portionsBySource,
          priceBySource,
          ordersByStatus,
          portionsByStatus,
          ordersWithDiscountReason,
          portionsWithDiscountReason,
          vidskoduvannaTotal: filteredOrders.filter((o) => (o as any).vidskoduvanna != null && Number((o as any).vidskoduvanna) > 0).length,
          vidskoduvannaGrnTotal: filteredOrders.reduce((sum, o) => sum + (Number((o as any).vidskoduvannaGrn) || 0), 0),
          vidskoduvannaPortions: filteredOrders.reduce((sum, o) => sum + (Number((o as any).vidskoduvanna) || 0), 0),
        };
      })
      .filter((d): d is SalesData => Boolean(d));
  }, [salesData, extraFilters]);

  // Використовуємо хук для функцій експорту
  const { exportToExcel, exportToTXT } = useExportFunctions({
    filteredSalesData,
    dateRange,
  });

  // Сортировка даних
  const sortedItems = useMemo(() => {
    const items = [...filteredSalesData];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortDescriptor.column === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortDescriptor.column === "ordersCount") {
        cmp = a.ordersCount - b.ordersCount;
      } else if (sortDescriptor.column === "portionsCount") {
        cmp = a.portionsCount - b.portionsCount;
      } else if (sortDescriptor.column === "totalPrice") {
        cmp = a.totalPrice - b.totalPrice;
      }
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });
    return items;
  }, [filteredSalesData, sortDescriptor]);

  // Підрахунок підсумків по відфільтрованих даних
  const totals = useMemo(
    () => ({
      ordersCount: filteredSalesData.reduce((sum, item) => sum + item.ordersCount, 0),
      portionsCount: filteredSalesData.reduce((sum, item) => sum + item.portionsCount, 0),
      totalPrice: filteredSalesData.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
      sourceWebsite: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["nk-food.shop"] || 0), 0),
      sourceWebsitePortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["nk-food.shop"] || 0), 0),
      sourceWebsitePrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource?.["nk-food.shop"] || 0), 0),
      sourceRozetka: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["rozetka"] || 0), 0),
      sourceRozetkaPortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["rozetka"] || 0), 0),
      sourceRozetkaPrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource?.["rozetka"] || 0), 0),
      sourceProm: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["prom.ua"] || 0), 0),
      sourcePromPortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["prom.ua"] || 0), 0),
      sourcePromPrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource?.["prom.ua"] || 0), 0),
      sourceChat: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["інше"] || 0), 0),
      sourceChatPortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["інше"] || 0), 0),
      sourceChatPrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource?.["інше"] || 0), 0),
      discountReason: filteredSalesData.reduce((sum, item) => sum + item.ordersWithDiscountReason, 0),
      discountReasonPortions: filteredSalesData.reduce((sum, item) => sum + item.portionsWithDiscountReason, 0),
      vidskoduvannaTotal: filteredSalesData.reduce((sum, item) => sum + (item.vidskoduvannaTotal || 0), 0),
      vidskoduvannaGrnTotal: filteredSalesData.reduce((sum, item) => sum + (item.vidskoduvannaGrnTotal || 0), 0),
      vidskoduvannaPortions: filteredSalesData.reduce((sum, item) => sum + (item.vidskoduvannaPortions || 0), 0),
    }),
    [filteredSalesData],
  );

  // Отримання статусу за ключем
  // const getStatusLabel = (statusKey: string) => {
  //   const status = statusOptions.find((s) => s.key === statusKey);
  //   return status ? status.label : statusKey;
  // };

  // Обробник відкриття модального вікна з деталями
  const handleOpenDetails = (dateData: SalesData) => {
    setSelectedDateDetails(dateData);
    setIsDetailsModalOpen(true);
  };

  // Набуття всіх значень для кожного стовпця
  const getAllOrdersCounts = useMemo(
    () => filteredSalesData.map((item) => item.ordersCount),
    [filteredSalesData],
  );

  const getAllPortionsCounts = useMemo(
    () => filteredSalesData.map((item) => item.portionsCount),
    [filteredSalesData],
  );

  const getAllTotalPrice = useMemo(
    () => filteredSalesData.map((item) => item.totalPrice || 0),
    [filteredSalesData],
  );

  const getAllSourceWebsiteCounts = useMemo(
    () => filteredSalesData.map((item) => item.ordersBySource["nk-food.shop"] || 0),
    [filteredSalesData],
  );

  const getAllSourceRozetkaCounts = useMemo(
    () => filteredSalesData.map((item) => item.ordersBySource["rozetka"] || 0),
    [filteredSalesData],
  );

  const getAllSourcePromCounts = useMemo(
    () => filteredSalesData.map((item) => item.ordersBySource["prom.ua"] || 0),
    [filteredSalesData],
  );

  const getAllSourceChatCounts = useMemo(
    () => filteredSalesData.map((item) => item.ordersBySource["інше"] || 0),
    [filteredSalesData],
  );

  const getAllDiscountReasonCounts = useMemo(
    () => filteredSalesData.map((item) => item.ordersWithDiscountReason),
    [filteredSalesData],
  );

  const getAllVidskoduvannaGrn = useMemo(
    () => filteredSalesData.map((item) => item.vidskoduvannaGrnTotal || 0),
    [filteredSalesData],
  );

  const columns = [
    { key: "date", label: "Дата", sortable: true, className: "w-3/19" },
    {
      key: "ordersCount",
      label: "Замовл.",
      sortable: true,
      className: "w-2/19 text-center",
    },
    {
      key: "portionsCount",
      label: "Порції",
      sortable: true,
      className: "w-2/19 text-center",
    },
    {
      key: "totalPrice",
      label: "Сума, ₴",
      sortable: true,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceWebsite",
      label: "Сайт",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceRozetka",
      label: "Розетка",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceProm",
      label: "Пром",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceChat",
      label: "Інше",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "discountReason",
      label: "Зі знижкою",
      sortable: false,
      className: "w-2/19 text-center",
    },
    // {
    //   key: "vidskoduvanna",
    //   label: "Відшкод.",
    //   sortable: false,
    //   className: "w-2/19 text-center",
    // },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Фільтри */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1">
          <Select
            aria-label="Статус замовлення"
            placeholder="Всі статуси"
            selectedKeys={statusFilter === "all" ? [] : [statusFilter]}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys) as string[];
              if (selected.length === 0) {
                setStatusFilter("all");
                return;
              }
              const sel = selected[0];
              const found = ORDER_STATUSES.find((o) => o.key === sel || o.label === sel);
              setStatusFilter(found ? found.key : sel);
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
              const selected = Array.from(keys) as string[];
              if (selected.length === 0) return;
              const sel = selected[0];
              const preset = datePresets.find((p) => p.key === sel || p.label === sel);
              if (preset) {
                setDatePresetKey(preset.key);
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

        {/* <div className="flex-1">
          <Select
            aria-label="Фільтр товарів"
            placeholder="Всі товари"
            selectionMode="multiple"
            selectedKeys={selectedProducts}
            onSelectionChange={(keys) => {
              const incoming = Array.from(keys) as string[];
              const normalized = incoming
                .map((k) => {
                  const found = productOptions.find((o) => o.key === k || o.label === k);
                  return found ? found.key : null;
                })
                .filter((k): k is string => Boolean(k));
              setSelectedProducts(new Set(normalized));
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
        </div> */}

        {/* Додатковий multi-select фільтр */}
        <div className="flex-1 min-w-[220px]">
          <Select
            aria-label="Додаткові фільтри"
            placeholder="Додаткові фільтри"
            selectionMode="multiple"
            selectedKeys={extraFilters}
            onSelectionChange={(keys) => {
              const incoming = Array.from(keys) as string[];
              // Normalize to known option keys (allow labels or keys)
              const normalized = incoming
                .map((k) => {
                  const found = extraFilterOptions.find((o) => o.key === k || o.label === k);
                  return found ? found.key : null;
                })
                .filter((k): k is string => Boolean(k));
              setExtraFilters(new Set(normalized));
            }}
            size="md"
            startContent={<DynamicIcon name="filter" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2",
            }}
          >
            {extraFilterOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        </div>

        {/* Перемикач кольорового форматування */}
        <Button
          onPress={() => setColored((prev) => !prev)}
          size="md"
          variant="flat"
          isIconOnly={true}
          startContent={<DynamicIcon name="palette" size={18} className="shrink-0" />}
          className={`h-10 px-3 gap-2 border-1.5 transition-colors ${
            colored
              ? "bg-lime-100 border-lime-500/50 text-lime-600/70 hover:bg-lime-100"
              : "bg-transparent border-neutral-200 text-neutral-400 hover:bg-neutral-100"
          }`}
        />

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
          key={String(colored)}
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
                className="hover:bg-grey-50 cursor-pointer transition-colors duration-200"
                onClick={() => handleOpenDetails(item)}
              >
                <TableCell className="font-medium text-[15px]">
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
                      <span className={`${isWeekend ? "text-gray-400" : ""} whitespace-nowrap`}>
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
                      base: getValueColor(item.ordersCount, getAllOrdersCounts, colored)
                        .base,
                      content: getValueColor(
                        item.ordersCount,
                        getAllOrdersCounts,
                        colored,
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
                        colored,
                      ).base,
                      content: getValueColor(
                        item.portionsCount,
                        getAllPortionsCounts,
                        colored,
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
                        item.totalPrice || 0,
                        getAllTotalPrice,
                        colored,
                      ).base,
                      content: getValueColor(
                        item.totalPrice || 0,
                        getAllTotalPrice,
                        colored,
                      ).content,
                    }}
                  >
                    {item.totalPrice !== undefined
                      ? item.totalPrice
                          .toLocaleString("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 })
                          .replace(/\s?грн\.?|UAH|₴/gi, "")
                      : "—"}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["nk-food.shop"] || 0,
                        getAllSourceWebsiteCounts,
                        colored,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["nk-food.shop"] || 0,
                        getAllSourceWebsiteCounts,
                        colored,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["nk-food.shop"] || 0} /{" "}
                    {item.portionsBySource["nk-food.shop"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["rozetka"] || 0,
                        getAllSourceRozetkaCounts,
                        colored,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["rozetka"] || 0,
                        getAllSourceRozetkaCounts,
                        colored,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["rozetka"] || 0} /{" "}
                    {item.portionsBySource["rozetka"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["prom.ua"] || 0,
                        getAllSourcePromCounts,
                        colored,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["prom.ua"] || 0,
                        getAllSourcePromCounts,
                        colored,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["prom.ua"] || 0} /{" "}
                    {item.portionsBySource["prom.ua"] || 0}
                  </Chip>
                </TableCell>
                <TableCell className="text-center text-base">
                  <Chip
                    size="md"
                    variant="flat"
                    classNames={{
                      base: getValueColor(
                        item.ordersBySource["інше"] || 0,
                        getAllSourceChatCounts,
                        colored,
                      ).base,
                      content: getValueColor(
                        item.ordersBySource["інше"] || 0,
                        getAllSourceChatCounts,
                        colored,
                      ).content,
                    }}
                  >
                    {item.ordersBySource["інше"] || 0} /{" "}
                    {item.portionsBySource["інше"] || 0}
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
                        colored,
                      ).base,
                      content: getValueColor(
                        item.ordersWithDiscountReason,
                        getAllDiscountReasonCounts,
                        colored,
                      ).content,
                    }}
                  >
                    {item.ordersWithDiscountReason} /{" "}
                    {item.portionsWithDiscountReason}
                  </Chip>
                </TableCell>
                {/* <TableCell className="text-center text-base">
                  {(item.vidskoduvannaTotal || 0) > 0 ? (
                    <Chip
                      size="md"
                      variant="bordered"
                      classNames={{
                        base: "border-red-700 border-1",
                        content: "text-red-700/80 font-medium",
                      }}
                    >
                      {item.vidskoduvannaTotal} /{" "}
                      {(item.vidskoduvannaGrnTotal || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                    </Chip>
                  ) : (
                    <span className="text-neutral-300 text-sm">—</span>
                  )}
                </TableCell> */}
              </TableRow>
            )}
          </TableBody>
        </Table>

    {/* Итоговая строка */}
    {filteredSalesData.length > 0 && (
          <div className="border-t-1 border-gray-200 py-2">
            <div className="flex items-center justify-between text-sm">
              <div className="w-3/19"></div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.ordersCount}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.portionsCount}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {(totals.totalPrice || 0)
                  .toLocaleString("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 })
                  .replace(/\s?грн\.?|UAH|₴/gi, " ₴")}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.sourceWebsite} / {totals.sourceWebsitePortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.sourceRozetka} / {totals.sourceRozetkaPortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.sourceProm} / {totals.sourcePromPortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.sourceChat} / {totals.sourceChatPortions}
              </div>
              <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.discountReason} / {totals.discountReasonPortions}
              </div>
              {/* <div className="text-center font-bold text-gray-800 w-2/19">
                {totals.vidskoduvannaTotal > 0
                  ? `${totals.vidskoduvannaTotal} / ${totals.vidskoduvannaGrnTotal.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`
                  : "—"}
              </div> */}
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
        scrollBehavior="outside"
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
                    {/* Головні картки */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg text-center">
                        <div className="text-sm text-blue-700 font-medium">
                          Замовлень
                        </div>
                        <div className="text-3xl font-bold text-blue-700">
                          {selectedDateDetails.ordersCount}
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg text-center">
                        <div className="text-sm text-green-700 font-medium">
                          Порцій
                        </div>
                        <div className="text-3xl font-bold text-green-700">
                          {selectedDateDetails.portionsCount}
                        </div>
                      </div>
                      <div className="p-4 bg-yellow-50 rounded-lg text-center">
                        <div className="text-sm text-yellow-700 font-medium">
                          Загальна сума
                        </div>
                        <div className="text-3xl font-bold text-yellow-700">
                          {selectedDateDetails.totalPrice !== undefined
                            ? selectedDateDetails.totalPrice
                                .toLocaleString("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 })
                                .replace(/\s?грн\.?|UAH|₴/gi, " ₴")
                            : "—"}
                        </div>
                      </div>
                      <div className="p-4 bg-fuchsia-50 rounded-lg text-center">
                        <div className="text-sm text-fuchsia-700 font-medium">
                          Середній чек
                        </div>
                        <div className="text-3xl font-bold text-fuchsia-700">
                          {selectedDateDetails.totalPrice !== undefined
                            ? (selectedDateDetails.totalPrice / (selectedDateDetails.ordersCount || 1))
                                .toLocaleString("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 })
                                .replace(/\s?грн\.?|UAH|₴/gi, " ₴")
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Картки відшкодувань (показуємо тільки якщо є дані) */}
                    {(selectedDateDetails.vidskoduvannaTotal || 0) > 0 && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                          <div className="text-xs text-orange-700 font-medium mb-1">
                            Замовлень з відшкодуванням
                          </div>
                          <div className="text-2xl font-bold text-orange-700">
                            {selectedDateDetails.vidskoduvannaTotal}
                          </div>
                        </div>
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                          <div className="text-xs text-orange-700 font-medium mb-1">
                            Кількість порцій
                          </div>
                          <div className="text-2xl font-bold text-orange-700">
                            {selectedDateDetails.vidskoduvannaPortions || 0}
                          </div>
                        </div>
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                          <div className="text-xs text-orange-700 font-medium mb-1">
                            Сума відшкодувань
                          </div>
                          <div className="text-2xl font-bold text-orange-700">
                            {(selectedDateDetails.vidskoduvannaGrnTotal || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Оптимизированные секции */}
                    <div className="flex gap-4">
                      <div className="flex flex-1 flex-col gap-4">
                        {/* Источники */}
                        <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3">
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
                      </div>

                      {/* Скидки */}
                      <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3">
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

                      {/* Статусы */}
                      <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3">
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
                                  №
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Дата
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Порцій
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Джерело
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Сума
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Знижка
                                </TableColumn>
                                {/* <TableColumn className="text-sm font-medium">
                                  Відшкод.
                                </TableColumn>
                                <TableColumn className="text-sm font-medium">
                                  Відшкод. ₴
                                </TableColumn> */}
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
                                    <TableCell className="text-sm text-neutral-600">
                                      {(order as any).totalPrice !== undefined && (order as any).totalPrice !== null
                                        ? Number((order as any).totalPrice).toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 }).replace(/\s?грн\.?|UAH|₴/gi, '')
                                        : '—'}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                      {(order as any).hasDiscount || (order as any).discountReasonCode ? (
                                        <Chip size="sm" variant="flat" className="text-xs" classNames={{ base: 'bg-lime-200', content: 'text-lime-800' }}>
                                          Так
                                        </Chip>
                                      ) : (
                                        <span className="text-sm text-neutral-200">—</span>
                                      )}
                                    </TableCell>
                                    {/* <TableCell className="text-sm text-neutral-600">
                                      {(order as any).vidskoduvanna != null && Number((order as any).vidskoduvanna) > 0
                                        ? <Chip size="sm" variant="flat" classNames={{ base: 'bg-orange-100', content: 'text-orange-700' }}>{Number((order as any).vidskoduvanna)}</Chip>
                                        : <span className="text-neutral-200">—</span>}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                      {(order as any).vidskoduvannaGrn != null && Number((order as any).vidskoduvannaGrn) > 0
                                        ? <Chip size="sm" variant="flat" classNames={{ base: 'bg-orange-100', content: 'text-orange-700' }}>{Number((order as any).vidskoduvannaGrn).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴</Chip>
                                        : <span className="text-neutral-200">—</span>}
                                    </TableCell> */}
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

          <Dropdown>
            <DropdownTrigger>
              <Button
                size="sm"
                variant="flat"
                className="h-8"
              >
                <DynamicIcon name="download" size={14} />
                Експорт
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Опції експорту">
              <DropdownItem
                key="export-excel"
                onPress={exportToExcel}
                startContent={<DynamicIcon name="file-spreadsheet" size={14} />}
              >
                Експорт в Excel
              </DropdownItem>
              <DropdownItem
                key="export-txt"
                onPress={exportToTXT}
                startContent={<DynamicIcon name="file" size={14} />}
              >
                Експорт в TXT
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>

          {/* Модальне вікно підтвердження та вибору періоду для оновлення кеша */}
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
