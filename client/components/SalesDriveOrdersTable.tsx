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
} from "@heroui/react";
import { useApi } from "../hooks/useApi";
import { useDilovodSettings } from "../hooks/useDilovodSettings";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusLabel, getStatusColor } from "../lib/formatUtils";
import { ToastService } from "@/services/ToastService";
import ResultDrawer from './ResultDrawer';
import type { SalesDriveOrderForExport, SalesDriveOrdersResponse, } from "@shared/types/salesdrive";
import type { SalesChannel } from "@shared/types/dilovod";

// Канали продажів з SalesDrive (исключая nk-food.shop с ID "19")
const SALES_CHANNELS: SalesChannel[] = [
  { id: '22', name: 'Rozetka (Сергій)' },
  { id: '24', name: 'prom (old)' },
  { id: '28', name: 'prom' },
  { id: '31', name: 'інше (менеджер)' },
  { id: '38', name: 'дрібні магазини' },
  { id: '39', name: 'Rozetka (Марія)' },
  // Канал "19" (nk-food.shop) исключен из SalesDrive экспорта
];

// Функція для отримання класів каналу
const getChannelClass = (channelId: string): string => {
  switch (channelId) {
    case '22': // Rozetka (Сергій)
      return 'bg-green-100 text-green-800 border-green-200';
    case '39': // Rozetka (Марія)
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case '28': // prom (актуальний)
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case '24': // prom (old)
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case '31': // інше (менеджер)
      return 'bg-red-100 text-red-800 border-red-200';
    case '38': // дрібні магазини
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case '19': // nk-food.shop (виключений)
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

interface SalesDriveOrdersTableProps {
  className?: string;
}

export default function SalesDriveOrdersTable({ className }: SalesDriveOrdersTableProps) {
  const { apiCall } = useApi();
  // Don't load full directories automatically on SalesDrive monitoring page because
  // it's a read-only monitoring view and directories are heavy to load.
  const { settings: dilovodSettings } = useDilovodSettings({ loadDirectories: false });

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

  // State для пагінації
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State для пошуку
  const [search, setSearch] = useState("");

  // Локальний кеш token'ів для sale (отримуємо його після експорту)
  const [saleTokens, setSaleTokens] = useState<Record<string, string>>({});

  // Функція для отримання назви каналу
  const getChannelName = (channelId: string): string => {
    // Спочатку шукаємо у відомих каналах
    const knownChannel = SALES_CHANNELS.find(ch => ch.id === channelId);
    if (knownChannel) {
      return knownChannel.name;
    }

    // Якщо це канал nk-food.shop (виключений з експорту)
    if (channelId === '19') {
      return 'nk-food.shop (виключений)';
    }

    // Якщо канал невідомий
    return `Канал ${channelId}`;
  };

  // Функція для завантаження замовлень
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sortBy: 'orderDate',
        sortOrder: 'desc'
      });

      if (search) {
        params.append('search', search);
      }

      const response = await apiCall(`/api/dilovod/salesdrive/orders?${params}`);
      const data: SalesDriveOrdersResponse = await response.json();

      if (data.success) {
        setOrders(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.pagination.totalCount);
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
  }, [page, search]);

  // Завантажуємо дані під час монтування та зміни параметрів
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Скидаємо сторінку на 1 при зміні пошуку
  useEffect(() => {
    setPage(1);
  }, [search]);

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

  // Отримання статус-коду для getStatusColor (як у звітах)
  const getOrderStatusCode = (statusText: string) => {
    const statusLower = statusText.toLowerCase();

    if (statusLower.includes('новий') || statusLower === '1') return '1';
    if (statusLower.includes('підтверджено') || statusLower === '2') return '2';
    if (statusLower.includes('на відправку') || statusLower.includes('готов') || statusLower === '3') return '3';
    if (statusLower.includes('відправлено') || statusLower === '4') return '4';
    if (statusLower.includes('продаж') || statusLower.includes('доставлено') || statusLower === '5') return '5';
    if (statusLower.includes('скасовано') || statusLower.includes('відхилено') || statusLower.includes('повернення') || statusLower === '6' || statusLower === '7') return '6';
    if (statusLower.includes('видалено') || statusLower === '8') return '8';

    return ''; // За замовчуванням
  };

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

    // Отримати налаштування префіксу/суфіксу для каналу
    const processedOrders = filteredOrders.map(order => {
      const channelSettings = dilovodSettings?.channelPaymentMapping?.[order.sajt];
      let orderNum = order.orderNumber;
      if (channelSettings) {
        if (channelSettings.prefixOrder) orderNum = channelSettings.prefixOrder + orderNum;
        if (channelSettings.sufixOrder) orderNum = orderNum + channelSettings.sufixOrder;
      }
      return orderNum;
    });

    try {
      // Звертаємося до API Dilovod для масової перевірки замовлень - server\routes\dilovod.ts
      const response = await apiCall('/api/dilovod/salesdrive/orders/check', {
        method: 'POST',
        body: JSON.stringify({
          orderNumbers: processedOrders
        })
      });
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        setDrawerResult(result);
        setDrawerTitle('Результат масової перевірки замовлень');
        setDrawerType('result');
        onDrawerOpen();

        // ToastService.show({
        //   title: `${result.updatedCount > 0 ? 'Оновлено!' : 'Без змін'}`,
        //   description: `${result.updatedCount > 0 ? `${result.updatedCount} Статуси документів оновлено для ${result.data.length} замовлень` : 'Статуси документів не були змінені'}`,
        //   color: `${result.updatedCount > 0 ? 'success' : 'default'}`,
        //   hideIcon: false,
        //   icon: <DynamicIcon name={result.updatedCount > 0 ? 'check-circle' : 'octagon-alert'} size={20} strokeWidth={1.5} className="shrink-0" />
        // });

        // Перемальовуємо таблицю
        if (result.updatedCount > 0) {
          fetchOrders();
        }
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
      // Отримати налаштування префіксу/суфіксу для каналу
      let preparedOrder = [order.orderNumber];
      const channelSettings = dilovodSettings?.channelPaymentMapping?.[order.sajt];
      if (channelSettings) {
        if (channelSettings.prefixOrder) preparedOrder = [channelSettings.prefixOrder + preparedOrder[0]];
        if (channelSettings.sufixOrder) preparedOrder = [preparedOrder[0] + channelSettings.sufixOrder];
      }

      // ToastService.show({
      //   title: 'Перевірка...',
      //   description: `Перевіряємо замовлення #${preparedOrder[0]} в Діловоді`,
      //   color: 'primary'
      // });

      // Надсилаємо запит до API Dilovod для перевірки замовлення - server\routes\dilovod.ts
      const response = await apiCall(`/api/dilovod/salesdrive/orders/check`, {
        method: 'POST',
        body: JSON.stringify({
          orderNumbers: preparedOrder
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
          // Визначаємо, чи був оновлений локальний статус (є новий dilovodId або dilovodExportDate)
          const updated = result.data.some((item: any) => item.updatedCount > 0);
          if (updated) {
            ToastService.show({
              title: 'Оновлено!',
              description: `Статус документа оновлено для ${result.data.length} замовлення(нь)`,
              color: 'success',
              hideIcon: false,
              icon: <DynamicIcon name="check-circle" size={20} className="shrink-0" />
            });
            fetchOrders();
          }
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

  // Показати деталі замовлення
  const handleShowDetails = (order: SalesDriveOrderForExport) => {
    // Prepare order data for display (parse JSON fields)
    const orderData = {
      ...order,
      items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
      rawData: typeof order.rawData === 'string' ? JSON.parse(order.rawData) : order.rawData
    };

    setDrawerResult(orderData);
    setDrawerTitle(`Деталі замовлення #${order.orderNumber}`);
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
        description: `Експортуємо замовлення ${order.orderNumber} в Díловод`,
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
          ToastService.show({
            title: 'Не вивантажено!',
            description: result.error || result.message || 'Жодного документа не було експортовано в Діловод',
            color: 'danger',
            hideIcon: false,
            icon: <DynamicIcon name="octagon-alert" size={20} strokeWidth={1.5} className="shrink-0" />
          });
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
        color: 'primary'
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
            color: 'danger'
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
              color: 'danger'
            });
          }
        }
      } catch {
        errors.push('Помилка зʼєднання при експорті');
        ToastService.show({
          title: `Помилка зʼєднання (${order.orderNumber})`,
          description: 'Помилка зʼєднання при експорті',
          color: 'danger'
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

  // Utility: Copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    ToastService.show({
      title: 'Скопійовано',
      description: `Скопійовано "${text}" у буфер обміну`,
      color: 'success'
    });
  };

  // Utility: get order number with prefix/suffix from channel settings
  function getDisplayOrderNumber(order: SalesDriveOrderForExport): string {
    const channelSettings = dilovodSettings?.channelPaymentMapping?.[order.sajt];
    let orderNum = order.orderNumber;
    if (channelSettings) {
      if (channelSettings.prefixOrder) orderNum = channelSettings.prefixOrder + orderNum;
      if (channelSettings.sufixOrder) orderNum = orderNum + channelSettings.sufixOrder;
    }
    return orderNum;
  }

  // Utility: get order numbers with prefix/suffix from channel settings
  const getDisplayOrderNumbers = (orderNumbers: string[]) => orderNumbers.map(orderNumber => {
    const order = orders.find(order => order.orderNumber === orderNumber);
    if (!order) return orderNumber;
    const channelSettings = dilovodSettings?.channelPaymentMapping?.[order.sajt];
    if (channelSettings) {
      if (channelSettings.prefixOrder) orderNumber = channelSettings.prefixOrder + orderNumber;
      if (channelSettings.sufixOrder) orderNumber = orderNumber + channelSettings.sufixOrder;
    }
    return orderNumber;
  });

  // Колонки таблиці
  const columns = [
    { key: "orderNumber", label: "№ замовлення", sortable: false },
    { key: "orderDate", label: "Дата оформлення", sortable: false },
    { key: "status", label: "Статус", sortable: false },
    { key: "paymentMethod", label: "Оплата", sortable: false },
    { key: "shippingMethod", label: "Доставка", sortable: false },
    { key: "sajt", label: "Канал", sortable: false },
    { key: "dilovodExportDate", label: "Додано в Діловод", sortable: false },
    { key: "actions", label: "Дії", sortable: false }
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex gap-4 items-center justify-between">
        {/* Панель пошуку */}
        <Input
          placeholder="Пошук по номеру, імені або телефону..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyPress={handleSearchKeyPress}
          onClear={() => setSearch("")}
          isClearable
          className="max-w-sm"
          startContent={<DynamicIcon name="search" size={16} />}
        />

        {/* Масові дії */}
        <div className="flex items-center gap-2">
          <Button
            color="primary"
            variant="solid"
            className="font-medium px-4 py-2.5 rounded-md h-auto"
            startContent={<DynamicIcon name="copy" size={16} />}
            isDisabled={selectedOrderIds.length === 0}
            onPress={() => {
              const selectedOrders = orders.filter(order => selectedOrderIds.includes(String(order.id)));
              const orderNumbers = getDisplayOrderNumbers(selectedOrders.map(order => order.orderNumber)).join('\n');
              navigator.clipboard.writeText(orderNumbers);
              ToastService.show({
                title: 'Скопійовано',
                description: `Скопійовано ${selectedOrders.length} номер(ів) замовлень у буфер обміну`,
                color: 'success'
              });
            }}
          >
            Копіювати вибране ({selectedOrderIds.length})
          </Button>

          <Button
            color="primary"
            variant="solid"
            className="font-medium px-4 py-2.5 rounded-md h-auto"
            startContent={<DynamicIcon name="upload-cloud" size={16} />}
            onPress={handleBulkExportAndShipment}
            isDisabled={selectedOrderIds.length === 0}
          >
            Масовий експорт + відвантаження ({selectedOrderIds.length})
          </Button>

          <Button
            color="primary"
            variant="solid"
            className="font-medium px-4 py-2.5 rounded-md h-auto"
            startContent={<DynamicIcon name="refresh-cw" size={16} />}
            onPress={handleBulkCheckAndUpdate}
            isDisabled={selectedOrderIds.length === 0}
          >
            Оновити статуси документів ({selectedOrderIds.length})
          </Button>
        </div>
      </div>

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
                    <Button className="font-medium h-fit p-1 rounded-sm" variant="light" onPress={() => copyToClipboard(getDisplayOrderNumber(order))}>
                      {getDisplayOrderNumber(order)}
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
                    <Chip size="sm" variant="flat" classNames={{ base: `${getStatusColor(getOrderStatusCode(order.statusText || order.status))} cursor-help` }}>
                      {order.statusText || getStatusLabel(order.status)}
                    </Chip>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {order.paymentMethod || 'Не задано'}
                </TableCell>
                <TableCell>
                  {order.shippingMethod || 'Не задано'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="sm"
                    variant="flat"
                    className={order.sajt ? getChannelClass(order.sajt) : 'bg-gray-100 text-gray-600 border-gray-200'}
                  >
                    {order.sajt ? getChannelName(order.sajt) : 'Не задано'}
                  </Chip>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Tooltip color="secondary" content={order.dilovodExportDate ? 'Синхронізовано: ' + new Date(order.dilovodExportDate).toLocaleString('uk-UA') : 'Ще не вивантажено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none cursor-help rounded-sm ${order.dilovodExportDate ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="search-check" size={16} /></div>
                    </Tooltip>
                    <Tooltip color="secondary" content={order.dilovodSaleExportDate ? 'Синхронізовано: ' + new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA') : 'Ще не відвантажено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none cursor-help rounded-sm ${order.dilovodSaleExportDate ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="truck" size={16} /></div>
                    </Tooltip>
                    <Tooltip color="secondary" content={order.dilovodCashInDate ? 'Синхронізовано: ' + new Date(order.dilovodCashInDate).toLocaleString('uk-UA') : 'Ще не оплачено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none cursor-help rounded-sm ${order.dilovodCashInDate ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="wallet" size={16} /></div>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell>
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
                        disabledKeys={!order.dilovodDocId ? ['createShipment'] : []}
                        onAction={(key) => {
                          if (key === "checkDilovod") handleCheckInDilovod(order);
                          if (key === "exportOrder") handleExportOrder(order);
                          if (key === "createShipment") handleCreateShipment(order);
                          if (key === "viewLogs") handleViewOrderLogs(order);
                        }}
                      >
                        <DropdownSection showDivider>
                          <DropdownItem textValue="Перевірити в Діловоді" key="checkDilovod" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="search-check" size={16} />}>Перевірити в Діловоді</DropdownItem>
                          <DropdownItem textValue="Відправити замовлення" key="exportOrder" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="upload" size={16} />}>Відправити замовлення</DropdownItem>
                          <DropdownItem textValue="Відправити відвантаження" key="createShipment" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="truck" size={16} />}>Відправити відвантаження</DropdownItem>
                          {!!order.logsCount && (
                            <DropdownItem textValue="Логи експорту" key="viewLogs" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="braces" size={16} />}>
                              Логи експорту ({order.logsCount ?? '0'})
                            </DropdownItem>
                          )}
                        </DropdownSection>
                        <DropdownItem textValue="baseDoc ID" key="footer" className="px-3 py-2 font-semibold text-default-700 cursor-default data-[hover=true]:bg-white border-none" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="key-round" size={14} />}>
                          <div className="flex items-center justify-between text-xs">
                            {order.dilovodDocId || 'Немає ID'}
                            {order.dilovodDocId && <Button variant="flat" size="sm" className="px-2 py-1 min-w-auto h-auto rounded" onPress={() => { navigator.clipboard.writeText(order.dilovodDocId || '') }}>Copy</Button>}
                          </div>
                        </DropdownItem>
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
          <div className="flex gap-6 items-center mr-12 border-1 py-2 px-3 rounded-sm">
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
      />

    </div>
  );
}
