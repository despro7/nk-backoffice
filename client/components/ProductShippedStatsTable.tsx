import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ShipmentSummary } from "./ShipmentSummaryCards";
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
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tooltip,
} from "@heroui/react";
import { useApi } from "../hooks/useApi";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, formatDate } from "../lib/formatUtils";
import { addToast } from "@heroui/react";
import { I18nProvider } from "@react-aria/i18n";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { createStandardDatePresets } from "../lib";
import {
  CacheRefreshConfirmModal,
  CachePeriodSelectModal,
  useCacheRefreshModals,
} from "./modals/CacheRefreshConfirmModal";

interface ProductStats {
  name: string;
  sku: string;
  orderedQuantity: number;
}

interface ProductDateStats {
  date: string;
  orderedQuantity: number;
}

interface ProductStatsResponse {
  success: boolean;
  data: ProductStats[];
  metadata: {
    source: string;
    filters: {
      status: string;
      shippedOnly: boolean;
      dateRange: { startDate: string; endDate: string } | null;
      dayStartHour: number;
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

interface ProductShippedStatsTableProps {
  className?: string;
  onSummaryChange?: (summary: ShipmentSummary) => void;
}

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

import { getStatusColor, ORDER_STATUSES } from '@/lib/formatUtils.js';
import { formatTrackingNumberWithIcon } from "@/lib/formatUtilsJSX";

const statusOptions = ORDER_STATUSES;

// Функція для правильного відмінювання українських слів
const pluralize = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  } else {
    return many;
  }
};

export default function ProductShippedStatsTable({ className, onSummaryChange }: ProductShippedStatsTableProps) {
  const { isAdmin } = useRoleAccess();
  const { apiCall } = useApi();
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "orderedQuantity",
    direction: "descending"
  });

  // Фільтри
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("today");
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const presets = createStandardDatePresets();
    const preset = presets.find((p) => p.key === "today");
    return preset ? preset.getRange() : null;
  });

  // Фільтр по товарам
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [viewMode, setViewMode] = useState<"products" | "dates">("products");

  // Модальне вікно замовлень для конкретного товару
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [modalOrders, setModalOrders] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<{ name: string; sku: string } | null>(null);

  // Дані для режиму по датам
  const [dateStats, setDateStats] = useState<ProductDateStats[]>([]);
  const [selectedProductInfo, setSelectedProductInfo] = useState<{ name: string; sku: string } | null>(null);

  // Кешування
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{ processed: number; total: number; errors: number } | null>(null);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  // Модальне вікно вибору періоду для оновлення кешу + підтвердження оновлення всіх записів
  const cacheModals = useCacheRefreshModals({
    apiCall,
    onRefreshAll: () => refreshCache('full'),
    onRefreshPeriod: (range) => refreshCache('period', range),
  });

  // Визначення колонок в залежності від режиму
  const columns = useMemo(() => {
    if (viewMode === "dates") {
      return [
        { key: "date", label: "Дата відвантаження", sortable: true, className: "w-4/16" },
        { key: "name", label: "Назва товару", sortable: false, className: "w-8/16" },
        { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-4/16 text-center" }
      ];
    } else {
      return [
        { key: "name", label: "Назва товару", sortable: true, className: "w-10/16" },
        { key: "sku", label: "SKU", sortable: true, className: "w-3/16 text-left" },
        { key: "orderedQuantity", label: "Порції", sortable: true, className: "w-3/16 text-center" }
      ];
    }
  }, [viewMode]);

  // Клієнтський кеш за фільтрами
  const [cache, setCache] = useState<Record<string, { data: ProductStats[], totalOrders: number, timestamp: number }>>({});
  const CACHE_DURATION = 30000; // 30 секунд кешування на клієнті

  // Завантаження статистики товарів
  const firstProductStatsLoadRef = useRef(true);
  const fetchProductStats = useCallback(async (force?: boolean) => {
    // Artificial delay before first fetch to avoid race condition
    if (firstProductStatsLoadRef.current) {
      await new Promise(res => setTimeout(res, 30));
      firstProductStatsLoadRef.current = false;
    }
    // Створюємо ключ кешу на основі фільтрів
    const cacheKey = `shipped_${statusFilter}_${dateRange ? `${dateRange.start?.toString()}_${dateRange.end?.toString()}` : 'no_date'}`;

    const now = Date.now();

    // Перевіряємо клієнтський кеш для поточних фільтрів
    if (!force && cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      if (process.env.NODE_ENV === 'development') {
        console.log('📋 Using client cache for filters:', cacheKey);
      }
      const cachedData = cache[cacheKey].data;
      setProductStats(cachedData);
      if (onSummaryChange) {
        onSummaryChange({
          totalOrders: cache[cacheKey].totalOrders ?? 0,
          totalPortions: cachedData.reduce((sum, item) => sum + item.orderedQuantity, 0),
          uniqueProducts: cachedData.length,
        });
      }
      return;
    }

    setLoading(true);
    // console.log('🚀 FETCH START - force:', force, 'current filters:', { statusFilter, dateRange });

    try {
      const params = new URLSearchParams();
      params.append("shippedOnly", "true");

      if (statusFilter === "all") {
        ["1","2","3","4","5","6","7"].forEach(status => {
          params.append("status", status);
        });
      } else {
        params.append("status", statusFilter);
      }

      if (dateRange?.start && dateRange?.end) {
        // Конвертуємо CalendarDate у рядок YYYY-MM-DD
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}`;
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const queryString = params.toString();
      const url = `/api/orders/products/stats?${queryString}`;

      // Використовуємо основний endpoint з кешем
      const response = await apiCall(url);
      const data: ProductStatsResponse = await response.json();

      if (data.success) {
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 ОТРИМАНО ДАНІ:', data.data.length, 'товарів,', data.metadata.totalOrders, 'замовлень');
        }

        // Валідація даних
        const validatedData = Array.isArray(data.data) ? data.data : [];

        setProductStats(validatedData);

        // Сповіщаємо батьківський компонент про підсумкові дані
        if (onSummaryChange) {
          onSummaryChange({
            totalOrders: data.metadata.totalOrders,
            totalPortions: validatedData.reduce((sum, item) => sum + item.orderedQuantity, 0),
            uniqueProducts: validatedData.length,
          });
        }

        // Зберігаємо в клієнтський кеш
        setCache(prev => ({
          ...prev,
          [cacheKey]: { data: validatedData, totalOrders: data.metadata.totalOrders, timestamp: now }
        }));

        // Оновлюємо час останнього оновлення кешу
        setLastCacheUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching product stats:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange?.start, dateRange?.end, cache, CACHE_DURATION]);

  // Функція для завантаження статистики по датам для вибраного товару
  const fetchProductDateStats = useCallback(async (force?: boolean) => {
    if (!selectedProduct) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ fetchProductDateStats: no selectedProduct, skipping');
      }
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('📊 fetchProductDateStats called for product:', selectedProduct);
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("sku", selectedProduct);
      params.append("shippedOnly", "true");

      if (statusFilter === "all") {
        ["1","2","3","4","5","6","7"].forEach(status => {
          params.append("status", status);
        });
      } else {
        params.append("status", statusFilter);
      }

      if (dateRange?.start && dateRange?.end) {
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}`;
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const queryString = params.toString();
      const url = `/api/orders/products/stats/dates?${queryString}`;

      const response = await apiCall(url);
      const data: ProductDateStatsResponse = await response.json();

      if (data.success) {
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 ОТРИМАНІ ДАНІ ПО ДАТАМ:', data.data.length, 'днів для товару', data.product.name);
        }

        // Валідація даних
        const validatedData = Array.isArray(data.data) ? data.data : [];

        setDateStats(validatedData);
        setSelectedProductInfo(data.product);
        setViewMode("dates");
      }
    } catch (error) {
      console.error('Error fetching product date stats:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedProduct, statusFilter, dateRange?.start, dateRange?.end, apiCall]);

  // Функція для завантаження замовлень конкретного товару
  const fetchOrdersForProduct = useCallback(async (sku: string, name: string, date?: string) => {
    setSelectedProductForModal({ name, sku });
    setIsOrdersModalOpen(true);
    setModalLoading(true);
    setModalOrders([]);

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
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}`;
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const response = await apiCall(`/api/orders/products/orders?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setModalOrders(data.data);
      }
    } catch (error) {
      console.error('Error fetching product orders:', error);
      addToast({
        title: "Помилка",
        description: "Не вдалося завантажити список замовлень.",
        color: "danger",
      });
    } finally {
      setModalLoading(false);
    }
  }, [statusFilter, dateRange, apiCall]);

  // Обгортка для кнопки оновлення даних
  const handleRefreshData = useCallback(() => {
    // Очищаємо кеш для поточних фільтрів
    const cacheKey = `shipped_${statusFilter}_${dateRange ? `${dateRange.start?.toString()}_${dateRange.end?.toString()}` : 'no_date'}`;
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

	// Попередньо встановлені діапазони дат
  const datePresets = useMemo(() => createStandardDatePresets(), []);

  // Обробник зміни вибраного товару
  const handleProductChange = useCallback((sku: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 handleProductChange called with sku:', sku);
    }
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
  }, []); // Прибрали всі залежності

  // Функція скидання фільтрів
  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    const presets = createStandardDatePresets();
    const preset = presets.find((p) => p.key === "today");
    setDateRange(preset ? preset.getRange() : null);
    setDatePresetKey("today");
    setSelectedProduct("");
    setViewMode("products");
    setDateStats([]);
    setSelectedProductInfo(null);
    setCache({}); // Очищаємо весь кеш при скиданні фільтрів
  }, []);

  // Обробники для dropdown меню оновлення кеша
  const handleRefreshAllCache = () => cacheModals.openRefreshAll();
  const handleRefreshPeriodCache = () => cacheModals.openRefreshPeriod();

  const handleClearStatsCache = async () => {
    try {
      addToast({
        title: "Очищення кешу",
        description: "🗑️ Початок очищення серверного кешу статистики...",
        color: "primary",
        timeout: 3000,
      });

      const response = await apiCall('/api/orders/cache/stats/clear', {
        method: 'POST'
      });

      if (response.status === 403) {
        throw new Error('Недостатньо прав доступу. Необхідні права адміністратора.');
      }

      if (!response.ok) {
        throw new Error('Failed to clear statistics cache');
      }

      const result = await response.json();

      if (result.success) {
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Statistics cache cleared:', result.data);
        }

        addToast({
          title: "Успішно очищено",
          description: `✅ Серверний кеш статистики очищено (${result.data.entriesCleared} записів)`,
          color: "success",
          timeout: 5000,
        });

        // Очищаємо клієнтський кеш і оновлюємо дані
        setCache({});
        await fetchProductStats(true); // force = true для примусового запиту
      } else {
        throw new Error(result.error || 'Failed to clear statistics cache');
      }
    } catch (error) {
      console.error('❌ Error clearing statistics cache:', error);
      addToast({
        title: "Помилка",
        description: "❌ Помилка при очищенні серверного кешу: " + error,
        color: "danger",
        timeout: 7000,
      });
    }
  };

  // Оновлення кеша з підтримкою різних режимів
  const refreshCache = async (mode: 'full' | 'period' = 'full', periodRange?: DateRange | null) => {
    setCacheLoading(true);
    setCacheProgress(null);

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚀 Starting cache validation...');
      }

      // Показуємо повідомлення про початок оновлення
      const modeText = mode === 'full' ? 'всі записи' : 'період';
      addToast({
        title: "Початок оновлення",
        description: `🚀 Початок валідації та оновлення кеша (${modeText}). Використовується новий метод з інтелектуальною перевіркою.`,
        color: "primary",
        timeout: 3000,
      });

      // Підготовлюємо параметри для нового endpoint
      const params: any = {
        force: 'true', // Примусове оновлення всіх записів
        mode: mode     // Режим валідації
      };

      // Якщо вибрано діапазон дат, використовуємо його для фільтрації
      const rangeToUse = periodRange || (mode === 'period' ? dateRange : null);
      if (rangeToUse?.start && rangeToUse?.end) {
        params.startDate = `${rangeToUse.start.year}-${String(rangeToUse.start.month).padStart(2, '0')}-${String(rangeToUse.start.day).padStart(2, '0')}`;
        params.endDate = `${rangeToUse.end.year}-${String(rangeToUse.end.month).padStart(2, '0')}-${String(rangeToUse.end.day).padStart(2, '0')}`;
        params.mode = 'period';
      }

      // Викликаємо новий endpoint валідації кешу
      const response = await apiCall('/api/orders/cache/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      if (response.status === 403) {
        throw new Error('Недостатньо прав доступу. Необхідні права адміністратора.');
      }

      if (!response.ok) {
        throw new Error('Failed to validate cache');
      }

      const result = await response.json();

      if (result.success) {
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Cache validation completed:', result.data.stats);
        }

        // Оновлюємо час останнього оновлення кешу
        setLastCacheUpdate(new Date());

        const stats = result.data.stats;
        const summary = result.data.summary;

        // Показуємо детальне повідомлення про успішне завершення
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

        // Очищаємо клієнтський кеш і оновлюємо дані
        setCache({});
        await fetchProductStats(true); // force = true для примусового запиту
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

  // Завантаження даних при зміні фільтрів
  useEffect(() => {
    if (viewMode === "dates" && selectedProduct) {
      fetchProductDateStats();
    } else {
      fetchProductStats();
    }
  }, [fetchProductStats, viewMode, selectedProduct, statusFilter, dateRange]);



  // Ініціалізація часу останнього оновлення
  useEffect(() => {
    if (!lastCacheUpdate) {
      setLastCacheUpdate(new Date());
    }
  }, [lastCacheUpdate]);

  // Сортування даних
  const sortedItems = useMemo(() => {
    if (viewMode === "dates") {
      const items = [...dateStats];

      items.sort((a, b) => {
        const first = a[sortDescriptor.column as keyof ProductDateStats];
        const second = b[sortDescriptor.column as keyof ProductDateStats];

        let cmp = 0;

        if (sortDescriptor.column === "date") {
          cmp = a.date.localeCompare(b.date);
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

        if (typeof first === "string" && typeof second === "string") {
          cmp = first.localeCompare(second);
        } else if (typeof first === "number" && typeof second === "number") {
          cmp = first - second;
        }

        return sortDescriptor.direction === "descending" ? -cmp : cmp;
      });

      return items;
    }
  }, [productStats, dateStats, sortDescriptor, viewMode]);

  // Кольорова градація для значень (м'які кольори в стилі flat HeroUI)
  // Повертаємо об'єкт з base і content, 5 градацій, нулі — сірий текст, без фону
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
	// Червоний
		return {
			base: "bg-danger/10",
			content: "text-danger font-medium"
		};
	} else if (normalized < 0.35) {
	// Жовтий
		return {
			base: "bg-yellow-500/10",
			content: "text-yellow-700/80 font-medium"
		};
	} else if (normalized < 0.75) {
		// Жовтий
			return {
				base: "bg-lime-500/10",
				content: "text-lime-600/80 font-medium"
			};
	} else {
		// Зелений
		return {
			base: "bg-lime-500/20",
			content: "text-lime-600 font-medium"
		};
	}
  };

  // Отримання всіх значень для кожного стовпця
  const getAllOrderedQuantities = useMemo(() =>
    viewMode === "dates"
      ? dateStats.map(item => item.orderedQuantity)
      : productStats.map(item => item.orderedQuantity),
    [productStats, dateStats, viewMode]);

  // Розрахунок підсумкових значень
  const totals = useMemo(() => {
    if (viewMode === "dates") {
      return {
        orderedQuantity: dateStats.reduce((sum, item) => sum + item.orderedQuantity, 0),
      };
    } else {
      return {
        orderedQuantity: productStats.reduce((sum, item) => sum + item.orderedQuantity, 0),
      };
    }
  }, [productStats, dateStats, viewMode]);

  // Генерація опцій для вибору товару
  const productOptions = useMemo(() => {
    const options = [<SelectItem key="">Всі товари</SelectItem>];
    productStats.forEach((product) => {
      options.push(
        <SelectItem key={product.sku} textValue={`${product.name} (${product.sku})`}>
          {product.name} ({product.sku})
        </SelectItem>
      );
    });
    return options;
  }, [productStats]);

  return (
    <div className={`${className}`}>
      {/* Фільтри */}
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
            size="md"
            startContent={<DynamicIcon name="package" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10 max-w-80",
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
				if (preset) setDateRange(preset.getRange());
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

        {/* Кнопка скидання фільтрів */}
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

      {/* Прогрес кешування */}
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

      {/* Таблиця */}
      <div className="relative">
        <Table
          aria-label="Статистика відвантажених товарів"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) =>
            setSortDescriptor(descriptor as SortDescriptor)
          }
          classNames={{
            wrapper: "min-h-128 px-0 shadow-none",
            th: [
              "first:rounded-s-md",
              "last:rounded-e-md",
            ],
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
                  <TableRow 
                    key={`${selectedProductInfo?.sku || ''}-${dateItem.date}`} 
                    className="hover:bg-grey-50 cursor-pointer transition-colors duration-200"
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
              } else {
                const productItem = item as any;
                return (
                  <TableRow 
                    key={productItem.sku} 
                    className="hover:bg-grey-50 cursor-pointer transition-colors duration-200"
                    onClick={() => fetchOrdersForProduct(productItem.sku, productItem.name)}
                  >
                    <TableCell className="font-medium text-base">
                      <div className="flex items-center gap-2">
                        {productItem.name}
                        <DynamicIcon name="external-link" size={14} className="text-neutral-300" />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-base">
                      <Button 
                        size="sm" 
                        variant="light" 
                        className="font-mono text-base h-auto p-1 min-w-0 text-blue-600 hover:bg-blue-50"
                        onClick={(e) => {
                          e.stopPropagation();
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
                          base: getValueColor(productItem.orderedQuantity, getAllOrderedQuantities).base,
                          content: getValueColor(productItem.orderedQuantity, getAllOrderedQuantities).content,
                        }}
                      >
                        {productItem.orderedQuantity}
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
              <div className={`font-bold text-gray-800 ${viewMode === "dates" ? "w-12/16" : "w-13/16"} pl-3`}>
                {viewMode === "dates"
                  ? `Знайдено ${dateStats.length} днів для товару ${selectedProductInfo?.name || selectedProduct}`
                  : `Знайдено ${productStats.length} товарів`
                }
              </div>
              <div className={`text-center font-bold text-gray-800 min-w-[100px] ${viewMode === "dates" ? "w-4/16" : "w-3/16"}`}>
                {totals.orderedQuantity}
              </div>
            </div>
          </div>
        )}

        {/* Напівпрозорий бекдроп лоадера з анімацією */}
        <div
          className={`absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10 transition-all duration-300 ease-in-out ${
            loading ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
        >
          <div className="flex flex-col items-center">
            <Spinner size="lg" color="primary" />
            <span className="mt-3 text-gray-700 font-medium">Завантаження відвантажень...</span>
          </div>
        </div>
      </div>

      {/* Інформація про результати та кеш з кнопками */}
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
                <DropdownItem
                  key="clear-stats-cache"
                  onPress={handleClearStatsCache}
                  startContent={<DynamicIcon name="trash-2" size={14} />}
                  className="text-danger"
                  color="danger"
                >
                  Очистити серверний кеш
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}

          <CacheRefreshConfirmModal {...cacheModals.confirmModalProps} />
          <CachePeriodSelectModal
            {...cacheModals.periodModalProps}
            cacheLoading={cacheLoading}
          />
        </div>
      </div>

      {/* Модальне вікно з замовленнями для товару */}
      <Modal
        isOpen={isOrdersModalOpen}
        onOpenChange={setIsOrdersModalOpen}
        size="4xl"
        scrollBehavior="outside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2>
                  {modalOrders.length} {pluralize(modalOrders.length, 'замовлення', 'замовлення', 'замовлень')} для "{selectedProductForModal?.name}" 
                  <span className="bg-neutral-200/70 rounded-sm text-sm px-2 py-1 ml-2">
                    {modalOrders.reduce((sum, order) => sum + (order.productQuantity || 0), 0)} {pluralize(modalOrders.reduce((sum, order) => sum + (order.productQuantity || 0), 0), 'порція', 'порції', 'порцій')}
                  </span>
                </h2>
                <span className="text-sm font-normal text-neutral-500">
                  SKU: {selectedProductForModal?.sku}
                </span>
              </ModalHeader>
              <ModalBody>
                {modalLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Spinner size="lg" color="primary" />
                    <span className="ml-3 text-gray-600">Завантаження замовлень...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {modalOrders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <DynamicIcon name="inbox" size={48} className="text-gray-300 mb-2" />
                        <span>Немає замовлень для відображення</span>
                      </div>
                    ) : (
                      <div className="border border-neutral-200 rounded-lg overflow-hidden">
                        <Table
                          isHeaderSticky
                          aria-label="Список замовлень"
                          classNames={{
                            wrapper: "min-h-0 max-h-128 overflow-auto p-0",
                            table: "min-w-full",
                            th: ["first:rounded-s-none", "last:rounded-e-none", "bg-neutral-50", "text-neutral-600"],
                          }}
                        >
                          <TableHeader>
                            <TableColumn className="text-sm font-medium">№</TableColumn>
                            <TableColumn className="text-sm font-medium">ТТН</TableColumn>
                            <TableColumn className="text-sm font-medium">Оформлено</TableColumn>
                            <TableColumn className="text-sm font-medium">Відвантажено</TableColumn>
                            <TableColumn className="text-sm font-medium">Статус</TableColumn>
                            <TableColumn className="text-sm font-medium text-center">Порцій</TableColumn>
                            <TableColumn className="text-sm font-medium text-right">Сума</TableColumn>
                            <TableColumn className="text-sm font-medium text-center">Дії</TableColumn>
                          </TableHeader>
                          <TableBody items={modalOrders}>
                            {(order) => (
                              <TableRow key={order.externalId} className="hover:bg-grey-50 transition-colors duration-200">
                                <TableCell className="font-medium text-sm">
                                  {order.orderNumber}
                                </TableCell>
                                <TableCell className="font-medium text-sm">
                                  {order.ttn && formatTrackingNumberWithIcon(order.ttn, {
                                    compactMode: true,
                                    boldLastGroup: true,
                                    showIcon: false
                                  })}
                                </TableCell>
                                <TableCell className="text-sm text-neutral-600">
                                  {formatDate(order.orderDate)}
                                </TableCell>
																<TableCell className="text-sm text-neutral-600">
                                  {formatDate(order.dilovodSaleExportDate)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {order.dilovodReturnDate ? (
                                    <Tooltip color="secondary" content={`Повернено ${formatDate(order.dilovodReturnDate)}`}>
                                      <Chip
                                        size="sm"
                                        variant="flat"
                                        className="text-xs"
                                        classNames={{
                                          base: getStatusColor(order.status),
                                        }}
                                      >
                                        {order.statusText}
                                      </Chip>
                                    </Tooltip>
                                  ) : (
                                    <Chip
                                      size="sm"
                                      variant="flat"
                                      className="text-xs"
                                      classNames={{
                                        base: getStatusColor(order.status),
                                      }}
                                    >
                                      {order.statusText}
                                    </Chip>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-sm font-semibold">
                                  {order.productQuantity}
                                </TableCell>
                                <TableCell className="text-right text-sm text-neutral-600">
                                  {order.totalPrice !== undefined && order.totalPrice !== null
                                    ? Number(order.totalPrice).toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 }).replace(/\s?грн\.?|UAH|₴/gi, '')
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="primary"
                                    className="h-8 min-w-0 px-2"
                                    onPress={() => window.open(`/orders/${order.externalId}`, '_blank')}
                                  >
                                    <DynamicIcon name="eye" size={16} />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
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
    </div>
  );
}
