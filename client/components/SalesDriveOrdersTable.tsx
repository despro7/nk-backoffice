import React, { useState, useEffect, useCallback } from "react";
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
  Input,
  Pagination,
  Tooltip,
  ButtonGroup,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  useDisclosure,
  DateRangePicker,
  Card,
  CardBody,
  Switch,
} from "@heroui/react";
import { I18nProvider } from '@react-aria/i18n';
import type { DateRange } from "@react-types/datepicker";
import { useApi } from "../hooks/useApi";
import { useDilovodSettings } from "../hooks/useDilovodSettings";
import { useAuth } from "../contexts/AuthContext";
import { useDebug } from "../contexts/DebugContext";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusLabel, getStatusColor, getChannelClass, ORDER_STATUSES } from "../lib/formatUtils";
import { ToastService } from "@/services/ToastService";
import ResultDrawer from './ResultDrawer';
import type { SalesDriveOrderForExport, SalesDriveOrdersResponse, } from "@shared/types/salesdrive";
import type { SalesChannel } from "@shared/types/dilovod";

// Функція для отримання класів каналу (статична — кольори визначаються по id)
// Перенесено до client/lib/formatUtils.ts → getChannelClass

interface SalesDriveOrdersTableProps {
  className?: string;
}

export default function SalesDriveOrdersTable({ className }: SalesDriveOrdersTableProps) {
  const { apiCall } = useApi();
  const { user } = useAuth();
  const { isDebugMode } = useDebug();
  const { settings: dilovodSettings } = useDilovodSettings({ loadDirectories: false });

  // State для каналів продажів (завантажуються з API)
  const [salesChannels, setSalesChannels] = useState<SalesChannel[]>([]);

  // Функція для отримання назви каналу (залежить від динамічного списку)
  const getChannelName = useCallback((channelId: string | null | undefined): string => {
    if (!channelId) return '⚠️ Невідомо';
    const found = salesChannels.find(ch => ch.id === channelId);
    if (found) return found.name;
    return `Канал ${channelId}`;
  }, [salesChannels]);

  // State для даних
  const [orders, setOrders] = useState<SalesDriveOrderForExport[]>([]);
  const [loading, setLoading] = useState(true);

  // State для універсального Drawer з результатами
  const { isOpen: isDrawerOpen, onOpen: onDrawerOpen, onOpenChange: onDrawerOpenChange } = useDisclosure();
  const [drawerResult, setDrawerResult] = useState<any>(null);
  const [drawerTitle, setDrawerTitle] = useState<string>('Результат операції');
  const [drawerType, setDrawerType] = useState<'result' | 'logs' | 'orderDetails'>('result');

  // State для вибраних замовлень (чекбокси)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  // State для авто-перевірки (ліміт та offset)
  const [autoCheckLimit, setAutoCheckLimit] = useState(100);
  const [autoCheckOffset, setAutoCheckOffset] = useState(0);
  const [isAutoChecking, setIsAutoChecking] = useState(false);
  const [autoCheckForceAll, setAutoCheckForceAll] = useState(false);

  // State для пагінації
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State для пошуку
  const [search, setSearch] = useState("");
  type SearchCategory = 'orderNumber' | 'ttn' | 'phone' | 'name' | 'all';
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('orderNumber');

  // State для фільтру каналів (ініціалізується порожнім, оновлюється після завантаження каналів)
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  // Опції статусів для фільтру (без "all", "id3" та "Видалено")
  const statusOptions = ORDER_STATUSES
    .filter(s => s.key !== 'all' && s.key !== 'id3' && s.key !== '8')
    .map(s => ({
      value: s.key,
      label: s.label,
      icon: {
        '1': 'circle-dashed',
        '2': 'circle-check',
        '3': 'package-check',
        '4': 'truck',
        '5': 'badge-check',
        '6': 'rotate-ccw',
        '7': 'ban',
        '9': 'pause-circle',
      }[s.key] ?? 'circle',
    }));

  // State для фільтру статусів ('all' = всі статуси)
  type StatusFilterType = 'all' | string;
  const [selectedStatus, setSelectedStatus] = useState<StatusFilterType>('all');

  // State для фільтру по даті відвантаження
  type ShipmentFilterType = 'all' | 'shipped' | 'not_shipped' | 'duplicates';
  const [shipmentFilter, setShipmentFilter] = useState<ShipmentFilterType>('all');

  // State для фільтру по конкретним датам відвантаження (DateRangePicker)
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // Локальний кеш token'ів для sale (отримуємо його після експорту)
  const [saleTokens, setSaleTokens] = useState<Record<string, string>>({});

  // Кількість замовлень по кожному статусу (оновлюється разом з fetchOrders)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Функція для завантаження замовлень
  const fetchOrders = useCallback(async () => {
    // Якщо не вибрано жодного каналу - не завантажуємо замовлення
    if (selectedChannels.size === 0) {
      setOrders([]);
      setTotalPages(0);
      setTotalCount(0);
      setSelectedOrderIds([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        sortBy: 'orderDate',
        sortOrder: 'desc'
      });

      if (search) {
        params.append('search', search);
        params.append('searchCategory', searchCategory);
      }

      // Додаємо фільтр каналів (завжди передаємо, бо перевірили вище)
      // Якщо вибрано 'unknown', то також шукаємо замовлення з пустим/null sajt
      const channelsArray = Array.from(selectedChannels);
      const hasUnknown = channelsArray.includes('unknown');
      const filteredChannels = channelsArray.filter(ch => ch !== 'unknown');
      
      if (filteredChannels.length > 0) {
        params.append('channels', filteredChannels.join(','));
      }
      if (hasUnknown) {
        params.append('includeUnknown', 'true');
      }

      // Додаємо фільтр по даті відвантаження
      if (shipmentFilter === 'shipped') {
        params.append('shipmentStatus', 'shipped');
      } else if (shipmentFilter === 'not_shipped') {
        params.append('shipmentStatus', 'not_shipped');
      } else if (shipmentFilter === 'duplicates') {
        params.append('shipmentStatus', 'duplicates');
      }

      // Додаємо фільтр по датам відвантаження (DateRange)
      if (dateRange?.start && dateRange?.end) {
        const startDate = `${dateRange.start.year}-${String(dateRange.start.month).padStart(2, '0')}-${String(dateRange.start.day).padStart(2, '0')}`;
        const endDate = `${dateRange.end.year}-${String(dateRange.end.month).padStart(2, '0')}-${String(dateRange.end.day).padStart(2, '0')}`;
        params.append('shipmentDateFrom', startDate);
        params.append('shipmentDateTo', endDate);
      }

      // Додаємо фільтр по статусу (якщо не "всі")
      if (selectedStatus !== 'all') {
        params.append('statuses', selectedStatus);
      }

      const response = await apiCall(`/api/dilovod/salesdrive/orders?${params}`);
      const data: SalesDriveOrdersResponse = await response.json();

      if (data.success) {
        setOrders(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.pagination.totalCount);
        setStatusCounts(data.statusCounts ?? {});
        setSelectedOrderIds([]);
      } else {
        console.error('Failed to fetch orders:', data);
        ToastService.show({
          title: 'Помилка',
          description: 'Не вдалося завантажити замовлення',
          color: 'danger'
        });
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка при завантаженні замовлень',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, searchCategory, selectedChannels, shipmentFilter, dateRange, selectedStatus]);

  // Завантажуємо дані під час монтування та зміни параметрів
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Завантажуємо канали продажів з API при монтуванні
  useEffect(() => {
    apiCall('/api/salesdrive/channels')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          const channels: SalesChannel[] = [
            ...data.data,
            { id: 'unknown', name: '⚠️ Невідомо' },
          ];
          setSalesChannels(channels);
          setSelectedChannels(new Set(channels.map((ch: SalesChannel) => ch.id)));
        }
      })
      .catch(err => console.error('Failed to fetch sales channels:', err));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Скидаємо сторінку на 1 при зміні пошуку або фільтрів
  useEffect(() => {
    setPage(1);
  }, [search, searchCategory, selectedChannels, shipmentFilter, dateRange, selectedStatus, pageSize]);

  // Обробка пошуку
  const handleSearchSubmit = () => {
    setPage(1);
    fetchOrders();
  };

  // Обробка клавіші Enter у пошуку
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  // Функція скидання всіх фільтрів
  const resetFilters = useCallback(() => {
    setSearch("");
    setSearchCategory('orderNumber');
    setSelectedChannels(new Set(salesChannels.map(ch => ch.id)));
    setShipmentFilter('all');
    setDateRange(null);
    setSelectedStatus('all');
    setSelectedOrderIds([]);
    setPage(1);
  }, [salesChannels]);

  // Перевірка чи активні якісь фільтри
  const hasActiveFilters = useCallback(() => {
    const defaultChannels = new Set(salesChannels.map(ch => ch.id));
    const channelsChanged = selectedChannels.size !== defaultChannels.size || 
      ![...selectedChannels].every(ch => defaultChannels.has(ch));

    return search !== "" || 
           channelsChanged || 
           shipmentFilter !== 'all' || 
           dateRange !== null ||
           selectedStatus !== 'all';
  }, [search, selectedChannels, shipmentFilter, dateRange, selectedStatus, salesChannels]);

  // Масова перевірка/оновлення статусів документів
  const handleBulkCheckAndUpdate = async () => {

    // Масова перевірка тільки для вибраних замовлень
    const filteredOrders = orders.filter(order => selectedOrderIds.includes(String(order.id)));

    if (filteredOrders.length === 0) {
      ToastService.show({
        title: 'Немає вибраних замовлень для перевірки',
        description: 'Виберіть замовлення для масової перевірки',
        color: 'warning'
      });
      return;
    }

    ToastService.show({
      title: 'Масова перевірка...',
      description: `Перевіряємо ${filteredOrders.length} вибраних замовлень у Dilovod`,
      color: 'primary',
      hideIcon: false,
      icon: <DynamicIcon name="text-search" size={16} strokeWidth={1.5} className="shrink-0" />,
      timeout: 2000
    });

    // Використовуємо orderNumber безпосередньо (вони вже в правильному форматі в БД)
    const orderNumbers = filteredOrders.map(order => order.orderNumber);

    try {
      // Звертаємося до API Dilovod для масової перевірки замовлень - server\routes\dilovod.ts
      const response = await apiCall('/api/dilovod/salesdrive/orders/check', {
        method: 'POST',
        body: JSON.stringify({
          orderNumbers: orderNumbers
        })
      });
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        setDrawerResult(result);
        setDrawerTitle('Результат масової перевірки замовлень');
        setDrawerType('result');
        onDrawerOpen();

        // Перемальовуємо таблицю завжди після перевірки
        fetchOrders();
      } else {
        setDrawerResult(result);
        setDrawerTitle('Помилки масової перевірки замовлень');
        setDrawerType('result');
        onDrawerOpen();

        ToastService.show({
          title: 'Помилка',
          description: result.error || 'Помилка масової перевірки',
          color: 'danger',
          hideIcon: false,
          icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger',
        hideIcon: false,
        icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
      });
    }
  };

  // Перевірка/оновлення статусу замовлення в Діловоді
  const handleCheckInDilovod = async (order: SalesDriveOrderForExport) => {
    try {
      // Надсилаємо запит до API Dilovod для перевірки замовлення - server\routes\dilovod.ts
      const response = await apiCall(`/api/dilovod/salesdrive/orders/check`, {
        method: 'POST',
        body: JSON.stringify({
          orderNumbers: [order.orderNumber]
        })
      });
      const result = await response.json();

      // console.log('Результат перевірки замовлення в Діловоді:', result);

      if (result.success && Array.isArray(result.data)) {
        setDrawerResult(result);
        setDrawerTitle('Результат перевірки замовлення в Діловоді');
        setDrawerType('result');
        onDrawerOpen();

        if (result.data.length === 0) {
          ToastService.show({
            title: 'Документи не знайдені',
            description: 'Жодного документа не було знайдено або завантажено в Діловод',
            color: 'danger'
          });
        } else {
          ToastService.show({
            title: 'Перевірено',
            description: `Перевірку завершено для замовлення ${order.orderNumber}`,
            color: 'success',
            hideIcon: false,
            icon: <DynamicIcon name="check-circle" size={20} className="shrink-0" />
          });
          fetchOrders();
        }
      } else {
        console.log('Деталі помилок перевірки:', result.errors);
        setDrawerResult(result);
        setDrawerTitle('Помилка перевірки замовлення в Діловоді');
        setDrawerType('result');
        onDrawerOpen();

        ToastService.show({
          title: 'Помилка',
          description: result.error || 'Помилка перевірки в Діловоді',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger'
      });
    }
  };

  // Примусове скидання Dilovod-полів + повторна перевірка
  const handleForceRecheck = async (order: SalesDriveOrderForExport) => {
    try {
      ToastService.show({
        title: 'Примусова перевірка...',
        description: `Скидання даних та перевірка замовлення ${order.orderNumber} в Діловоді`,
        color: 'warning',
        hideIcon: false,
        icon: <DynamicIcon name="refresh-ccw-dot" size={16} strokeWidth={1.5} className="shrink-0" />,
        timeout: 3000
      });

      const response = await apiCall('/api/dilovod/salesdrive/orders/reset-and-check', {
        method: 'POST',
        body: JSON.stringify({ orderNumbers: [order.orderNumber] })
      });
      const result = await response.json();

      if (result.success) {
        setDrawerResult(result);
        setDrawerTitle(`Примусова перевірка: ${order.orderNumber}`);
        setDrawerType('result');
        onDrawerOpen();
        fetchOrders();
      } else {
        ToastService.show({
          title: 'Помилка примусової перевірки',
          description: result.message || 'Не вдалося виконати операцію',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger'
      });
    }
  };

  const handleResetDuplicateError = async (order: SalesDriveOrderForExport) => {
    try {
      const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/reset-duplicate-count`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        ToastService.show({
          title: 'Скинуто',
          description: `Лічильник дублів для ${order.orderNumber} скинуто до 1`,
          color: 'success',
          hideIcon: false,
          icon: <DynamicIcon name="shield-check" size={16} strokeWidth={1.5} className="shrink-0" />,
          timeout: 4000
        });
        fetchOrders();
      } else {
        ToastService.show({
          title: 'Помилка',
          description: result.message || result.error || 'Не вдалося скинути лічильник',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger'
      });
    }
  };

  // Показати деталі замовлення
  const handleShowDetails = (order: SalesDriveOrderForExport) => {
    // Prepare order data for display (parse JSON fields)
    const orderData = {
      ...order,
      items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
      rawData: typeof order.rawData === 'string' ? JSON.parse(order.rawData) : order.rawData
    };

    setDrawerResult(orderData);
    setDrawerTitle(`Деталі замовлення ${order.orderNumber}`);
    setDrawerType('orderDetails');
    onDrawerOpen();
  };

  // Вивантаження замовлення в Діловод з попередньою валідацією
  const handleExportOrder = async (order: SalesDriveOrderForExport) => {
    try {
      // Спочатку робимо валідацію
      const validateResponse = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/validate`, {
        method: 'POST'
      });
      const validateResult = await validateResponse.json();

      // Якщо валідація не пройшла
      if (!validateResponse.ok || !validateResult.success) {
        if (validateResult.type === 'critical_validation_error') {
          // Показуємо Drawer з критичними помилками валідації
          setDrawerResult(validateResult);
          setDrawerTitle('Помилка конфігурації Dilovod');
          setDrawerType('result');
          onDrawerOpen();
          return;
        } else {
          throw new Error(validateResult.details || 'Помилка валідації');
        }
      }

      // Валідація пройшла, якщо сервер повернув токен — збережемо для експорту
      const token = validateResult?.metadata?.token;

      // Валідація пройшла, продовжуємо з експортом
      ToastService.show({
        title: 'Експорт...',
        description: `Експортуємо замовлення ${order.orderNumber} в Діловод`,
        color: 'primary',
        hideIcon: false,
        icon: <DynamicIcon name="upload-cloud" size={20} className="shrink-0" />,
        timeout: 1500
      });

      // Якщо маємо валідаторний токен — пересилаємо його, і сервер повторно не створить контрагента
      const exportBody = token ? { token } : undefined;
      const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/export`, {
        method: 'POST',
        body: exportBody ? JSON.stringify(exportBody) : undefined
      });
      const result = await response.json();

      if (result.success) {
        // setDrawerResult(result);
        // setDrawerTitle('Результат експорту замовлення в Діловод');
        // setDrawerType('result');
        // onDrawerOpen();
        // Якщо не експортовано жодного документа
        if (!result.exported) {
          // Early-exit: замовлення вже було в Dilovod (є dilovodId) — оновлюємо таблицю
          if (result.dilovodId) {
            ToastService.show({
              title: 'Вже в Діловоді',
              description: result.message || `Замовлення ${order.orderNumber} вже експортовано раніше`,
              color: 'warning',
              hideIcon: false,
              icon: <DynamicIcon name="triangle-alert" size={20} className="shrink-0" />,
              timeout: 4000
            });
            fetchOrders();
          } else {
            ToastService.show({
              title: 'Не вивантажено!',
              description: result.error || result.message || 'Жодного документа не було експортовано в Діловод',
              color: 'danger',
              hideIcon: false,
              icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
            });
          }
        } else {
          // Якщо був створений новий документ (є dilovodId або dilovodExportDate)
          if (result.dilovodId || result.dilovodExportDate) {
            ToastService.show({
              title: 'Успішно!',
              description: result.message || 'Замовлення успішно експортовано в Діловод',
              color: 'success'
            });
            fetchOrders();
            // Якщо сервер повернув saleToken — збережемо для створення shipment
            const saleToken = result?.metadata?.saleToken;
            if (saleToken) {
              setSaleTokens(prev => ({ ...prev, [order.id]: saleToken }));
            }
          } else {
            ToastService.show({
              title: 'Без змін',
              description: 'Замовлення вже було актуальним у Діловоді, змін не внесено',
              color: 'default',
              hideIcon: false,
              icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
            });
          }
        }
      } else if (result.error === 'already_exists_in_dilovod') {
        // Замовлення вже існує в Dilovod — виявлено при live-перевірці API перед експортом
        ToastService.show({
          title: 'Вже існує в Діловоді',
          description: result.message || 'Замовлення вже є в Dilovod. Локальну БД синхронізовано.',
          color: 'warning',
          hideIcon: false,
          icon: <DynamicIcon name="triangle-alert" size={20} className="shrink-0" />
        });
        // Оновлюємо таблицю — БД вже синхронізована сервером
        fetchOrders();
      } else {
        setDrawerResult(result);
        setDrawerTitle('Помилка експорту замовлення в Діловод');
        setDrawerType('result');
        onDrawerOpen();
        ToastService.show({
          title: 'Помилка',
          description: result.error || result.message || 'Помилка вивантаження',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger'
      });
    }
  };

  // Створення документа відвантаження в Діловоді
  const handleCreateShipment = async (order: SalesDriveOrderForExport) => {
    try {
      ToastService.show({
        title: 'Створення...',
        description: `Створюємо документ відвантаження для ${order.orderNumber}`,
        color: 'primary',
        hideIcon: false,
        icon: <DynamicIcon name="upload-cloud" size={20} className="shrink-0" />
      });

      const token = saleTokens?.[order.id];
      const body = token ? JSON.stringify({ token }) : undefined;

      const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/shipment`, {
        method: 'POST',
        body
      });
      const result = await response.json();

      if (result.success && result.created) {
        ToastService.show({
          title: 'Успішно!',
          description: result.message,
          color: 'success'
        });
        // Оновлюємо дані після створення документа
        fetchOrders();

        // token — одноразовий, видалимо локально
        if (token) setSaleTokens(prev => { const copy = { ...prev }; delete copy[order.id]; return copy; });
      } else if (result.error === 'already_shipped_in_dilovod' || result.error === 'Already shipped') {
        // Документ вже є в Dilovod (виявлено при перевірці API або з локальної БД)
        ToastService.show({
          title: 'Вже відвантажено',
          description: result.message || 'Документ відвантаження вже існує в Dilovod',
          color: 'warning',
          hideIcon: false,
          icon: <DynamicIcon name="triangle-alert" size={20} className="shrink-0" />
        });
        // Оновлюємо таблицю — БД вже синхронізована сервером
        fetchOrders();
      } else {
        ToastService.show({
          title: 'Помилка',
          description: result.error || result.message || 'Помилка створення документу',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger'
      });
    }
  };

  // Масова функція тільки експорту
  const handleBulkExport = async () => {
    if (!selectedOrderIds.length) return;
    ToastService.show({
      title: 'Масовий експорт...',
      description: `Виконується експорт для ${selectedOrderIds.length} замовлень`,
      color: 'primary',
      hideIcon: false,
      icon: <DynamicIcon name="upload-cloud" size={20} className="shrink-0" />,
      timeout: 2000
    });

    const results: Array<{
      orderNumber: string,
      exportSuccess: boolean,
      shipmentSuccess: boolean,
      errors: string[]
    }> = [];

    for (const orderId of selectedOrderIds) {
      const order = orders.find(o => String(o.id) === String(orderId));
      if (!order) continue;
      let exportSuccess = false;
      const errors: string[] = [];

      try {
        const validateResponse = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/validate`, { method: 'POST' });
        const validateResult = await validateResponse.json();
        if (!validateResponse.ok || !validateResult.success) {
          errors.push(validateResult.details || 'Помилка валідації');
          ToastService.show({
            title: `Помилка валідації (${order.orderNumber})`,
            description: validateResult.details || 'Помилка',
            color: 'danger',
            hideIcon: false,
            icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
          });
          results.push({ orderNumber: order.orderNumber, exportSuccess, shipmentSuccess: false, errors });
          continue;
        }
        const token = validateResult?.metadata?.token;
        const exportBody = token ? { token } : undefined;
        const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/export`, {
          method: 'POST',
          body: exportBody ? JSON.stringify(exportBody) : undefined
        });
        const result = await response.json();
        if (result.success && result.exported && (result.dilovodId || result.dilovodExportDate)) {
          exportSuccess = true;
          ToastService.show({
            title: `Експортовано (${order.orderNumber})`,
            description: result.message || 'Успішно',
            color: 'success',
            hideIcon: false,
            icon: <DynamicIcon name="check-circle" size={20} className="shrink-0" />,
            timeout: 1500
          });
        } else {
          errors.push(result.error || result.message || 'Помилка експорту');
          ToastService.show({
            title: `Помилка експорту (${order.orderNumber})`,
            description: result.error || result.message || 'Помилка',
            color: 'danger',
            hideIcon: false,
            icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
            timeout: 1500
          });
        }
      } catch {
        errors.push('Помилка зʼєднання при експорті');
        ToastService.show({
          title: `Помилка зʼєднання (${order.orderNumber})`,
          description: 'Помилка зʼєднання при експорті',
          color: 'danger',
          hideIcon: false,
          icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
        });
      }
      results.push({ orderNumber: order.orderNumber, exportSuccess, shipmentSuccess: false, errors });
    }

    setDrawerResult({ bulkExportResults: results });
    setDrawerTitle('Результати масового експорту');
    setDrawerType('result');
    onDrawerOpen();
    fetchOrders();
    setSelectedOrderIds([]);
  };

  // Масова функція тільки відвантаження
  const handleBulkShipment = async () => {
    if (!selectedOrderIds.length) return;
    ToastService.show({
      title: 'Масове відвантаження...',
      description: `Виконується відвантаження для ${selectedOrderIds.length} замовлень`,
      color: 'primary',
      hideIcon: false,
      icon: <DynamicIcon name="truck" size={20} className="shrink-0" />,
      timeout: 2000
    });

    const results: Array<{
      orderNumber: string,
      exportSuccess: boolean,
      shipmentSuccess: boolean,
      errors: string[]
    }> = [];

    for (const orderId of selectedOrderIds) {
      const order = orders.find(o => String(o.id) === String(orderId));
      if (!order) continue;
      let shipmentSuccess = false;
      const errors: string[] = [];

      try {
        const token = saleTokens?.[order.id];
        const body = token ? JSON.stringify({ token }) : undefined;
        const shipmentRes = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/shipment`, {
          method: 'POST',
          body
        });
        const shipmentResult = await shipmentRes.json();
        if (shipmentResult.success && shipmentResult.created) {
          shipmentSuccess = true;
          ToastService.show({
            title: `Відвантажено (${order.orderNumber})`,
            description: shipmentResult.message || 'Успішно',
            color: 'success',
            hideIcon: false,
            icon: <DynamicIcon name="check-circle" size={20} className="shrink-0" />,
            timeout: 1500
          });
          if (token) setSaleTokens(prev => { const copy = { ...prev }; delete copy[order.id]; return copy; });
        } else {
          errors.push(shipmentResult.error || shipmentResult.message || 'Помилка відвантаження');
          ToastService.show({
            title: `Помилка відвантаження (${order.orderNumber})`,
            description: shipmentResult.error || shipmentResult.message || 'Помилка',
            color: 'danger',
            hideIcon: false,
            icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
            timeout: 1500
          });
        }
      } catch {
        errors.push('Помилка зʼєднання при відвантаженні');
        ToastService.show({
          title: `Помилка зʼєднання (${order.orderNumber})`,
          description: 'Помилка зʼєднання при відвантаженні',
          color: 'danger',
          hideIcon: false,
          icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
        });
      }
      results.push({ orderNumber: order.orderNumber, exportSuccess: false, shipmentSuccess, errors });
    }

    setDrawerResult({ bulkExportResults: results });
    setDrawerTitle('Результати масового відвантаження');
    setDrawerType('result');
    onDrawerOpen();
    fetchOrders();
    setSelectedOrderIds([]);
  };

  // Масова функція експорту + відвантаження
  const handleBulkExportAndShipment = async () => {
    if (!selectedOrderIds.length) return;
    ToastService.show({
      title: 'Масовий експорт...',
      description: `Виконується експорт та відвантаження для ${selectedOrderIds.length} замовлень`,
      color: 'primary',
      hideIcon: false,
      icon: <DynamicIcon name="upload-cloud" size={20} className="shrink-0" />,
      timeout: 2000
    });

    const results: Array<{
      orderNumber: string,
      exportSuccess: boolean,
      shipmentSuccess: boolean,
      errors: string[]
    }> = [];

    for (const orderId of selectedOrderIds) {
      const order = orders.find(o => String(o.id) === String(orderId));
      if (!order) continue;
      let exportSuccess = false;
      let shipmentSuccess = false;
      const errors: string[] = [];

      // Експорт
      try {
        const validateResponse = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/validate`, { method: 'POST' });
        const validateResult = await validateResponse.json();
        if (!validateResponse.ok || !validateResult.success) {
          errors.push(validateResult.details || 'Помилка валідації');
          ToastService.show({
            title: `Помилка валідації (${order.orderNumber})`,
            description: validateResult.details || 'Помилка',
            color: 'danger',
            hideIcon: false,
            icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
          });
          results.push({
            orderNumber: order.orderNumber,
            exportSuccess,
            shipmentSuccess,
            errors
          });
          continue;
        }
        const token = validateResult?.metadata?.token;
        const exportBody = token ? { token } : undefined;
        const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/export`, {
          method: 'POST',
          body: exportBody ? JSON.stringify(exportBody) : undefined
        });
        const result = await response.json();
        if (result.success && result.exported && (result.dilovodId || result.dilovodExportDate)) {
          exportSuccess = true;
          ToastService.show({
            title: `Експортовано (${order.orderNumber})`,
            description: result.message || 'Успішно',
            color: 'success',
            hideIcon: false,
            icon: <DynamicIcon name="check-circle" size={20} className="shrink-0" />,
            timeout: 1500
          });
        } else {
          errors.push(result.error || result.message || 'Помилка експорту');
          ToastService.show({
            title: `Помилка експорту (${order.orderNumber})`,
            description: result.error || result.message || 'Помилка',
            color: 'danger',
            hideIcon: false,
            icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
            timeout: 1500
          });
          results.push({
            orderNumber: order.orderNumber,
            exportSuccess,
            shipmentSuccess,
            errors
          });
          continue;
        }
        // Відвантаження
        const saleToken = result?.metadata?.saleToken;
        if (saleToken) {
          try {
            const shipmentRes = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/shipment`, {
              method: 'POST',
              body: JSON.stringify({ token: saleToken })
            });
            const shipmentResult = await shipmentRes.json();
            if (shipmentResult.success && shipmentResult.created) {
              shipmentSuccess = true;
              ToastService.show({
                title: `Відвантажено (${order.orderNumber})`,
                description: shipmentResult.message || 'Успішно',
                color: 'success',
                hideIcon: false,
                icon: <DynamicIcon name="check-circle" size={20} className="shrink-0" />,
                timeout: 1500
              });
            } else {
              errors.push(shipmentResult.error || shipmentResult.message || 'Помилка відвантаження');
              ToastService.show({
                title: `Помилка відвантаження (${order.orderNumber})`,
                description: shipmentResult.error || shipmentResult.message || 'Помилка',
                color: 'danger',
                hideIcon: false,
                icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
                timeout: 1500
              });
            }
          } catch {
            errors.push('Помилка зʼєднання при відвантаженні');
            ToastService.show({
              title: `Помилка зʼєднання (${order.orderNumber})`,
              description: 'Помилка зʼєднання при відвантаженні',
              color: 'danger',
              hideIcon: false,
              icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
            });
          }
        }
      } catch {
        errors.push('Помилка зʼєднання при експорті');
        ToastService.show({
          title: `Помилка зʼєднання (${order.orderNumber})`,
          description: 'Помилка зʼєднання при експорті',
          color: 'danger',
          hideIcon: false,
          icon: <DynamicIcon name="x-circle" size={20} className="shrink-0" />,
        });
      }
      results.push({
        orderNumber: order.orderNumber,
        exportSuccess,
        shipmentSuccess,
        errors
      });
    }

    // Drawer з фінальним звітом
    setDrawerResult({ bulkExportResults: results });
    setDrawerTitle('Результати масового експорту та відвантаження');
    setDrawerType('result');
    onDrawerOpen();
    fetchOrders();
    setSelectedOrderIds([]);
  };

  // Масова примусова перевірка (скидання полів + перевірка в Діловоді)
  const handleBulkForceRecheck = async () => {
    if (!selectedOrderIds.length) return;
    const filteredOrders = orders.filter(order => selectedOrderIds.includes(String(order.id)));
    const orderNumbers = filteredOrders.map(order => order.orderNumber);

    ToastService.show({
      title: 'Масова примусова перевірка...',
      description: `Скидання та перевірка ${filteredOrders.length} замовлень у Діловоді`,
      color: 'warning',
      hideIcon: false,
      icon: <DynamicIcon name="rotate-ccw" size={16} strokeWidth={1.5} className="shrink-0" />,
      timeout: 2000
    });

    try {
      const response = await apiCall('/api/dilovod/salesdrive/orders/reset-and-check', {
        method: 'POST',
        body: JSON.stringify({ orderNumbers })
      });
      const result = await response.json();

      if (result.success) {
        setDrawerResult(result);
        setDrawerTitle(`Масова примусова перевірка (${filteredOrders.length} замовлень)`);
        setDrawerType('result');
        onDrawerOpen();
        fetchOrders();
        setSelectedOrderIds([]);
      } else {
        ToastService.show({
          title: 'Помилка примусової перевірки',
          description: result.message || 'Не вдалося виконати операцію',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка зʼєднання з сервером',
        color: 'danger'
      });
    }
  };

  // Обробник для підрахунку логів для замовлення
  const getOrderLogsCount = async (orderNumber: string): Promise<number> => {
    try {
      if (!orderNumber)
        return 0;

      const res = await apiCall(`/api/meta-logs/count?orderNumber=${encodeURIComponent(orderNumber)}`);
      if (!res.ok)
        return 0;

      const data = await res.json();

      return Number(data.count || 0);
    } catch {
      return 0;
    }
  };

  // Обробник для отримання та показу логів
  const handleViewOrderLogs = async (order: SalesDriveOrderForExport) => {
    setLoading(true);
    try {
      // API call to fetch logs for this order
      const res = await apiCall(`/api/meta-logs?orderNumber=${encodeURIComponent(order.orderNumber)}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setDrawerResult(data);
        setDrawerTitle(`Логи експорту замовлення ${order.orderNumber}`);
        setDrawerType('logs');
        onDrawerOpen();
      } else {
        ToastService.show({
          title: 'Немає логів',
          description: 'Для цього замовлення логи експорту не знайдено',
          color: 'default'
        });
      }
    } catch (e) {
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося отримати логи експорту',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  // Автономна перевірка статусів (Step-by-Step Stage 2)
  const handleAutoBulkCheck = async () => {
    try {
      setIsAutoChecking(true);
      ToastService.show({
        title: 'Запуск авто-перевірки',
        description: `Запит на перевірку до ${autoCheckLimit} замовлень${autoCheckOffset > 0 ? `, пропускаємо перші ${autoCheckOffset}` : ''}${autoCheckForceAll ? ' (всі, включно з повними)' : ''}`,
        color: 'secondary',
        hideIcon: false,
        icon: <DynamicIcon name="search-check" size={16} strokeWidth={1.5} className="shrink-0" />,
      });

      const response = await apiCall('/api/dilovod/salesdrive/orders/check', {
        method: 'POST',
        body: JSON.stringify({
          auto: true,
          limit: autoCheckLimit,
          offset: autoCheckOffset,
          forceAll: autoCheckForceAll
        })
      });
      const result = await response.json();

      if (result.success) {
        setDrawerResult(result);
        setDrawerTitle('Результат автоматичної перевірки');
        setDrawerType('result');
        onDrawerOpen();

        // Перемальовуємо таблицю завжди після авто-перевірки
        fetchOrders();
      } else {
        ToastService.show({
          title: 'Помилка авто-перевірки',
          description: result.message || 'Не вдалося виконати операцію',
          color: 'danger'
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger'
      });
    } finally {
      setIsAutoChecking(false);
    }
  };

  // Utility: Copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    ToastService.show({
      title: 'Скопійовано',
      description: `Скопійовано "${text}" у буфер обміну`,
      color: 'success'
    });
  };

  // Колонки таблиці
  const columns = [
    { key: "orderNumber", label: "№ замовлення", sortable: false },
    { key: "orderDate", label: "Дата оформлення", sortable: false },
    { key: "status", label: "Статус", sortable: false },
    { key: "paymentMethod", label: "Оплата", sortable: false },
    // { key: "shippingMethod", label: "Доставка", sortable: false },
    { key: "sajt", label: "Канал", sortable: false },
    { key: "dilovodExportDate", label: "Додано в Діловод", sortable: false },
    { key: "actions", label: "Дії", sortable: false }
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex gap-3 items-center justify-between">
        {/* Панель пошуку */}
        <div className="flex items-center max-w-[320px] w-full">
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <Button
                isIconOnly
                variant="flat"
                className="h-10 w-11 shrink-0 rounded-r-none border-r border-default-200"
              >
                <DynamicIcon
                  name={
                    searchCategory === 'orderNumber' ? 'hash' :
                    searchCategory === 'ttn' ? 'truck' :
                    searchCategory === 'phone' ? 'phone' :
                    searchCategory === 'name' ? 'user' :
                    'layers'
                  }
                  size={16}
                />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Категорія пошуку"
              selectionMode="single"
              selectedKeys={new Set([searchCategory])}
              variant="flat"
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as typeof searchCategory;
                if (val) { setSearchCategory(val); setSearch(""); }
              }}
            >
              <DropdownItem key="orderNumber" startContent={<DynamicIcon name="hash" size={15} />}>№ замовлення</DropdownItem>
              <DropdownItem key="ttn" startContent={<DynamicIcon name="truck" size={15} />}>№ ТТН (останні 4)</DropdownItem>
              <DropdownItem key="phone" startContent={<DynamicIcon name="phone" size={15} />}>Телефон</DropdownItem>
              <DropdownItem key="name" startContent={<DynamicIcon name="user" size={15} />}>ПІБ</DropdownItem>
              <DropdownItem key="all" startContent={<DynamicIcon name="layers" size={15} />}>Всі поля</DropdownItem>
            </DropdownMenu>
          </Dropdown>
          <Input
            placeholder={
              searchCategory === 'orderNumber' ? '12345...' :
              searchCategory === 'ttn' ? 'Останні 4 цифри ТТН...' :
              searchCategory === 'phone' ? 'Номер телефону...' :
              searchCategory === 'name' ? 'Прізвище або ім\'я...' :
              'Пошук по всіх полях...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            onClear={() => setSearch("")}
            isClearable
            variant="bordered"
            className="flex-1"
            classNames={{
              inputWrapper: "border-1 border-l-0 rounded-l-none group-data-[focus=true]:border-neutral-300 focus-within:border-neutral-300",
            }}
            startContent={<DynamicIcon name="search" size={16} />}
          />
        </div>

        <div className="flex gap-3 mr-auto">
          {/* Фільтр по датам відвантаження */}
          <I18nProvider locale="uk-UA">
            <DateRangePicker
              aria-label="Період відвантаження"
              value={dateRange}
              onChange={setDateRange}
              size="md"
              selectorButtonPlacement="start"
              selectorIcon={<DynamicIcon name="calendar" size={18} />}
              classNames={{
                base: "w-auto",
                inputWrapper: "h-10",
                segment: "rounded-[5px]",
              }}
            />
          </I18nProvider>
        </div>

        {/* Масові дії */}
        <ButtonGroup variant="solid">
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                color="primary"
                className="font-medium px-4 py-2.5 h-auto rounded-md"
                isDisabled={selectedOrderIds.length === 0}
              >
                Масові дії <DynamicIcon name="chevron-down" size={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Масові операції"
              onAction={(key) => {
                if (key === "exportOnly") handleBulkExport();
                if (key === "shipmentOnly") handleBulkShipment();
                if (key === "exportAndShipment") handleBulkExportAndShipment();
                if (key === "forceRecheck") handleBulkForceRecheck();
                if (key === "update") handleBulkCheckAndUpdate();
                if (key === "copy") { copyToClipboard(selectedOrderIds.join(', ')); }
              }}
            >
              <DropdownSection showDivider dividerProps={{ className: "mt-1 bg-neutral-100" }}>
                <DropdownItem
                  key="copy"
                  startContent={<DynamicIcon name="copy" size={16} className="shrink-0" />}
                >
                  Копіювати номери ({selectedOrderIds.length})
                </DropdownItem>
              </DropdownSection>
              <DropdownSection title="Експорт у Діловод" showDivider dividerProps={{ className: "mt-1 bg-neutral-100" }}>
                <DropdownItem
                  key="exportOnly"
                  startContent={<DynamicIcon name="upload-cloud" size={16} className="shrink-0" />}
                >
                  Тільки експорт ({selectedOrderIds.length})
                </DropdownItem>
                <DropdownItem
                  key="shipmentOnly"
                  startContent={<DynamicIcon name="truck" size={16} className="shrink-0" />}
                >
                  Тільки відвантаження ({selectedOrderIds.length})
                </DropdownItem>
                <DropdownItem
                  key="exportAndShipment"
                  startContent={<DynamicIcon name="package-check" size={16} className="shrink-0" />}
                >
                  Експорт + відвантаження ({selectedOrderIds.length})
                </DropdownItem>
              </DropdownSection>
              <DropdownSection title="Перевірка статусів">
                <DropdownItem
                  key="update"
                  startContent={<DynamicIcon name="refresh-ccw" size={16} className="shrink-0" />}
                >
                  Оновити статуси ({selectedOrderIds.length})
                </DropdownItem>
                <DropdownItem
                  key="forceRecheck"
                  startContent={<DynamicIcon name="refresh-ccw-dot" size={16} className="shrink-0" />}
                  className="text-danger"
                  color="danger"
                >
                  Примусова перевірка ({selectedOrderIds.length})
                </DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>
        </ButtonGroup>
      </div>

      <div className="flex items-center justify-between w-full">
        <div className="flex gap-3">
          {/* Фільтр каналів */}
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <Button
                variant="flat"
                size="sm"
                className="font-medium h-8"
                startContent={<DynamicIcon name="filter" size={16} />}
              >
                Канали ({selectedChannels.size})
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Фільтр каналів"
              closeOnSelect={false}
              variant="flat"
              selectionMode="multiple"
              selectedKeys={selectedChannels}
              onSelectionChange={(keys) => {
                if (keys === 'all') {
                  setSelectedChannels(new Set(salesChannels.map(ch => ch.id)));
                } else {
                  setSelectedChannels(keys as Set<string>);
                }
              }}
            >
              <DropdownSection showDivider dividerProps={{ className: "mt-3 bg-neutral-100" }}>
                {salesChannels.map((channel) => (
                  <DropdownItem
                    key={channel.id}
                    textValue={channel.name}
                    startContent={
                      <div className={`w-3 h-3 rounded ${getChannelClass(channel.id)}`} />
                    }
                  >
                    {channel.name}
                  </DropdownItem>
                ))}
              </DropdownSection>
              <DropdownSection>
                <DropdownItem
                  key="actions"
                  textValue="Дії з фільтром"
                  className="px-2 pt-1 pb-0 cursor-default !bg-transparent"
                  closeOnSelect={false}
                  isReadOnly
                >
                  <div className="flex gap-2 justify-between items-center">
                    <Button
                      size="sm"
                      variant="flat"
                      className="flex-1 h-7"
                      onPress={() => setSelectedChannels(new Set(salesChannels.map(ch => ch.id)))}
                    >
                      Вибрати всі
                    </Button>
                    <Button
                      size="sm"
                      variant="flat"
                      color="danger"
                      className="flex-1 h-7"
                      onPress={() => setSelectedChannels(new Set())}
                    >
                      Скинути всі
                    </Button>
                  </div>
                </DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>

          {/* Фільтр по відвантаженню */}
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <Button
                variant="flat"
                size="sm"
                className="font-medium h-8"
                startContent={<DynamicIcon name="truck" size={16} />}
              >
                {shipmentFilter === 'all' && 'Всі замовлення'}
                {shipmentFilter === 'shipped' && 'Відвантажені'}
                {shipmentFilter === 'not_shipped' && 'Не відвантажені'}
                {shipmentFilter === 'duplicates' && 'Дублікати відвантажень'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Фільтр по відвантаженню"
              variant="flat"
              selectionMode="single"
              selectedKeys={new Set([shipmentFilter])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as ShipmentFilterType;
                setShipmentFilter(selected);
              }}
            >
              <DropdownItem 
                key="all"
                textValue="Всі замовлення"
                startContent={<DynamicIcon name="list" size={16} />}
              >
                Всі замовлення
              </DropdownItem>
              <DropdownItem 
                key="shipped"
                textValue="Відвантажені"
                startContent={<DynamicIcon name="check-circle" size={16} className="text-green-600" />}
              >
                Відвантажені
              </DropdownItem>
              <DropdownItem 
                key="not_shipped"
                textValue="Не відвантажені"
                startContent={<DynamicIcon name="clock" size={16} className="text-orange-600" />}
              >
                Не відвантажені
              </DropdownItem>
              <DropdownItem 
                key="duplicates"
                textValue="Дублікати відвантажень"
                startContent={<DynamicIcon name="copy-x" size={16} className="text-red-600" />}
              >
                Дублікати відвантажень
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>

          {/* Фільтр по статусу */}
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <Button
                variant="flat"
                size="sm"
                className="font-medium h-8"
                startContent={<DynamicIcon name="sliders" size={16} />}
              >
                {selectedStatus === 'all'
                  ? 'Всі статуси'
                  : statusOptions.find(s => s.value === selectedStatus)?.label ?? 'Статус'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Фільтр по статусу"
              variant="flat"
              selectionMode="single"
              selectedKeys={new Set([selectedStatus])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as StatusFilterType;
                setSelectedStatus(selected);
              }}
            >
              <DropdownSection showDivider dividerProps={{ className: "mt-1 bg-neutral-100" }}>
                <DropdownItem
                  key="all"
                  textValue="Всі статуси"
                  startContent={<DynamicIcon name="list" size={16} />}
                >
                  Всі статуси
                </DropdownItem>
              </DropdownSection>
              <DropdownSection>
                {statusOptions.map((status) => (
                  <DropdownItem
                    key={status.value}
                    textValue={status.label}
                    startContent={<DynamicIcon name={status.icon as Parameters<typeof DynamicIcon>[0]['name']} size={16} className={`${getStatusColor(status.value)} rounded-full overflow-visible`} />}
                  >
                    {status.label} <span className="border-1 border-gray-300 text-gray-400 px-1.5 py-0.5 rounded text-xs font-medium ml-1">{statusCounts[status.value] || 0}</span>
                  </DropdownItem>
                ))}
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>

          {/* Кнопка скидання всіх фільтрів - показується тільки коли фільтри активні */}
          {hasActiveFilters() && (
            <Button
              onPress={resetFilters}
              disabled={loading}
              size="sm"
              variant="flat"
              className="font-medium h-8 bg-danger-50 text-danger-700 hover:bg-danger-100"
              startContent={<DynamicIcon name="rotate-ccw" size={16} />}
            >
              Скинути
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Кількість рядків на сторінці */}
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                variant="flat"
                size="sm"
                className="font-medium h-8"
                startContent={<DynamicIcon name="rows-3" size={16} />}
              >
                {pageSize} / стор.
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Кількість на сторінці"
              variant="flat"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([String(pageSize)])}
              onSelectionChange={(keys) => {
                const val = Number(Array.from(keys)[0]);
                if (val) setPageSize(val);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <DropdownItem key={String(n)} textValue={String(n)}>
                  {n} на сторінці
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          {/* Кнопка оновлення таблиці */}
          <Button
            color="primary"
            size="sm"
            variant="flat"
            onPress={fetchOrders}
            isLoading={isAutoChecking}
            startContent={!isAutoChecking && <DynamicIcon name="refresh-cw" size={16} />}
            className="font-medium h-8 bg-primary-100 text-primary-700 hover:bg-primary-100"
          >
            Оновити таблицю
          </Button>
        </div>

      </div>

      {/* Третій ряд: Адмін-панель для автоматичних дій */}
      {user?.role === 'admin' && isDebugMode && (
        <Card shadow="none" border-1 className="bg-neutral-50 border-1 border-neutral-200 rounded-md">
          <CardBody className="py-2 px-3 flex flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-500 whitespace-nowrap">
                Ліміт перевірки:
              </span>
              <Input
                type="number"
                size="sm"
                variant="bordered"
                value={autoCheckLimit.toString()}
                onChange={(e) => setAutoCheckLimit(Number(e.target.value))}
                className="w-24"
                min={1}
                max={500}
                classNames={{
                  input: "text-center font-semibold",
                  inputWrapper: "h-8 min-h-8 px-2 border-1 border-neutral-300 focus-within:border-neutral-500"
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-500 whitespace-nowrap">
                Offset:
              </span>
              <Input
                type="number"
                size="sm"
                variant="bordered"
                value={autoCheckOffset.toString()}
                onChange={(e) => setAutoCheckOffset(Number(e.target.value))}
                className="w-24"
                min={0}
                max={10000}
                classNames={{
                  input: "text-center font-semibold",
                  inputWrapper: "h-8 min-h-8 px-2 border-1 border-neutral-300 focus-within:border-neutral-500"
                }}
              />
            </div>
            
            <Switch
              size="sm"
              isSelected={autoCheckForceAll}
              onValueChange={setAutoCheckForceAll}
              classNames={{ label: `text-sm font-medium ${autoCheckForceAll ? 'text-warning-700' : 'text-neutral-500'}` }}
              color="warning"
            >
              Force mode
            </Switch>

            <Button
              size="sm"
              variant="flat"
              onPress={handleAutoBulkCheck}
              isLoading={isAutoChecking}
              startContent={!isAutoChecking && <DynamicIcon name="search-check" size={16} />}
              className="font-semibold h-8"
            >
              Авто-перевірка
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Таблиця */}
      <div className="relative">
        <Table
          aria-label="Таблиця замовлень SalesDrive"
          selectionMode="multiple"
          selectedKeys={selectedOrderIds}
          // onSelectionChange={keys => setSelectedOrderIds(Array.from(keys as Set<string>))}
          onSelectionChange={keys => {
            if (keys === 'all' || (keys instanceof Set && keys.has('all'))) {
              setSelectedOrderIds(orders.map(o => String(o.id)));
            } else {
              setSelectedOrderIds(Array.from(keys as Set<string>));
            }
          }}
          classNames={{
            wrapper: "min-h-80 p-0 pb-1 shadow-none bg-transparent rounded-none",
            th: ["first:rounded-s-md", "last:rounded-e-md"],
          }}
        >
          <TableHeader>
            {columns.map((column) => (
              <TableColumn
                key={column.key}
                allowsSorting={column.sortable}
                className="text-sm"
              >
                {column.label}
              </TableColumn>
            ))}
          </TableHeader>
          <TableBody
            items={orders}
            emptyContent={
              loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-3 text-gray-600">Завантаження...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <DynamicIcon name="inbox" size={48} className="mr-3" />
                  <span>Немає замовлень для відображення</span>
                </div>
              )
            }
          >
            {(order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Tooltip placement="right-end" color="secondary" content="Cкопіювати">
                    <Button className="font-medium h-fit p-1 rounded-sm" variant="light" onPress={() => copyToClipboard(order.orderNumber)}>
                      {order.orderNumber}
                    </Button>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip placement="top-start" color="secondary" content={order.orderDate ? new Date(order.orderDate).toLocaleString('uk-UA') : 'Дата не задана'}>
                    <span className="cursor-help">{order.orderDate ? formatRelativeDate(order.orderDate.toString(), { maxRelativeDays: 1 }) : 'Не задано'}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip placement="top-start" color="secondary" content={`Оновлено: ${order.updatedAt ? new Date(order.updatedAt).toLocaleString('uk-UA') : 'Дата не задана'}`}>
                    <Chip size="sm" variant="flat" classNames={{ base: `${getStatusColor(order.status)} cursor-help` }}>
                      {order.statusText || getStatusLabel(order.status)}
                    </Chip>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {order.paymentMethod || 'Не задано'}
                </TableCell>
                {/* <TableCell>
                  {order.shippingMethod || 'Не задано'}
                </TableCell> */}
                <TableCell>
                  <Tooltip 
                    placement="top-start" 
                    isDisabled={!!order.sajt}
                    color={!order.sajt ? "danger" : "secondary"}
                    content={!order.sajt ? "⚠️ УВАГА: Канал продажів не вказано! Потрібно виправити в SalesDrive" : ``}
                  >
                    <Chip
                      size="sm"
                      variant="flat"
                      className={getChannelClass(order.sajt)}
                    >
                      {getChannelName(order.sajt)}
                    </Chip>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Tooltip color="secondary" content={order.dilovodExportDate ? 'Оновлено: ' + new Date(order.dilovodExportDate).toLocaleString('uk-UA') : 'Ще не оновлено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none cursor-help rounded-sm ${order.dilovodExportDate ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="search-check" size={16} /></div>
                    </Tooltip>
                    <Tooltip color={
                      (order.dilovodSaleDocsCount != null && order.dilovodSaleDocsCount > 1) ||
                      (order.dilovodReturnDocsCount != null && order.dilovodReturnDocsCount > 1)
                        ? "danger"
                        : "secondary"
                    } content={
                      order.dilovodSaleDocsCount != null && order.dilovodSaleDocsCount > 1
                        ? `⚠️ Дублювання відвантаження: знайдено ${order.dilovodSaleDocsCount} документи.`
                        : order.dilovodReturnDocsCount != null && order.dilovodReturnDocsCount > 1
                          ? `⚠️ Дублювання повернення: знайдено ${order.dilovodReturnDocsCount} документи.`
                          : order.dilovodReturnDate
                            ? 'Відвантажено: ' + new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA') + ' | Повернуто: ' + new Date(order.dilovodReturnDate).toLocaleString('uk-UA')
                            : order.dilovodSaleExportDate
                              ? 'Відвантажено: ' + new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA')
                              : 'Ще не відвантажено'
                    }>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none cursor-help rounded-sm ${
                        (order.dilovodSaleDocsCount != null && order.dilovodSaleDocsCount > 1) ||
                        (order.dilovodReturnDocsCount != null && order.dilovodReturnDocsCount > 1)
                          ? 'bg-red-100 text-red-600 ring-1 ring-red-300'
                          : order.dilovodReturnDate
                            ? 'bg-orange-100 text-orange-600'
                            : order.dilovodSaleExportDate
                              ? 'bg-green-100 text-green-600'
                              : 'bg-gray-100 text-gray-300'
                      }`}><DynamicIcon name="truck" size={16} className={order.dilovodReturnDate ? 'scale-x-[-1]' : ''} /></div>
                    </Tooltip>
                    <Tooltip color="secondary" content={order.dilovodCashInDate ? 'Оплачено: ' + new Date(order.dilovodCashInDate).toLocaleString('uk-UA') : 'Ще не оплачено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none cursor-help rounded-sm ${order.dilovodCashInDate ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="wallet" size={16} /></div>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell className="w-42">
                  <ButtonGroup variant="flat">
                    <Button onPress={() => handleShowDetails(order)} isIconOnly variant="flat" className="font-medium p-2 mr-1.5 h-9 rounded-md" startContent={<DynamicIcon name="eye" size={14} />}></Button>
                    <Dropdown
                      placement="bottom-end"
                      onOpenChange={(open) => {
                        if (!open) return;
                        if (order.logsCount !== undefined) return; // already loaded

                        getOrderLogsCount(order.orderNumber).then((count) => {
                          setOrders(prev => prev.map(o =>
                            o.orderNumber === order.orderNumber ? { ...o, logsCount: count } : o
                          ));
                        });
                      }}
                    >
                      <DropdownTrigger>
                        <Button
                          variant="flat"
                          className="font-medium px-4 py-2 h-auto rounded-md"
                          endContent={<DynamicIcon name="chevron-down" size={12} />}
                        >
                          Інші дії
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        disallowEmptySelection
                        aria-label="Дії із замовленням"
                        variant="faded"
                        className="max-w-[300px]"
                        disabledKeys={
                          order.dilovodSaleExportDate
                            ? ['exportOrder', 'createShipment']
                            : (order.dilovodExportDate)
                              ? (Number(order.status) < 3
                                  ? ['exportOrder', 'createShipment']
                                  : ['exportOrder'])
                              : ['createShipment']
                        }
                        onAction={(key) => {
                          if (key === "checkDilovod") handleCheckInDilovod(order);
                          if (key === "forceRecheck") handleForceRecheck(order);
                          if (key === "exportOrder") handleExportOrder(order);
                          if (key === "createShipment") handleCreateShipment(order);
                          if (key === "viewLogs") handleViewOrderLogs(order);
                          if (key === "resetDuplicateError") handleResetDuplicateError(order);
                        }}
                      >
                        <DropdownSection>
                          <DropdownItem textValue="Перевірити в Діловоді" key="checkDilovod" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="refresh-ccw" size={16} />}>Перевірити в Діловоді</DropdownItem>
                          <DropdownItem textValue="Примусова перевірка (скинути і перечитати)" key="forceRecheck" className="px-3 py-2 text-danger-500!" startContent={<DynamicIcon className="text-xl text-danger-500 pointer-events-none shrink-0" name="refresh-ccw-dot" size={16} />}>Примусова перевірка</DropdownItem>
                          <DropdownItem textValue="Експортувати замовлення" key="exportOrder" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="upload" size={16} />}>Експортувати замовлення</DropdownItem>
                          <DropdownItem textValue="Відвантажити замовлення" key="createShipment" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="truck" size={16} />}>Відвантажити замовлення</DropdownItem>
                          {!!order.logsCount && (
                            <DropdownItem textValue="Логи експорту" key="viewLogs" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="braces" size={16} />}>
                              Логи експорту ({order.logsCount ?? '0'})
                            </DropdownItem>
                          )}
                        </DropdownSection>
                        <DropdownSection className="border-t-1 border-gray-200 pt-2">
                          {order.dilovodSaleDocsCount != null && order.dilovodSaleDocsCount > 1 && (
                            <DropdownItem textValue="Скинути помилку дублювання" key="resetDuplicateError" className="px-3 py-2 text-danger-500!" startContent={<DynamicIcon className="text-xl text-danger-500 pointer-events-none shrink-0" name="shield-alert" size={16} />}>Скинути помилку дублювання</DropdownItem>
                          )}
                          <DropdownItem textValue="baseDoc ID" key="footer" className="px-3 py-2 font-semibold text-default-700 cursor-default data-[hover=true]:bg-white border-none" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="key-round" size={14} />}>
                            <div className="flex items-center justify-between text-xs">
                              {order.dilovodDocId || 'Немає ID'}
                              {order.dilovodDocId && <Button variant="flat" size="sm" className="px-2 py-1 min-w-auto h-auto rounded" onPress={() => { navigator.clipboard.writeText(order.dilovodDocId || '') }}>Copy</Button>}
                            </div>
                          </DropdownItem>
                        </DropdownSection>
                      </DropdownMenu>
                    </Dropdown>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Overlay для завантаження */}
        <div
          className={`absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10 transition-all duration-300 ease-in-out ${loading ? "opacity-100 visible" : "opacity-0 invisible"
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

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex justify-between mt-4">
          <Pagination
            total={totalPages}
            page={page}
            onChange={setPage}
            showControls
            showShadow
            color="primary"
            className="cursor-pointer"
          />

          {/* Легенда */}
          <div className="flex gap-6 items-center border-1 py-2 px-3 rounded-sm">
            <div className="flex gap-1 items-center">
              <div className="w-6 h-6 inline-flex items-center justify-center box-border select-none rounded bg-purple-100 text-purple-600"><DynamicIcon name="search-check" size={14} strokeWidth="1.5" /></div>
              <span className="text-sm text-default-500">Додано в Діловод</span>
            </div>

            <div className="flex gap-1 items-center">
              <div className="w-6 h-6 inline-flex items-center justify-center box-border select-none rounded bg-green-100 text-green-600"><DynamicIcon name="truck" size={14} strokeWidth="1.5" /></div>
              <span className="text-sm text-default-500">Відвантажено</span>
            </div>

            <div className="flex gap-1 items-center">
              <div className="w-6 h-6 inline-flex items-center justify-center box-border select-none rounded bg-yellow-100 text-yellow-600"><DynamicIcon name="wallet" size={14} strokeWidth="1.5" /></div>
              <span className="text-sm text-default-500">Оплачено</span>
            </div>
          </div>
        </div>
      )}

      {/* Інформація про результати */}
      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div className="flex items-center gap-4">
          <span className="font-medium">
            Знайдено: {totalCount} замовлень
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>Сторінка {page} з {totalPages}</span>
        </div>
      </div>

      {/* Універсальний Drawer для результатів операцій і логів */}
      <ResultDrawer
        isOpen={isDrawerOpen}
        onOpenChange={onDrawerOpenChange}
        result={drawerResult}
        title={drawerTitle}
        type={drawerType}
        getChannelName={getChannelName}
      />

    </div>
  );
}
