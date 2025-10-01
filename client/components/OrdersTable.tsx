import { useState, useEffect, useMemo, useCallback } from "react";
import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell, Pagination, Tooltip } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { TabsFilter } from "./TabsFilter";
import { cn } from "../lib/utils";

import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusColor } from "../lib/formatUtils";
import { formatTrackingNumberWithIcon } from "@/lib/formatUtilsJSX";

interface OrderItem {
  productName: string;
  quantity: number;
  price: number;
  sku: string;
}

interface Order {
  id: string;
  orderNumber: string;
  ttn: string;
  quantity: number;
  status: string;
  statusText: string;
  items: OrderItem[];
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalPrice?: number;
  orderDate: string;
  updatedAt: string;
  externalId?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  cityName?: string;
  provider?: string;
  rawData: any;
}

interface OrdersTableProps {
  className?: string;
  filter?: "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum";
  searchQuery?: string;
  onTabChange?: (key: "confirmed" | "readyToShip" | "shipped" | "all" | "all_sum") => void;
}

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

const columns = [
  { key: "orderNumber", label: "№ Замов.", className: "w-2/10" },
  { key: "orderDate", label: "Дата створення", className: "w-3/10" },
  { key: "ttn", label: "ТТН", className: "w-2/10" },
  { key: "quantity", label: "Кіл-ть", className: "w-1/10" },
  { key: "status", label: "Статус", className: "w-2/10" },
];

