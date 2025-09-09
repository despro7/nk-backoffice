import React, { useState, useEffect, useMemo } from "react";
import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell, Pagination } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { TabsFilter } from "./TabsFilter";
import { cn } from "../lib/utils";

import UkrPoshtaIcon from "/icons/ukr-poshta.svg";
import NovaPoshtaIcon from "/icons/nova-poshta.svg";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate, getStatusColor } from "../lib/formatUtils";

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

// Начальное значение, будет заменено настройками из БД
let ITEMS_PER_PAGE = 10;

const columns = [
  { key: "orderNumber", label: "№ Замов.", className: "w-2/16" },
  { key: "orderDate", label: "Дата створення", className: "w-3/16" },
  { key: "ttn", label: "ТТН", className: "w-6/16" },
  { key: "quantity", label: "Кіл-ть", className: "w-1/16" },
  { key: "status", label: "Статус", className: "w-4/16" },
];

export function OrdersTable({ className, filter = "all", searchQuery = "", onTabChange }: OrdersTableProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalOrders, setTotalOrders] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);
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

  console.log('🎯 [CLIENT] OrdersTable: Initialized with filter:', filter, `(default: all)`);
  console.log('📏 [CLIENT] OrdersTable: Page size:', pageSize);

  // Загрузка заказов с пагинацией и фильтрацией
  const fetchOrders = async (pageNum: number = 1, currentPageSize: number = pageSize, statusFilter?: string) => {
    const startTime = Date.now();
    console.log(`🔄 [CLIENT] OrdersTable: Starting orders fetch (page ${pageNum}, size ${currentPageSize}, status: ${statusFilter || 'all'})...`);

    setLoading(true);
    try {
      // Запрашиваем только нужную страницу заказов
      const queryParams = new URLSearchParams({
        limit: currentPageSize.toString(),
        offset: ((pageNum - 1) * currentPageSize).toString(),
        sortBy: 'orderDate',
        sortOrder: 'desc'
      });

      // Добавляем фильтр статуса если он указан
      if (statusFilter) {
        if (statusFilter === 'confirmed') queryParams.set('status', '2');
        else if (statusFilter === 'readyToShip') queryParams.set('status', '3');
        else if (statusFilter === 'shipped') queryParams.set('status', '4');
        else if (statusFilter === 'all_sum') queryParams.set('status', '2,3,4');
      }

      console.log('📡 [CLIENT] OrdersTable: Making API call to /api/orders?' + queryParams.toString());
      const response = await apiCall('/api/orders?' + queryParams.toString());

      console.log('📡 [CLIENT] OrdersTable: API response status:', response.status);
      const data = await response.json();

      const fetchTime = Date.now() - startTime;
      console.log('✅ [CLIENT] OrdersTable: API response received in', fetchTime, 'ms');
      console.log('📊 [CLIENT] OrdersTable: Response data:', {
        success: data.success,
        ordersOnPage: data.data?.length || 0,
        totalOrders: data.metadata?.totalOrders || 0,
        hasData: !!data.data
      });

      if (data.success) {
        console.log('📦 [CLIENT] OrdersTable: Setting orders to state, count:', data.data?.length || 0);
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
      const totalTime = Date.now() - startTime;
      console.log('🏁 [CLIENT] OrdersTable: Fetch completed in', totalTime, 'ms');
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

  // Сортировка заказов
  const sortedOrders = useMemo(() => {
    if (!sortDescriptor.column) return filteredOrders;

    return [...filteredOrders].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortDescriptor.column) {
        case "orderNumber":
          aValue = a.orderNumber;
          bValue = b.orderNumber;
          break;
        case "orderDate":
          aValue = new Date(a.orderDate).getTime();
          bValue = new Date(b.orderDate).getTime();
          break;
        case "ttn":
          aValue = a.ttn || "";
          bValue = b.ttn || "";
          break;
        case "quantity":
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      if (sortDescriptor.direction === "ascending") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [filteredOrders, sortDescriptor]);

  // Пагинация - теперь только серверная
  const pages = Math.ceil(totalOrders / pageSize);
  const displayOrders = filteredOrders; // Используем отфильтрованные заказы для отображения

  // Сброс страницы при изменении фильтров
  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  // Загружаем заказы при изменении фильтра или страницы
  useEffect(() => {
    fetchOrders(page, pageSize, filter);
  }, [page, filter, pageSize]); // Добавляем filter в зависимости

  const handleRowClick = (externalId: string) => {
    navigate(`/orders/${externalId}`);
  };



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
        onSortChange={(descriptor) => setSortDescriptor(descriptor as SortDescriptor)}
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
            "py-6",
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
              <TableCell onClick={() => handleRowClick(order.externalId)}>
                {formatRelativeDate(order.orderDate)}
              </TableCell>
              <TableCell onClick={() => handleRowClick(order.externalId)}>
                <div className="flex items-center gap-2">
                  <img src={order.provider === "novaposhta" ? NovaPoshtaIcon : UkrPoshtaIcon} alt={order.shippingMethod} className="w-5 h-5" />
                  <span>{order.ttn}</span>
                </div>
              </TableCell>
              <TableCell onClick={() => handleRowClick(order.externalId)}>
                {order.quantity}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className={cn(getStatusColor(order.status), "px-2 py-1 rounded-full text-xs whitespace-nowrap")}>
                    {order.rawData?.statusText || order.statusText}
                  </span>
                </div>
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
              console.log(`📄 [CLIENT] OrdersTable: Changing to page ${newPage}`);
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
