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
} from "@heroui/react";
import { useApi } from "../hooks/useApi";
import { parseDate, CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate } from "../lib/formatUtils";
import { I18nProvider } from "@react-aria/i18n";
import { useRoleAccess } from "@/hooks/useRoleAccess";

interface ProductStats {
  name: string;
  sku: string;
  orderedQuantity: number;
  stockBalances: { [warehouse: string]: number };
}

interface ProductDateStats {
  date: string;
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

interface ProductDateStatsResponse {
  success: boolean;
  data: ProductDateStats[];
  product: {
    name: string;
    sku: string;
  };
  metadata: {
    source: string;
    filters: {
      sku: string;
      status: string;
      dateRange: { startDate: string; endDate: string } | null;
    };
    totalDates: number;
    totalOrders: number;
    fetchedAt: string;
  };
}

interface ProductStatsTableProps {
  className?: string;
}

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

// Определение колонок внутри компонента для доступа к productStats

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

export default function ProductStatsTable({ className }: ProductStatsTableProps) {
  const { isAdmin } = useRoleAccess();
  const { apiCall } = useApi();
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "orderedQuantity",
    direction: "descending"
  });

  // Фильтры
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePresetKey, setDatePresetKey] = useState<string | null>(null);

  // Фильтр по товарам
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [viewMode, setViewMode] = useState<"products" | "dates">("products");

  // Данные для режима по датам
  const [dateStats, setDateStats] = useState<ProductDateStats[]>([]);
  const [selectedProductInfo, setSelectedProductInfo] = useState<{ name: string; sku: string } | null>(null);

  // Кеширование
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{ processed: number; total: number; errors: number } | null>(null);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  // Определение колонок в зависимости от режима
  const columns = useMemo(() => {
    if (viewMode === "dates") {
      return [
        { key: "date", label: "Дата", sortable: true, className: "w-3/16" },
        { key: "name", label: "Назва товару", sortable: false, className: "w-5/16" },
        { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-2/16 text-center" },
        { key: "totalStock", label: "Всього", sortable: true, className: "w-2/16 text-center" },
        { key: "mainStock", label: "Склад ГП", sortable: true, className: "w-2/16 text-center" },
        { key: "smallStock", label: "Склад М", sortable: true, className: "w-2/16 text-center" }
      ];
    } else {
      return [
        { key: "name", label: "Назва товару", sortable: true, className: "w-6/16" },
        { key: "sku", label: "SKU", sortable: true, className: "w-2/16 text-left" },
        { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-2/16 text-center" },
        { key: "totalStock", label: "Всього", sortable: true, className: "w-2/16 text-center" },
        { key: "mainStock", label: "Склад ГП", sortable: true, className: "w-2/16 text-center" },
        { key: "smallStock", label: "Склад М", sortable: true, className: "w-2/16 text-center" }
      ];
    }
  }, [viewMode]);

  // Клиентский кеш по фильтрам
  const [cache, setCache] = useState<Record<string, { data: ProductStats[], timestamp: number }>>({});
  const CACHE_DURATION = 30000; // 30 секунд кеширования на клиенте

  // Загрузка статистики товаров
  const fetchProductStats = useCallback(async (force?: boolean) => {
    // Создаем ключ кеша на основе фильтров
    const cacheKey = `${statusFilter}_${dateRange ? `${dateRange.start?.toString()}_${dateRange.end?.toString()}` : 'no_date'}`;

    const now = Date.now();

    // Проверяем клиентский кеш для текущих фильтров
    if (!force && cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      console.log('📋 Using client cache for filters:', cacheKey);
      setProductStats(cache[cacheKey].data);
      return;
    }

    setLoading(true);
    // console.log('🚀 FETCH START - force:', force, 'current filters:', { statusFilter, dateRange });

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      if (dateRange?.start && dateRange?.end) {
        // Конвертируем CalendarDate в строку YYYY-MM-DD
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}`;
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const queryString = params.toString();
      const url = queryString ? `/api/orders/products/stats?${queryString}` : `/api/orders/products/stats`;

      // Синхронизация больше не нужна - данные берутся из кеша

      // Используем основной endpoint с кешем
      const response = await apiCall(url);
      const data: ProductStatsResponse = await response.json();

      if (data.success) {
        console.log('📊 ПОЛУЧЕНЫ ДАННЫЕ:', data.data.length, 'товаров,', data.metadata.totalOrders, 'заказов');

        const totalOrderedQuantity = data.data.reduce((sum, product) => sum + product.orderedQuantity, 0);
        console.log(`💰 ОБЩАЯ СУММА ЗАКАЗОВ: ${totalOrderedQuantity} шт.`);

        setProductStats(data.data);

        // Сохраняем в клиентский кеш
        setCache(prev => ({
          ...prev,
          [cacheKey]: { data: data.data, timestamp: now }
        }));

        // Обновляем время последнего обновления кеша
        setLastCacheUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching product stats:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange?.start, dateRange?.end, cache, CACHE_DURATION]);

  // Функция для загрузки статистики по датам для выбранного товара
  const fetchProductDateStats = useCallback(async (force?: boolean) => {
    if (!selectedProduct) {
      console.log('⚠️ fetchProductDateStats: no selectedProduct, skipping');
      return;
    }

    console.log('📊 fetchProductDateStats called for product:', selectedProduct, 'force:', force);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("sku", selectedProduct);

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      if (dateRange?.start && dateRange?.end) {
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}`;
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const queryString = params.toString();
      const url = queryString ? `/api/orders/products/stats/dates?${queryString}` : `/api/orders/products/stats/dates`;

      const response = await apiCall(url);
      const data: ProductDateStatsResponse = await response.json();

      if (data.success) {
        console.log('📊 ПОЛУЧЕНЫ ДАННЫЕ ПО ДАТАМ:', data.data.length, 'дней для товара', data.product.name);

        setDateStats(data.data);
        setSelectedProductInfo(data.product);
        setViewMode("dates");
      }
    } catch (error) {
      console.error('Error fetching product date stats:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedProduct, statusFilter, dateRange?.start, dateRange?.end, apiCall]);

  // Обертка для кнопки обновления данных
  const handleRefreshData = useCallback(() => {
    // Очищаем кеш для текущих фильтров
    const cacheKey = `${statusFilter}_${dateRange ? `${dateRange.start?.toString()}_${dateRange.end?.toString()}` : 'no_date'}`;
    setCache(prev => {
      const newCache = { ...prev };
      delete newCache[cacheKey];
      return newCache;
    });

    if (viewMode === "dates" && selectedProduct) {
      fetchProductDateStats(true).catch(console.error);
    } else {
      fetchProductStats(true).catch(console.error);
    }
  }, [fetchProductStats, fetchProductDateStats, statusFilter, dateRange, viewMode, selectedProduct]);

  // Предустановленные диапазоны дат
  const getCurrentDate = () => today(getLocalTimeZone());

  const datePresets = [
    { key: "today", label: "Сьогодні", getRange: () => {
      const todayDate = getCurrentDate();
      return { start: todayDate, end: todayDate };
    }},
    { key: "yesterday", label: "Вчора", getRange: () => {
      const yesterday = getCurrentDate().subtract({ days: 1 });
      return { start: yesterday, end: yesterday };
    }},
    { key: "thisWeek", label: "Цього тижня", getRange: () => {
      const todayDate = getCurrentDate();
      const startOfWeek = todayDate.subtract({ days: todayDate.day - 1 }); // Понедельник
      return { start: startOfWeek, end: todayDate };
    }},
    { key: "last7Days", label: "Останні 7 днів", getRange: () => {
      const todayDate = getCurrentDate();
      const weekAgo = todayDate.subtract({ days: 6 });
      return { start: weekAgo, end: todayDate };
    }},
    { key: "last14Days", label: "Останні 14 днів", getRange: () => {
      const todayDate = getCurrentDate();
      const twoWeeksAgo = todayDate.subtract({ days: 13 });
      return { start: twoWeeksAgo, end: todayDate };
    }},
    { key: "thisMonth", label: "Цього місяця", getRange: () => {
      const todayDate = getCurrentDate();
      const startOfMonth = todayDate.subtract({ days: todayDate.day - 1 });
      return { start: startOfMonth, end: todayDate };
    }},
    { key: "lastMonth", label: "Минулого місяця", getRange: () => {
      const todayDate = getCurrentDate();
      const lastMonth = todayDate.subtract({ months: 1 });
      const startOfLastMonth = lastMonth.subtract({ days: lastMonth.day - 1 });
      // Для последнего дня месяца используем приблизительное значение
      const endOfLastMonth = startOfLastMonth.add({ days: 30 }); // Примерно 30 дней
      return { start: startOfLastMonth, end: endOfLastMonth };
    }},
    { key: "thisYear", label: "Цього року", getRange: () => {
      const todayDate = getCurrentDate();
      const startOfYear = new CalendarDate(todayDate.year, 1, 1);
      return { start: startOfYear, end: todayDate };
    }},
    { key: "lastYear", label: "Минулого року", getRange: () => {
      const todayDate = getCurrentDate();
      const startOfLastYear = new CalendarDate(todayDate.year - 1, 1, 1);
      const endOfLastYear = new CalendarDate(todayDate.year - 1, 12, 31);
      return { start: startOfLastYear, end: endOfLastYear };
    }}
  ];

  // Обработчик изменения выбранного товара
  const handleProductChange = useCallback((sku: string) => {
    console.log('🔄 handleProductChange called with sku:', sku);
    setSelectedProduct(sku);
    if (sku) {
      // Переключаемся в режим по датам
      console.log('📊 Switching to dates mode for product:', sku);
      setViewMode("dates");
      // Не вызываем fetchProductDateStats здесь, он вызовется в useEffect
    } else {
      // Возвращаемся к общему режиму
      console.log('📊 Switching back to products mode');
      setViewMode("products");
      setDateStats([]);
      setSelectedProductInfo(null);
    }
  }, []); // Убрали все зависимости

  // Функция сброса фильтров
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setDateRange(null);
    setDatePresetKey(null);
    setSelectedProduct("");
    setViewMode("products");
    setDateStats([]);
    setSelectedProductInfo(null);
    setCache({}); // Очищаем весь кеш при сбросе фильтров
  }, []);

  // Обновление кеша
  const refreshCache = async () => {
    setCacheLoading(true);
    setCacheProgress(null);

    try {
      console.log('🚀 Starting cache refresh...');

      // Показываем уведомление о начале
      alert('🚀 Початок оновлення кеша статистики товарів...\nЗамовлення обробляються пачками по 50 шт.\nЦе може зайняти кілька хвилин.');

      // Вызываем endpoint массового кеширования
      const response = await apiCall('/api/orders/preprocess-all', {
        method: 'POST'
      });

      if (response.status === 403) {
        throw new Error('Недостатньо прав доступу. Необхідні права адміністратора.');
      }

      if (!response.ok) {
        throw new Error('Failed to refresh cache');
      }

      const result = await response.json();

      if (result.success) {
        console.log('✅ Cache refresh completed:', result.stats);

        // Обновляем время последнего обновления кеша
        setLastCacheUpdate(new Date());

        // Показываем уведомление об успешном завершении
        alert(`✅ Кеш статистики успішно оновлено!\nОброблено: ${result.stats.processedCount} замовлень\nПачок: ${result.stats.batchesProcessed} (по ${result.stats.batchSize} замовлень)\nПомилки: ${result.stats.errorCount}`);

        // Очищаем клиентский кеш и обновляем данные
        setCache({});
        await fetchProductStats(true); // force = true для принудительного запроса
      } else {
        throw new Error('Cache refresh failed');
      }

    } catch (error) {
      console.error('❌ Error refreshing cache:', error);
      alert('❌ Помилка при оновленні кеша: ' + error);
    } finally {
      setCacheLoading(false);
      setCacheProgress(null);
    }
  };

  // Загрузка данных при изменении фильтров
  useEffect(() => {
    console.log('🔄 useEffect triggered - viewMode:', viewMode, 'selectedProduct:', selectedProduct, 'statusFilter:', statusFilter);
    if (viewMode === "dates" && selectedProduct) {
      console.log('📊 Calling fetchProductDateStats from useEffect');
      fetchProductDateStats();
    } else {
      console.log('📊 Calling fetchProductStats from useEffect');
      fetchProductStats();
    }
  }, [fetchProductStats, viewMode, selectedProduct, statusFilter, dateRange]); // Убрали fetchProductDateStats из зависимостей



  // Инициализация времени последнего обновления
  useEffect(() => {
    if (!lastCacheUpdate) {
      setLastCacheUpdate(new Date());
    }
  }, [lastCacheUpdate]);

  // Сортировка данных
  const sortedItems = useMemo(() => {
    if (viewMode === "dates") {
      const items = [...dateStats];

      items.sort((a, b) => {
        const first = a[sortDescriptor.column as keyof ProductDateStats];
        const second = b[sortDescriptor.column as keyof ProductDateStats];

        let cmp = 0;

        if (sortDescriptor.column === "date") {
          cmp = a.date.localeCompare(b.date);
        } else if (sortDescriptor.column === "totalStock") {
          // Для общего количества на складах
          const firstTotal = Object.values(a.stockBalances).reduce((sum, balance) => sum + balance, 0);
          const secondTotal = Object.values(b.stockBalances).reduce((sum, balance) => sum + balance, 0);
          cmp = firstTotal - secondTotal;
        } else if (typeof first === "number" && typeof second === "number") {
          cmp = first - second;
        }

        return sortDescriptor.direction === "descending" ? -cmp : cmp;
      });

      return items;
    } else {
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
    }
  }, [productStats, dateStats, sortDescriptor, viewMode]);

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

  // Цветовая градация для значений (мягкие цвета в стиле flat HeroUI)
  // Возвращаем объект с base и content, 5 градаций, нули — серый текст, без фона
  const getValueColor = (value: number, values: number[]) => {
    if (values.length === 0 || value === 0) {
      return {
        base: "bg-transparent",
        content: "text-gray-400 font-medium"
      };
    }

    const min = Math.min(...values.filter(v => v > 0));
    const max = Math.max(...values);

    if (min === max) {
      return {
        base: "bg-neutral-100/50",
        content: "text-gray-700 font-medium"
      };
    }

    const normalized = (value - min) / (max - min);

	if (normalized < 0.1) {
	// Красный
		return {
			base: "bg-danger/10",
			content: "text-danger font-medium"
		};
	} else if (normalized < 0.35) {
	// Жёлтый
		return {
			base: "bg-yellow-500/10",
			content: "text-yellow-700/80 font-medium"
		};
	} else if (normalized < 0.75) {
		// Жёлтый
			return {
				base: "bg-lime-500/10",
				content: "text-lime-600/80 font-medium"
			};
	} else {
		// Зелёный
		return {
			base: "bg-lime-500/20",
			content: "text-lime-600 font-medium"
		};
	}
  };

  // Получение всех значений для каждого столбца
  const getAllOrderedQuantities = useMemo(() =>
    viewMode === "dates"
      ? dateStats.map(item => item.orderedQuantity)
      : productStats.map(item => item.orderedQuantity),
    [productStats, dateStats, viewMode]);

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

  // Расчет итоговых значений
  const totals = useMemo(() => {
    if (viewMode === "dates") {
      return {
        orderedQuantity: dateStats.reduce((sum, item) => sum + item.orderedQuantity, 0),
        totalStock: dateStats.reduce((sum, item) => sum + getTotalStock(item.stockBalances), 0),
        mainStock: dateStats.reduce((sum, item) => sum + getMainStock(item.stockBalances), 0),
        smallStock: dateStats.reduce((sum, item) => sum + getSmallStock(item.stockBalances), 0),
      };
    } else {
      return {
        orderedQuantity: productStats.reduce((sum, item) => sum + item.orderedQuantity, 0),
        totalStock: productStats.reduce((sum, item) => sum + getTotalStock(item.stockBalances), 0),
        mainStock: productStats.reduce((sum, item) => sum + getMainStock(item.stockBalances), 0),
        smallStock: productStats.reduce((sum, item) => sum + getSmallStock(item.stockBalances), 0),
      };
    }
  }, [productStats, dateStats, viewMode]);

  // Форматирование разбивки по складам
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

  // Генерация опций для выбора товара
  const productOptions = useMemo(() => {
    const options = [<SelectItem key="">Всі товари</SelectItem>];
    productStats.forEach((product) => {
      options.push(
        <SelectItem key={product.sku}>
          {product.name} ({product.sku})
        </SelectItem>
      );
    });
    return options;
  }, [productStats]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Фильтры */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1">
          <Select
            aria-label="Фільтр по товару"
            placeholder="Всі товари"
            selectedKeys={selectedProduct ? [selectedProduct] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys);
              const sku = selected.length > 0 ? (selected[0] as string) : "";
              handleProductChange(sku);
            }}
            renderValue={(items) => {
              if (items.length === 0) return "Всі товари";
              const selectedItem = items[0];
              const product = productStats.find(p => p.sku === selectedItem.key);
              return product ? `${product.name} (${product.sku})` : "Всі товари";
            }}
            size="lg"
            startContent={<DynamicIcon name="package" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-12 max-w-60",
              innerWrapper: "gap-2"
            }}
          >
            {productOptions}
          </Select>
        </div>

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
            size="lg"
			startContent={<DynamicIcon name="filter" className="text-gray-400" size={19} />}
			classNames={{
				trigger: "h-12",
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
				if (preset) setDateRange(preset.getRange());
			}}
            size="lg"
			startContent={<DynamicIcon name="calendar" className="text-gray-400" size={19} />}
			classNames={{
				trigger: "h-12",
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
              size="lg"
			  selectorButtonPlacement="start"
			  selectorIcon={<DynamicIcon name="calendar" size={18} />}
			  classNames={{
				inputWrapper: "h-12",
				segment: "rounded"
			  }}
            />
          </I18nProvider>
        </div>

        {/* Кнопка сброса фильтров */}
        <Button
          onPress={resetFilters}
          disabled={loading}
          size="lg"
          variant="flat"
          className="h-12 px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500"
        //   isIconOnly
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
          aria-label="Статистика товарів"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) =>
            setSortDescriptor(descriptor as SortDescriptor)
          }
          classNames={{
            wrapper: "min-h-128 px-0 shadow-none",
			// table: "bg-neutral-300",
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
              loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-3 text-gray-600">Завантаження...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 h-110 text-gray-500">
                  <DynamicIcon
                    name="inbox"
                    size={48}
                    className="text-gray-300"
                  />
                  <span className="ml-3">
                    {viewMode === "dates" ? "Немає даних по датах для цього товару" : "Немає даних для відображення"}
                  </span>
                </div>
              )
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

        {/* Итоговая строка */}
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

        {/* Полупрозрачный бекдроп лоадера с анимацией */}
        <div
          className={`absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10 transition-all duration-300 ease-in-out ${
            loading ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
        >
          <div className="flex flex-col items-center">
            <Spinner size="lg" color="primary" />
            <span className="mt-3 text-gray-700 font-medium">Завантаження даних...</span>
          </div>
        </div>
      </div>

      {/* Информация о результатах и кеше с кнопками */}
      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div></div>
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
            <Button
              onPress={refreshCache}
              disabled={cacheLoading}
              size="sm"
              variant="flat"
              className="h-8"
            >
              <DynamicIcon name="database" size={14} />
              {cacheLoading ? "Оновлення..." : "Оновити кеш"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