export function OrdersTable({ className, filter = "all", searchQuery = "", onTabChange }: OrdersTableProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalOrders, setTotalOrders] = useState(0);
  const [pageSize, setPageSize] = useState<number>(8);
  const [statusCounts, setStatusCounts] = useState<{
    confirmed: number;
    readyToShip: number;
    shipped: number;
    all: number;
  }>({
    confirmed: 0,
    readyToShip: 0,
    shipped: 0,
    all: 0
  });
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "orderDate",
    direction: "ascending"
  });
  const [page, setPage] = useState(1);
  const { apiCall } = useApi();

  // Загружаем настройки размера страницы из базы данных
  useEffect(() => {
    const loadPageSize = async () => {
      try {
        const response = await apiCall('/api/settings');
        if (response.ok) {
          const allSettings = await response.json();

          // Ищем настройку размера страницы
          const pageSizeSetting = allSettings.find((s: any) => s.key === 'orders_page_size');
          if (pageSizeSetting) {
            setPageSize(parseInt(pageSizeSetting.value));
          }
        }
      } catch (error) {
        console.error('Error loading page size setting:', error);
        // Оставляем значение по умолчанию (10)
      }
    };

    loadPageSize();
  }, []);

  // Загрузка заказов с пагинацией и фильтрацией
  const fetchOrders = async (pageNum: number = 1, currentPageSize: number = pageSize, statusFilter?: string, currentSortDescriptor: SortDescriptor = sortDescriptor) => {
    const startTime = Date.now();
    
    setLoading(true);
    try {
      // Запрашиваем только нужную страницу заказов
      const queryParams = new URLSearchParams({
        limit: currentPageSize.toString(),
        offset: ((pageNum - 1) * currentPageSize).toString(),
        sortBy: currentSortDescriptor.column,
        sortOrder: currentSortDescriptor.direction === "ascending" ? "asc" : "desc"
      });

      // Добавляем фильтр статуса если он указан
      if (statusFilter) {
        if (statusFilter === 'confirmed') queryParams.set('status', '2');
        else if (statusFilter === 'readyToShip') queryParams.set('status', '3');
        else if (statusFilter === 'shipped') queryParams.set('status', '4');
        else if (statusFilter === 'all_sum') queryParams.set('status', '2,3,4');
      }

      const response = await apiCall('/api/orders?' + queryParams.toString());

      const data = await response.json();

      if (data.success) {
        setOrders(data.data || []);
        setTotalOrders(data.metadata?.totalOrders || 0);

        // Обновляем счетчики статусов из метаданных
        if (data.metadata?.statusCounts) {
          setStatusCounts(data.metadata.statusCounts);
        }

        // Обновляем номер страницы, если он выходит за границы
        const totalPages = Math.ceil((data.metadata?.totalOrders || 0) / currentPageSize);
        setPage(Math.min(pageNum, Math.max(1, totalPages)));
      } else {
        console.warn('⚠️ [CLIENT] OrdersTable: API returned success=false:', data);
      }
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error('❌ [CLIENT] OrdersTable: Error fetching orders after', errorTime, 'ms:', error);
    } finally {
      setLoading(false);
    }
  };

  // Фильтрация заказов (только по поиску, статус уже отфильтрован на сервере)
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Фильтр по поиску
    if (searchQuery) {
      filtered = filtered.filter(order =>
        order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.ttn.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [orders, searchQuery]); // Убрали filter из зависимостей

  // Пагинация - теперь только серверная
  const pages = Math.ceil(totalOrders / pageSize);
  const displayOrders = filteredOrders; // Используем отфильтрованные заказы для отображения

  // Загружаем заказы при изменении фильтра или страницы
  useEffect(() => {
    // При изменении фильтра или поискового запроса, всегда возвращаемся на первую страницу
    if (page !== 1) {
      setPage(1);
      return; // Прерываем текущее выполнение, чтобы избежать лишнего запроса
    }
    fetchOrders(1, pageSize, filter, sortDescriptor);
  }, [filter, searchQuery]);

  // Загружаем заказы при изменении страницы, размера страницы или сортировки
  useEffect(() => {
    fetchOrders(page, pageSize, filter, sortDescriptor);
  }, [page, pageSize, sortDescriptor]);

  const handleRowClick = (externalId: string) => {
    navigate(`/orders/${externalId}`);
  };

  const onSortChange = useCallback((descriptor: SortDescriptor) => {
    setSortDescriptor(descriptor);
  }, []);

  return (
    <div className="space-y-4">
      {/* Панель управления */}
      <div className="flex justify-between items-center">
        <TabsFilter
          selectedTab={filter}
          onTabChange={onTabChange || (() => {})}
          counts={statusCounts}
        />
      </div>

      {/* Таблица заказов */}
      <Table
        aria-label="Orders table"
        sortDescriptor={sortDescriptor}
        onSortChange={(descriptor) => onSortChange(descriptor as SortDescriptor)}
        radius="lg"
        classNames={{
          base: "max-w-7xl",
          wrapper: "rounded-lg w-full",
          th: [
            "first:rounded-s-sm",
            "last:rounded-e-sm",
            "bg-neutral-100",
            "text-neutral-500",
            "border-b-0",
            "text-[13px]",
            "font-semibold",
            "uppercase",
            "leading-5",
            "px-2.5"
          ],
          td: [
            "text-black",
            "text-base",
            "font-normal", 
            "leading-[130%]",
            "px-2.5",
            "py-3",
            "last:border-b-0",
          ],
          tbody: "divide-y divide-grey-200"
        }}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn 
              key={column.key} 
              className={column.className}
              allowsSorting={true}
            >
              {column.label}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={displayOrders}
          emptyContent={<div className="text-grey-500/75">Замовлень не знайдено</div>}
          isLoading={loading}
          loadingContent={
            <div className="text-grey-500 bg-white/50 backdrop-blur-sm rounded-lg flex items-center justify-center self-start mt-5 p-10 z-10 shadow-lg">
              <DynamicIcon name="loader-2" className="animate-spin mr-2" size={16} />
              <span>Завантаження замовлень...</span>
            </div>
          }
        >
          {(order) => (
            <TableRow 
              key={order.externalId}
              className="cursor-pointer hover:bg-gray-50"
            >
              <TableCell onClick={() => handleRowClick(order.externalId)}>
                {order.orderNumber}
              </TableCell>
              <TableCell onClick={() => handleRowClick(order.externalId)} className="text-[15px]">
                {formatRelativeDate(order.orderDate, { maxRelativeDays: 30 })}
              </TableCell>
              <TableCell onClick={() => handleRowClick(order.externalId)}>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  {order.ttn && formatTrackingNumberWithIcon(order.ttn, {
                    provider: order.provider,
                    iconSize: 'absolute',
                    iconSizeValue: '1.2rem',
                    compactMode: true,
                    boldLastGroup: false
                  })}
                </div>
              </TableCell>
              <TableCell onClick={() => handleRowClick(order.externalId)}>
                {order.quantity}
              </TableCell>
              <TableCell>
                <span className={cn(getStatusColor(order.status), "px-2 py-1 rounded-full text-xs whitespace-nowrap")}>
                  {order.rawData?.statusText || order.statusText}
                </span>
                {order.updatedAt && (
                <span className="block text-xs text-gray-500 ml-2 mt-1">
                    {formatRelativeDate(order.updatedAt, { maxRelativeDays: 30, include2DaysAgo: false, showYear: false, includeWeekdays: true, shortWeekday: true })}
                </span>
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Пагинация */}
      {totalOrders > pageSize && (
        <div className="flex justify-center">
          <Pagination
            total={pages}
            page={page}
            onChange={(newPage) => {
              setPage(newPage);
            }}
            showControls
            showShadow
            classNames={{
              cursor: "bg-neutral-500 text-white",
              item: "cursor-pointer",
              next: "cursor-pointer",
              prev: "cursor-pointer",
            }}
          />
        </div>
      )}
    </div>
  );
}
