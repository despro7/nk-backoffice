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
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Pagination,
  Tooltip,
  ButtonGroup,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/react";
import { useApi } from "../hooks/useApi";
import { useDilovodSettings } from "../hooks/useDilovodSettings";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusLabel, getStatusColor } from "../lib/formatUtils";
import { ToastService } from "@/services/ToastService";
import type { SalesDriveOrderForExport, SalesDriveOrdersResponse, } from "@shared/types/salesdrive";
import type { SalesChannel } from "@shared/types/dilovod";
import { o } from "node_modules/framer-motion/dist/types.d-Cjd591yU";

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
  const { settings: dilovodSettings } = useDilovodSettings();
  
  // State для данных
  const [orders, setOrders] = useState<SalesDriveOrderForExport[]>([]);
  const [loading, setLoading] = useState(true);

  // Функция для получения названия канала
  const getChannelName = (channelId: string): string => {
    // Сначала ищем в известных каналах
    const knownChannel = SALES_CHANNELS.find(ch => ch.id === channelId);
    if (knownChannel) {
      return knownChannel.name;
    }

    // Если это канал nk-food.shop (исключен из экспорта)
    if (channelId === '19') {
      return 'nk-food.shop (исключен)';
    }
    
    // Если канал неизвестен
    return `Канал ${channelId}`;
  };
  
  // State для пагинации
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // State для поиска
  const [search, setSearch] = useState("");
  
  // State для модального окна
  const [selectedOrder, setSelectedOrder] = useState<SalesDriveOrderForExport | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

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
  }, [page, search]); // Убрал apiCall из зависимостей

  // Загружаем данные при монтировании и изменении параметров
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Скидаємо сторінку на 1 при зміні пошуку
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Обработка поиска
  const handleSearchSubmit = () => {
    setPage(1);
    fetchOrders();
  };

  // Обработка клавиши Enter в поиске
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  // Получение статус-кода для getStatusColor (как в звітах)
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
    const limit = 0; // 0 - без обмежень
    const filteredOrders = orders.slice(0, limit ? limit : orders.length);

    if (filteredOrders.length === 0) {
      ToastService.show({
        title: 'Немає замовлень для перевірки',
        description: `Замовлень не знайдено або досягнуто ліміт (${limit})`,
        color: 'warning'
      });
      return;
    }

    // console.log(`Виконання масової перевірки замовлень з обмеженням ${limit}`);
    // console.log('Відфільтровані замовлення:', filteredOrders);

    ToastService.show({
      title: 'Масова перевірка...',
      description: `Перевіряємо ${filteredOrders.length} замовлень у Dilovod`,
      color: 'primary'
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
        ToastService.show({
          title: 'Оновлено!',
          description: `Статуси документів оновлено для ${result.data.length} замовлень`,
          color: 'success'
        });
        // Перемальовуємо таблицю
        fetchOrders();
      } else {
        console.log('Деталі помилок масової перевірки:', result.errors);
        ToastService.show({
          title: 'Помилка',
          description: result.error || 'Помилка масової перевірки',
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

      console.log('Результат перевірки замовлення в Діловоді:', result);

      if (result.success) {
        ToastService.show({
          title: result.data.length > 0 ? 'Знайдено!' : 'Не знайдено',
          description: result.message,
          color: result.data.length > 0 ? 'success' : 'warning',
          hideIcon: false,
          icon: result.data.length > 0 ? ToastService.createIcon("check-circle") : ToastService.createIcon("alert-triangle")
        });
        // Оновити таблицю, щоб відобразити оновлену дату експорту
        result.data.length > 0 ? fetchOrders() : null;
      } else {
        ToastService.show({
          title: 'Помилка',
          description: result.error || 'Помилка перевірки в Діловоді',
          color: 'danger',
          hideIcon: false,
          icon: ToastService.createIcon("x-circle")
        });
      }
    } catch {
      ToastService.show({
        title: 'Помилка',
        description: 'Помилка з\'єднання з сервером',
        color: 'danger',
        hideIcon: false,
        icon: ToastService.createIcon("x-circle")
      });
    }
  };

  // Показати деталі замовлення
  const handleShowDetails = (order: SalesDriveOrderForExport) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  // Вивантаження замовлення в Діловод (заглушка)
  const handleExportOrder = async (order: SalesDriveOrderForExport) => {
    try {
      ToastService.show({
        title: 'Вивантаження...',
        description: `Вивантажуємо замовлення ${order.orderNumber} в Діловод`,
        color: 'primary'
      });

      const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/export`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success && result.exported) {
        ToastService.show({
          title: 'Успішно!',
          description: result.message,
          color: 'success'
        });
        // Обновляем данные после успешного экспорта
        fetchOrders();
      } else {
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

  // Створення документа відвантаження в Діловоді (заглушка)
  const handleCreateShipment = async (order: SalesDriveOrderForExport) => {
    try {
      ToastService.show({
        title: 'Створення...',
        description: `Створюємо документ відвантаження для ${order.orderNumber}`,
        color: 'primary'
      });

      const response = await apiCall(`/api/dilovod/salesdrive/orders/${order.id}/shipment`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success && result.created) {
        ToastService.show({
          title: 'Успішно!',
          description: result.message,
          color: 'success'
        });
        // Обновляем данные после создания документа
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

  // Колонки таблицы
  const columns = [
    { key: "orderNumber", label: "№ замовлення", sortable: true },
    { key: "orderDate", label: "Дата оформлення", sortable: true },
    { key: "status", label: "Статус", sortable: false },
    { key: "paymentMethod", label: "Оплата", sortable: false },
    { key: "shippingMethod", label: "Доставка", sortable: false },
    { key: "sajt", label: "Канал", sortable: true },
    { key: "dilovodExportDate", label: "Додано в Діловод", sortable: false },
    { key: "actions", label: "Дії", sortable: false }
  ];

  return (
    <div className={`space-y-4 ${className}`}>
			<div className="flex gap-4 items-center justify-between">
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
			</div>

      {/* Таблица */}
      <div className="relative">
        <Table
          aria-label="Таблиця замовлень SalesDrive"
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
                  <span className="font-medium">{order.orderNumber}</span>
                </TableCell>
                <TableCell>
									<Tooltip placement="top-start" content={order.orderDate ? new Date(order.orderDate).toLocaleString('uk-UA') : 'Дата не задана'}>
										{order.orderDate ? formatRelativeDate(order.orderDate.toString(), { maxRelativeDays: 1 }) : 'Не задано'}
									</Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip placement="top-start" content={`Оновлено: ${order.updatedAt ? new Date(order.updatedAt).toLocaleString('uk-UA') : 'Дата не задана'}`}>
                  <Chip size="sm" variant="flat" classNames={{base: getStatusColor(getOrderStatusCode(order.statusText || order.status))}}>
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
                    <Tooltip content={order.dilovodExportDate ? new Date(order.dilovodExportDate).toLocaleString('uk-UA') : 'Ще не вивантажено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none rounded-sm ${order.dilovodExportDate ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="search-check" size={16} /></div>
                    </Tooltip>
                    <Tooltip content={order.dilovodSaleExportDate ? new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA') : 'Ще не відвантажено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none rounded-sm ${order.dilovodSaleExportDate ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="truck" size={16} /></div>
                    </Tooltip>
                    <Tooltip content={order.dilovodCashInDate ? new Date(order.dilovodCashInDate).toLocaleString('uk-UA') : 'Ще не оплачено'}>
                      <div className={`w-8 h-8 inline-flex items-center justify-center box-border select-none rounded-sm ${order.dilovodCashInDate ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-300'}`}><DynamicIcon name="wallet" size={16} /></div>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell>
                  

                  <ButtonGroup variant="flat">
                    <Button onPress={() => handleShowDetails(order)} isIconOnly variant="flat" className="font-medium p-2 mr-1.5 h-9 rounded-md" startContent={<DynamicIcon name="eye" size={14} />}></Button>
                    <Dropdown placement="bottom-end">
                      <DropdownTrigger>
                        <Button variant="flat" className="font-medium px-4 py-2 h-auto rounded-md" endContent={<DynamicIcon name="chevron-down" size={12} />}>Інші дії</Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        disallowEmptySelection
                        aria-label="Дії із замовленням"
                        variant="faded"
                        className="max-w-[300px]"
                        onAction={(key) => {
                          // if (key === "showDetails") handleShowDetails(order);
                          if (key === "checkDilovod") handleCheckInDilovod(order);
                          if (key === "exportOrder") handleExportOrder(order);
                          if (key === "createShipment") handleCreateShipment(order);
                        }}
                      >
                        <DropdownSection showDivider>
                          {/* <DropdownItem key="showDetails" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="eye" size={16} />}>Показати всі дані</DropdownItem> */}
                          <DropdownItem key="checkDilovod" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="search-check" size={16} />}>Перевірити в Діловоді</DropdownItem>
                          <DropdownItem key="exportOrder" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="upload" size={16} />}>Відправити замовлення</DropdownItem>
                          <DropdownItem key="createShipment" className="px-3 py-2" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="truck" size={16} />}>Відправити відвантаження</DropdownItem>
                        </DropdownSection>
                        <DropdownItem key="footer" className="px-3 py-2 font-semibold text-default-700 cursor-default data-[hover=true]:bg-white border-none" startContent={<DynamicIcon className="text-xl text-default-500 pointer-events-none shrink-0" name="key" size={14} />}>
                          <div className="flex items-center justify-between text-xs">
                            {order.dilovodDocId || 'Немає ID'}
                            {order.dilovodDocId && <Button variant="flat" size="sm" className="px-2 py-1 min-w-auto h-auto rounded" onPress={() => {navigator.clipboard.writeText(order.dilovodDocId || '')}}>Copy</Button>}
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

          {/* Масові дії */}
          <Button
            color="primary"
            variant="solid"
            className="font-medium px-4 py-2.5 rounded-md h-auto"
            startContent={<DynamicIcon name="refresh-cw" size={16} />}
            onPress={handleBulkCheckAndUpdate}
          >
            Оновити статуси документів
          </Button>
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

      {/* Модальне вікно з деталями замовлення */}
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
                Деталі замовлення #{selectedOrder?.orderNumber}
              </ModalHeader>
              <ModalBody>
                {selectedOrder && (
                  <div className="space-y-4">
                    {/* Основная информация */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <div className="text-sm text-blue-600 font-medium">Номер замовлення</div>
                        <div className="text-lg font-bold text-blue-800">{selectedOrder.orderNumber}</div>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <div className="text-sm text-green-600 font-medium">Дата оформлення</div>
                        <div className="text-lg font-bold text-green-800">
                          {selectedOrder.orderDate ? new Date(selectedOrder.orderDate).toLocaleDateString('uk-UA') : 'Не задано'}
                        </div>
                      </div>
                    </div>

                    {/* JSON данные */}
                    <div className="mt-6">
                      <h4 className="text-lg font-semibold mb-3 text-neutral-700">
                        Всі дані замовлення (JSON)
                      </h4>
                      <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
                        <pre className="text-sm">
                          {JSON.stringify(
                            {
                              ...selectedOrder,
                              items: typeof selectedOrder.items === 'string' 
                                ? JSON.parse(selectedOrder.items) 
                                : selectedOrder.items,
                              rawData: typeof selectedOrder.rawData === 'string' 
                                ? JSON.parse(selectedOrder.rawData) 
                                : selectedOrder.rawData
                            }, 
                            null, 
                            2
                          )}
                        </pre>
                      </div>
                    </div>
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