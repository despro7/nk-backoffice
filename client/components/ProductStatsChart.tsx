import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// Вспомогательная функция для тестирования расчетов (определена ниже после getProductGroup)
import {
  Button,
  Select,
  SelectItem,
  DateRangePicker,
  Spinner,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { useApi } from "../hooks/useApi";
import { CalendarDate } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate } from "../lib/formatUtils";
import { addToast } from "@heroui/react";
import { I18nProvider } from "@react-aria/i18n";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { createStandardDatePresets, convertCalendarRangeToReportingRange } from "../lib/dateReportingUtils";
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

interface ProductStats {
  name: string;
  sku: string;
  orderedQuantity: number;
  stockBalances: { [warehouse: string]: number };
}

interface ProductStatsResponse {
  success: boolean;
  data: ProductStats[];
  metadata: {
    source: string;
    filters: {
      status: string;
      dateRange: { startDate: string; endDate: string } | null;
    };
    totalProducts: number;
    totalOrders: number;
    fetchedAt: string;
  };
}

interface ProductStatsChartProps {
  className?: string;
}

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

const statusOptions = [
  { key: "all", label: "Всі статуси" },
  { key: "1", label: "Нові" },
  { key: "2", label: "Підтверджені" },
  { key: "3", label: "Готові до відправки" },
  { key: "4", label: "Відправлені" },
  { key: "5", label: "Продані" },
  { key: "6", label: "Відхилені" },
  { key: "7", label: "Повернені" },
  { key: "8", label: "Видалені" }
];

export default function ProductStatsChart({ className }: ProductStatsChartProps) {
  const { isAdmin } = useRoleAccess();
  const { apiCall } = useApi();
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "orderedQuantity",
    direction: "descending"
  });

  // Фильтры

  // Використовуємо централізовані preset'и дат
  const datePresets = createStandardDatePresets();

  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("last30Days");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const preset = datePresets.find(p => p.key === "last30Days");
    return preset ? preset.getRange() : null;
  });

  // Налаштування звітного дня
  const [dayStartHour, setDayStartHour] = useState<number>(0);

  // Опции групп товаров
  const productGroupOptions = [
    { key: "first_courses", label: "Перші страви" },
    { key: "main_courses", label: "Другі страви" },
  ];

  // Фильтр по товарам и группам (множественный выбор)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());



  // Группировка данных
  const [groupBy, setGroupBy] = useState<'hour' | 'day' | 'week' | 'month'>('day');
  const [dataAvailability, setDataAvailability] = useState<{
    hasData: boolean;
    message: string;
    periodInfo: string;
  }>({ hasData: false, message: '', periodInfo: '' });

  // Кеширование
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{ processed: number; total: number; errors: number } | null>(null);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  // Модальное окно выбора периода для обновления кеша
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [cachePeriodRange, setCachePeriodRange] = useState<DateRange | null>(null);

  // Клиентский кеш по фильтрам
  const [cache, setCache] = useState<Record<string, { data: ProductStats[], timestamp: number }>>({});
  const CACHE_DURATION = 30000; // 30 секунд кеширования на клиенте

  // Загрузка данных для графика
  const firstLoadRef = useRef(true);
  const fetchChartData = useCallback(async (force?: boolean) => {
    if (!dateRange?.start || !dateRange?.end) {
      setChartData([]);
      return;
    }

    // Artificial delay before first fetch to avoid race condition
    if (firstLoadRef.current) {
      await new Promise(res => setTimeout(res, 30));
      firstLoadRef.current = false;
    }

    // Создаем ключ кеша на основе фильтров
    const selectedProductsKey = Array.from(selectedProducts).sort().join(',');
    const cacheKey = `chart_${statusFilter}_${dateRange.start?.toString()}_${dateRange.end?.toString()}_${groupBy}_${selectedProductsKey}`;

    const now = Date.now();

    // Проверяем клиентский кеш для текущих фильтров
    if (!force && cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      setChartData(cache[cacheKey].data);
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

      // Добавляем выбранные товары
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
        const validatedData = Array.isArray(data.data) ? data.data : [];

        setChartData(validatedData);

        // Сохраняем в клиентский кеш
        setCache(prev => ({
          ...prev,
          [cacheKey]: { data: validatedData, timestamp: now }
        }));

        // Обновляем время последнего обновления кеша
        setLastCacheUpdate(new Date());
      } else {
        console.error('❌ Chart API returned error:', data.error);
        setChartData([]);
      }
    } catch (error) {
      console.error('❌ Error fetching chart data:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange?.start, dateRange?.end, groupBy, selectedProducts, apiCall, dayStartHour]);

  // Загрузка статистики товаров (для фильтров)
  const firstProductStatsLoadRef = useRef(true);
  const fetchProductStats = useCallback(async (force?: boolean) => {
    // Artificial delay before first fetch to avoid race condition
    if (firstProductStatsLoadRef.current) {
      await new Promise(res => setTimeout(res, 30));
      firstProductStatsLoadRef.current = false;
    }
    // Создаем ключ кеша на основе фильтров
    const cacheKey = `${statusFilter}_${dateRange ? `${dateRange.start?.toString()}_${dateRange.end?.toString()}` : 'no_date'}`;

    const now = Date.now();

    // Проверяем клиентский кеш для текущих фильтров
    if (!force && cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      setProductStats(cache[cacheKey].data);
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
        // Валидация данных
        const validatedData = Array.isArray(data.data) ? data.data : [];

        setProductStats(validatedData);

        // Сохраняем в клиентский кеш
        setCache(prev => ({
          ...prev,
          [cacheKey]: { data: validatedData, timestamp: now }
        }));

        // Обновляем время последнего обновления кеша
        setLastCacheUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching product stats:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange?.start, dateRange?.end, cache, CACHE_DURATION, dayStartHour]);

  // Обертка для кнопки обновления данных
  const handleRefreshData = useCallback(() => {
    // Очищаем кеш для текущих фильтров
    const productCacheKey = `${statusFilter}_${dateRange ? `${dateRange.start?.toString()}_${dateRange.end?.toString()}` : 'no_date'}`;
    const selectedProductsKey = Array.from(selectedProducts).sort().join(',');
    const chartCacheKey = `chart_${statusFilter}_${dateRange?.start?.toString()}_${dateRange?.end?.toString()}_${groupBy}_${selectedProductsKey}`;

    setCache(prev => {
      const newCache = { ...prev };
      delete newCache[productCacheKey];
      delete newCache[chartCacheKey];
      return newCache;
    });

    // Обновляем и статистику товаров, и данные графика
    fetchProductStats(true).catch(console.error);
    if (dateRange?.start && dateRange?.end) {
      fetchChartData(true).catch(console.error);
    }
  }, [fetchProductStats, fetchChartData, statusFilter, dateRange, groupBy, selectedProducts, dayStartHour]);

  // Функция сброса фильтров
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setDatePresetKey("last30Days");
    const preset = datePresets.find(p => p.key === "last30Days");
    if (preset) setDateRange(preset.getRange());
    setSelectedProducts(new Set());
    setGroupBy('day');
    setCache({}); // Очищаем весь кеш при сбросе фильтров
  }, []);

  // Обработчики для dropdown меню обновления кеша
  const handleRefreshAllCache = () => {
    refreshCache('full');
  };

  const handleRefreshPeriodCache = () => {
    setIsPeriodModalOpen(true);
  };

  const handleConfirmPeriodRefresh = async () => {
    if (cachePeriodRange?.start && cachePeriodRange?.end) {
      await refreshCache('period', cachePeriodRange);
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
  const refreshCache = async (mode: 'full' | 'period' = 'full', periodRange?: DateRange | null) => {
    setCacheLoading(true);
    setCacheProgress(null);

    try {
      // Показываем уведомление о начале
      const modeText = mode === 'full' ? 'всі записи' : 'період';
      addToast({
        title: "Початок оновлення",
        description: `🚀 Початок валідації та оновлення кеша (${modeText}). Використовується новий метод з інтелектуальною перевіркою.`,
        color: "primary",
        timeout: 3000,
      });

      // Подготавливаем параметры для нового endpoint
      const params: any = {
        force: 'true', // Принудительное обновление всех записей
        mode: mode     // Режим валидации
      };

      // Если выбран диапазон дат, используем его для фильтрации
      const rangeToUse = periodRange || (mode === 'period' ? dateRange : null);
      if (rangeToUse?.start && rangeToUse?.end) {
        const reportingDates = convertCalendarRangeToReportingRange(rangeToUse, dayStartHour);
        params.startDate = reportingDates.startDate;
        params.endDate = reportingDates.endDate;
        params.mode = 'period';
      }

      // Вызываем новый endpoint валидации кеша
      
      // Создаем query параметры из объекта params
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
      
      const response = await apiCall(`/api/orders/cache/validate?${queryParams}`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.status === 403) {
        throw new Error('Недостатньо прав доступу. Необхідні права адміністратора.');
      }

      if (!response.ok) {
        throw new Error('Failed to validate cache');
      }

      const result = await response.json();

      if (result.success) {
        console.log('✅ Cache validation completed:', result.data.stats);

        // Обновляем время последнего обновления кеша
        setLastCacheUpdate(new Date());

        const stats = result.data.stats;
        const summary = result.data.summary;

        // Показываем детальное уведомление об успешном завершении
        const message = `✅ Кеш успішно провалідовано та оновлено!\n\n` +
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
        await fetchProductStats(true); // force = true для принудительного запроса
      } else {
        throw new Error(result.error || 'Cache validation failed');
      }

    } catch (error) {
      console.error('❌ Error validating cache:', error);
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
    fetchProductStats();
  }, [fetchProductStats]);

  // Загрузка данных для графика при изменении параметров
  useEffect(() => {
    if (dateRange?.start && dateRange?.end) {
      // console.log('📊 useEffect: Loading chart data for date range, selectedProducts:', Array.from(selectedProducts));
      fetchChartData();
    } else {
      // console.log('📊 useEffect: No date range selected, clearing chart data');
      setChartData([]);
    }
  }, [fetchChartData, dateRange?.start, dateRange?.end, statusFilter, groupBy, selectedProducts]);

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
      }
    };

    fetchDayStartHour();
  }, [apiCall]);

  // Сортировка данных
  const sortedItems = useMemo(() => {
    const items = [...productStats];

    items.sort((a, b) => {
      const first = a[sortDescriptor.column as keyof ProductStats];
      const second = b[sortDescriptor.column as keyof ProductStats];

      let cmp = 0;

      if (sortDescriptor.column === "totalStock") {
        // Для общего количества на складах
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

  // Форматирование общего остатка на складах
  const getTotalStock = (stockBalances: { [warehouse: string]: number }) => {
    return Object.values(stockBalances).reduce((sum, balance) => sum + balance, 0);
  };

  // Разделение складов на главный и малый
  const getMainStock = (stockBalances: { [warehouse: string]: number }) => {
    // Предполагаем, что склад "1" - это главный склад ГП
    return stockBalances["1"] || 0;
  };

  const getSmallStock = (stockBalances: { [warehouse: string]: number }) => {
    // Сумма всех складов кроме "1" (главного)
    return Object.entries(stockBalances)
      .filter(([warehouseId]) => warehouseId !== "1")
      .reduce((sum, [, balance]) => sum + balance, 0);
  };

  // Расчет итоговых значений
  const totals = useMemo(() => ({
    orderedQuantity: productStats.reduce((sum, item) => sum + item.orderedQuantity, 0),
    totalStock: productStats.reduce((sum, item) => sum + getTotalStock(item.stockBalances), 0),
    mainStock: productStats.reduce((sum, item) => sum + getMainStock(item.stockBalances), 0),
    smallStock: productStats.reduce((sum, item) => sum + getSmallStock(item.stockBalances), 0),
  }), [productStats]);

  // Функция определения группы товара по названию
  const getProductGroup = (productName: string): string => {
    const name = productName.toLowerCase();
    if (name.includes('борщ') || name.includes('суп') || name.includes('бульйон') || name.includes('перший') || name.includes('перша')) {
      return 'first_courses';
    }
    // По умолчанию все остальные товары считаем вторыми блюдами
    return 'main_courses';
  };

// Вспомогательная функция для тестирования расчетов
const testCalculations = (products: any[], groupKey?: string) => {
  if (groupKey) {
    const groupProducts = products.filter(item => getProductGroup(item.name) === groupKey);
    const totalOrdered = groupProducts.reduce((sum, item) => sum + item.orderedQuantity, 0);
    return totalOrdered;
  } else {
    const totalOrdered = products.reduce((sum, item) => sum + item.orderedQuantity, 0);
    return totalOrdered;
  }
};

  // Получение списка всех товаров для фильтра с группами
  const allFilterOptions = useMemo(() => {
    const options: Array<{key: string, label: string, isGroup?: boolean, group?: string}> = [];

    // Добавляем группы в начало списка
    productGroupOptions.forEach(groupOption => {
      if (groupOption.key !== 'all') { // Пропускаем "Всі товари"
        options.push({
          key: `group_${groupOption.key}`,
          label: groupOption.label,
          isGroup: true,
        });
      }
    });

    // Добавляем разделитель как disabled SelectItem
    // options.push({
    //   key: 'divider',
    //   label: '───── Товари ─────',
    //   isGroup: false,
    // });

    // Добавляем товары
    sortedItems.forEach(item => {
      options.push({
        key: item.sku,
        label: `${item.name}`,
        group: getProductGroup(item.name),
      });
    });

    return options;
  }, [sortedItems]);

  // Общее количество товаров для placeholder
  const totalProductsCount = useMemo(() => {
    return sortedItems.length;
  }, [sortedItems]);

  // Расчет количества товаров в выбранных фильтрах (с учетом групп)
  const selectedProductsCount = useMemo(() => {
    const selectedKeys = Array.from(selectedProducts);
    const selectedGroups = selectedKeys.filter(key => key.startsWith('group_')).map(key => key.replace('group_', ''));
    const selectedIndividualProducts = selectedKeys.filter(key => !key.startsWith('group_'));

    let totalCount = selectedIndividualProducts.length;

    // Добавляем количество товаров в выбранных группах
    selectedGroups.forEach(groupKey => {
      const groupProducts = sortedItems.filter(item => getProductGroup(item.name) === groupKey);
      totalCount += groupProducts.length;
    });

    return totalCount;
  }, [selectedProducts, sortedItems]);

  // Фильтрация товаров по выбранным (группы или товары)
  const filteredProducts = useMemo(() => {
    const selectedKeys = Array.from(selectedProducts);

    // Разделяем выбранные ключи на группы и товары
    const selectedGroups = selectedKeys.filter(key => key.startsWith('group_')).map(key => key.replace('group_', ''));
    const selectedIndividualProducts = selectedKeys.filter(key => !key.startsWith('group_'));

    let result: (typeof sortedItems[0] | { sku: string; name: string; orderedQuantity: number; stockBalances: any; isGroupAggregate: boolean; groupKey: string })[] = [];

    // Если выбраны группы, создаем агрегированные объекты для каждой группы
    selectedGroups.forEach(groupKey => {
      const groupProducts = sortedItems.filter(item => getProductGroup(item.name) === groupKey);

      if (groupProducts.length > 0) {
        groupProducts.forEach(product => {
        });

        const totalOrdered = groupProducts.reduce((sum, item) => sum + item.orderedQuantity, 0);
        // Проверяем расчеты группы
        const testGroupTotal = testCalculations(sortedItems, groupKey);
        if (testGroupTotal !== totalOrdered) {
          console.error(`❌ ОШИБКА АГРЕГАЦИИ ГРУППЫ ${groupKey}: Тест показал ${testGroupTotal}, расчет показал ${totalOrdered}`);
        } else {
        }

        // Создаем виртуальный объект группы с суммарными данными
        const aggregateItem = {
          sku: `group_${groupKey}`,
          name: productGroupOptions.find(opt => opt.key === groupKey)?.label || groupKey,
          orderedQuantity: totalOrdered,
          stockBalances: groupProducts.reduce((acc, item) => {
            Object.keys(item.stockBalances).forEach(warehouse => {
              acc[warehouse] = (acc[warehouse] || 0) + item.stockBalances[warehouse];
            });
            return acc;
          }, {} as { [key: string]: number }),
          isGroupAggregate: true,
          groupKey: groupKey
        };

        result.push(aggregateItem);
      }
    });

    // Если выбраны индивидуальные товары, добавляем их
    if (selectedIndividualProducts.length > 0) {
      const individualProducts = sortedItems.filter(item => selectedIndividualProducts.includes(item.sku));
      result = [...result, ...individualProducts];
    }

    // Убираем дубликаты (если товар входит в группу и выбран индивидуально)
    const uniqueResult = result.filter((item, index, self) =>
      index === self.findIndex(t => t.sku === item.sku)
    );

    // Если ничего не выбрано, показываем первые 8 товаров
    if (uniqueResult.length === 0) {
      return sortedItems.slice(0, 8);
    }

    return uniqueResult;
  }, [sortedItems, selectedProducts, productGroupOptions]);

  // Обновляем состояние доступности данных
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

  // Цвета для линий графика
  const colors = [
    "hsl(210, 70%, 50%)", // Синий
    "hsl(142, 70%, 45%)", // Зелёный
    "hsl(25, 85%, 55%)",  // Оранжевый
    "hsl(162, 70%, 45%)", // Салатовый
    "hsl(270, 70%, 50%)", // Пурпурный
    "hsl(300, 70%, 50%)", // Розовый
    "hsl(330, 70%, 50%)", // Красный
    "hsl(45, 85%, 55%)",  // Жёлтый
    "hsl(195, 70%, 50%)", // Голубой
  ];

  // Кастомный тултип
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold text-gray-900">{data.date}</p>
          <p className="text-sm text-gray-600">{data.fullDate}</p>
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {payload
              .sort((a: any, b: any) => b.value - a.value) // Сортировка по значению
              .map((entry: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm font-medium truncate max-w-32">
                      {entry.name}
                    </span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: entry.color }}>
                    {entry.value}
                  </span>
                </div>
              ))}
          </div>
        </div>
      );
    }
    return null;
  };

  // Опции группировки
  const groupByOptions = [
    { key: "hour", label: "По годинах" },
    { key: "day", label: "По днях" },
    { key: "week", label: "По тижнях" },
    { key: "month", label: "По місяцях" },
  ];





  // Опции сортировки для графика
  const sortOptions = [
    { key: "orderedQuantity", label: "За порціями" },
    { key: "totalStock", label: "За залишками" },
    { key: "name", label: "За назвою" },
    { key: "sku", label: "За SKU" },
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
            startContent={<DynamicIcon name="filter" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2"
            }}
          >
            {statusOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        </div>



        <div className="flex-1">
          <Select
            aria-label="Швидкий вибір періоду"
            placeholder="Оберіть період"
            selectedKeys={datePresetKey ? [datePresetKey] : []}
            onSelectionChange={keys => {
              const selectedKey = Array.from(keys)[0] as string;
              setDatePresetKey(selectedKey);
              const preset = datePresets.find(p => p.key === selectedKey);
              if (preset) {
                setDateRange(preset.getRange());
              }
            }}
            size="md"
            startContent={<DynamicIcon name="calendar" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2"
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
                segment: "rounded"
              }}
            />
          </I18nProvider>
        </div>



        <div className="flex-1">
          <Select
            aria-label="Групування даних"
            placeholder="Групувати по"
            selectedKeys={[groupBy]}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              setGroupBy(selected as 'hour' | 'day' | 'week' | 'month');
            }}
            size="md"
            startContent={<DynamicIcon name="bar-chart-3" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10",
              innerWrapper: "gap-2"
            }}
          >
            {groupByOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        </div>

        <div className="flex-1">
          <Select
            aria-label="Фільтр товарів"
            placeholder={
              selectedProducts.size === 0
                ? `Всі товари (${totalProductsCount})`
                : `Вибрано ${selectedProductsCount} товарів у ${selectedProducts.size} фільтрах`
            }
            selectionMode="multiple"
            selectedKeys={selectedProducts}
            onSelectionChange={(keys) => {
              setSelectedProducts(new Set(Array.from(keys) as string[]));
            }}
            size="md"
            startContent={<DynamicIcon name="package" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10 max-w-46",
              innerWrapper: "gap-2"
            }}
          >
            {allFilterOptions.map((option) => {
              if (option.key === 'divider') {
                return (
                  <SelectItem
                    key={option.key}
                    isDisabled
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 pb-1"
                  >
                    {option.label}
                  </SelectItem>
                );
              }

              return (
                <SelectItem
                  key={option.key}
                  className={option.isGroup ? "font-semibold bg-blue-50" : ""}
                >
                  {option.label}
                </SelectItem>
              );
            })}
          </Select>
        </div>

        {/* Сортировка (только для графика товаров) */}
        {!(dateRange?.start && dateRange?.end) && (
          <>
            <div className="flex-1">
              <Select
                aria-label="Сортування"
                placeholder="Сортувати за"
                selectedKeys={[sortDescriptor.column]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  setSortDescriptor({
                    column: selected,
                    direction: sortDescriptor.direction
                  });
                }}
                size="md"
                startContent={
                  <DynamicIcon
                    name={sortDescriptor.direction === "descending" ? "arrow-down" : "arrow-up"}
                    className="text-gray-400"
                    size={19}
                  />
                }
                classNames={{
                  trigger: "h-10",
                  innerWrapper: "gap-2"
                }}
              >
                {sortOptions.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>
            </div>

            {/* Кнопка направления сортировки */}
            <Button
              onPress={() => setSortDescriptor(prev => ({
                ...prev,
                direction: prev.direction === "descending" ? "ascending" : "descending"
              }))}
              size="md"
              variant="flat"
              className="h-10 px-3 gap-2"
            >
              <DynamicIcon
                name={sortDescriptor.direction === "descending" ? "arrow-down" : "arrow-up"}
                size={16}
              />
            </Button>
          </>
        )}

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

      {/* График */}
      <Card className="min-h-128">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {chartData.length > 0
                  ? `${dataAvailability.periodInfo} • ${chartData[0]?.totalSales_name || 'Дані'} • Групування: ${groupByOptions.find(opt => opt.key === groupBy)?.label}`
                  : dataAvailability.hasData === false && dataAvailability.message
                    ? dataAvailability.message
                    : 'Оберіть період для відображення графіка'
                }
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DynamicIcon name="trending-up" size={16} />
              <span>
                {(() => {
                  const selectedKeys = Array.from(selectedProducts);
                  const hasGroupFilters = selectedKeys.some(key => key.startsWith('group_'));
                  const hasIndividualFilters = selectedKeys.some(key => !key.startsWith('group_'));
                  const hasAnyFilters = selectedKeys.length > 0;

                  if (!hasAnyFilters) {
                    return 'Агрегована лінія всіх товарів';
                  } else if (hasGroupFilters && !hasIndividualFilters) {
                    return selectedKeys.length === 1 ? 'Агрегована лінія групи товарів' : 'Порівняння груп товарів';
                  } else {
                    return 'Індивідуальні лінії товарів';
                  }
                })()}
              </span>
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
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                  />
                  {chartData.length > 0 && chartData[0] && (
                    // Логика отображения линий
                    (() => {
                      const dataKeys = Object.keys(chartData[0]);
                      const lines = [];

                      // Проверяем, есть ли агрегированные линии (totalSales или групповые)
                      const hasAggregatedLines = dataKeys.some(key =>
                        key === 'totalSales' || key.startsWith('group_')
                      );

                      // Если есть агрегированные линии - показываем только их
                      if (hasAggregatedLines) {
                        // Сначала проверяем на наличие totalSales (общая линия всех товаров)
                        const totalSalesKey = dataKeys.find(key => key === 'totalSales');
                        if (totalSalesKey) {
                          lines.push(
                            <Area
                              key="totalSales"
                              type="monotone"
                              dataKey="totalSales"
                              stroke={colors[0]}
                              fill="none"
                              strokeWidth={4}
                              name={chartData[0].totalSales_name || 'Всі товари'}
                            />
                          );
                        }

                        // Затем добавляем групповые линии (если есть)
                        const groupKeys = dataKeys.filter(key => key.startsWith('group_') && !key.endsWith('_name'));
                        groupKeys.forEach((groupKey, index) => {
                          const groupName = chartData[0][`${groupKey}_name`] || groupKey.replace('group_', '');
                          const colorIndex = (index + 1) % colors.length; // Начинаем с 1, чтобы не пересекаться с totalSales

                          lines.push(
                            <Area
                              key={groupKey}
                              type="monotone"
                              dataKey={groupKey}
                              stroke={colors[colorIndex]}
                              fill="none"
                              strokeWidth={4}
                              name={groupName}
                            />
                          );
                        });
                      } else {
                        // Если нет агрегированных линий - показываем индивидуальные товары
                        const productKeys = dataKeys.filter(key => key.startsWith('product_') && !key.endsWith('_name') && key !== 'product_');
                        productKeys.forEach((productKey, index) => {
                          const productName = chartData[0][`${productKey}_name`] || productKey.replace('product_', '');
                          const colorIndex = index % colors.length;

                          lines.push(
                            <Area
                              key={productKey}
                              type="monotone"
                              dataKey={productKey}
                              stroke={colors[colorIndex]}
                              fill="none"
                              strokeWidth={2}
                              name={productName.length > 20 ? productName.substring(0, 20) + '...' : productName}
                            />
                          );
                        });
                      }

                      return lines;
                    })()
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Полупрозрачный бекдроп лоадера */}
          <div
            className={`absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10 transition-all duration-300 ease-in-out rounded-lg ${
              loading ? 'opacity-100 visible' : 'opacity-0 invisible'
            }`}
          >
            <div className="flex flex-col items-center">
              <Spinner size="lg" color="primary" />
              <span className="mt-3 text-gray-700 font-medium">Завантаження даних...</span>
            </div>
          </div>
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
                {chartData.length > 0 ? (() => {
                  const dataKeys = Object.keys(chartData[0]);
                  const lineCount = dataKeys.filter(key =>
                    (key.startsWith('product_') || key.startsWith('group_') || key === 'totalSales') &&
                    !key.endsWith('_name') &&
                    key !== 'product_'
                  ).length;
                  return `${lineCount} ліні${lineCount === 1 ? 'я' : lineCount < 5 ? 'ї' : 'й'}`;
                })() : ''}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>Групування: {groupByOptions.find(opt => opt.key === groupBy)?.label}</span>
              {chartData.length > 0 && (
                <span>
                  Показується: {Object.keys(chartData[0]).filter(key => (key.startsWith('product_') || key.startsWith('group_') || key === 'totalSales') && !key.endsWith('_name')).length} товарів
                </span>
              )}
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Информация о результатах и кеше с кнопками */}
      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div className="flex items-center gap-4">
          <span className="font-medium">
            Графік: {chartData.length > 0 ? `${chartData.length} точок` : 'Немає даних'}
          </span>
          {chartData.length > 0 && chartData[0] && (
            <span className="text-xs text-gray-500">
              ({(() => {
                const dataKeys = Object.keys(chartData[0]);
                const lineCount = dataKeys.filter(key =>
                  (key.startsWith('product_') || key.startsWith('group_') || key === 'totalSales') &&
                  !key.endsWith('_name') &&
                  key !== 'product_'
                ).length;
                return `${lineCount} ліні${lineCount === 1 ? 'я' : lineCount < 5 ? 'ї' : 'й'}`;
              })()})
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 items-end text-[13px]">
            <DynamicIcon name="database" size={14} className="text-neutral-400" />
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
                <h3 className="text-lg font-semibold">Обрати період для оновлення кеша</h3>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Оберіть період, за який потрібно оновити кеш статистики товарів
                  </p>
                  <I18nProvider locale="uk-UA">
                    <DateRangePicker
                      label="Період"
                      value={cachePeriodRange}
                      onChange={setCachePeriodRange}
                      variant="bordered"
                      size="sm"
                      className="w-full"
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
