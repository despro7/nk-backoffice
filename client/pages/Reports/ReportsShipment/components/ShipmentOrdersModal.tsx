import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatDate, pluralize } from "@/lib";
import { getStatusColor } from "@/lib/formatUtils.js";
import { formatTrackingNumberWithIcon } from "@/lib/formatUtilsJSX";
import type {
  ShipmentModalProduct,
  ShipmentProductOrder,
  ShipmentOrdersTabKey,
} from "../ReportsShipmentTypes";
import { useCallback, useEffect, useMemo, useState } from "react";

interface ShipmentOrdersModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isLoading: boolean;
  orders: ShipmentProductOrder[];
  /** Замовлення, де товар був компонентом монолітного набору */
  monolithicOrders?: ShipmentProductOrder[];
  /** Який таб активний за замовчуванням при відкритті */
  defaultTab?: ShipmentOrdersTabKey;
  /** Якщо true — відкриваємо старий формат (плоский список без табів) для монолітних наборів */
  useMonolithicModal?: boolean;
  product: ShipmentModalProduct | null;
}

export function ShipmentOrdersModal({
  isOpen,
  onOpenChange,
  isLoading,
  orders,
  monolithicOrders = [],
  defaultTab = "regular",
  useMonolithicModal = false,
  product,
}: ShipmentOrdersModalProps) {
  const [selectedTab, setSelectedTab] = useState<ShipmentOrdersTabKey>(defaultTab);

  // Скидаємо активний таб при зміні defaultTab (нове відкриття модалки)
  useEffect(() => {
    setSelectedTab(defaultTab);
  }, [defaultTab]);

  // Плавний fade-перехід контенту при перемиканні табів:
  // при зміні selectedTab спочатку ховаємо контент (fade-out),
  // потім через 150мс показуємо новий (fade-in).
  const [contentVisible, setContentVisible] = useState(true);
  const switchTab = useCallback((next: ShipmentOrdersTabKey) => {
    if (next === selectedTab) return;
    setContentVisible(false);
    window.setTimeout(() => {
      setSelectedTab(next);
      setContentVisible(true);
    }, 150);
  }, [selectedTab]);

  // Активний список залежно від табу (для заголовка та тіла)
  const activeOrders = selectedTab === "monolithic" ? monolithicOrders : orders;
  const activePortions = activeOrders.reduce(
    (sum, order) => sum + (order.regularQuantity ?? order.monolithicComponentQuantity ?? order.productQuantity ?? 0),
    0,
  );

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedOrders = useMemo(() => {
    if (!sortField) return orders;

    const getComparable = (o: ShipmentProductOrder) => {
      const v: any = (o as any)[sortField];
      if (v === undefined || v === null) return "";
      // detect dates (ISO strings or Date)
      if (typeof v === "string") {
        const d = Date.parse(v);
        if (!Number.isNaN(d)) return d;
        return v.toLowerCase();
      }
      if (v instanceof Date) return v.getTime();
      if (typeof v === "number") return v;
      return String(v).toLowerCase();
    };

    const copy = [...orders];
    copy.sort((a, b) => {
      const A = getComparable(a);
      const B = getComparable(b);

      if (A === B) return 0;

      // numbers (dates are numbers after parse)
      if (typeof A === "number" && typeof B === "number") {
        return sortDirection === "asc" ? A - B : B - A;
      }

      // fallback to string compare
      return sortDirection === "asc"
        ? String(A).localeCompare(String(B))
        : String(B).localeCompare(String(A));
    });

    return copy;
  }, [orders, sortField, sortDirection]);

  const sortedMonolithicOrders = useMemo(() => {
    if (!sortField) return monolithicOrders;

    const getComparable = (o: ShipmentProductOrder) => {
      const v: any = (o as any)[sortField];
      if (v === undefined || v === null) return "";
      if (typeof v === "string") {
        const d = Date.parse(v);
        if (!Number.isNaN(d)) return d;
        return v.toLowerCase();
      }
      if (v instanceof Date) return v.getTime();
      if (typeof v === "number") return v;
      return String(v).toLowerCase();
    };

    const copy = [...monolithicOrders];
    copy.sort((a, b) => {
      const A = getComparable(a);
      const B = getComparable(b);

      if (A === B) return 0;

      if (typeof A === "number" && typeof B === "number") {
        return sortDirection === "asc" ? A - B : B - A;
      }

      return sortDirection === "asc"
        ? String(A).localeCompare(String(B))
        : String(B).localeCompare(String(A));
    });

    return copy;
  }, [monolithicOrders, sortField, sortDirection]);

  const handleSortToggle = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderOrdersTable = (orderList: ShipmentProductOrder[], quantityField: "regularQuantity" | "monolithicComponentQuantity") => {
    if (orderList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <DynamicIcon name="inbox" size={48} className="text-gray-300 mb-2" />
          <span>Немає замовлень для відображення</span>
        </div>
      );
    }

    return (
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
            <TableColumn className="text-sm font-medium">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleSortToggle("orderNumber")}>№
                {sortField === "orderNumber" && (
                  <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />
                )}
              </div>
            </TableColumn>
            <TableColumn className="text-sm font-medium">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleSortToggle("ttn")}>ТТН{sortField === "ttn" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
            </TableColumn>
            <TableColumn className="text-sm font-medium">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleSortToggle("orderDate")}>Оформлено{sortField === "orderDate" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
            </TableColumn>
            <TableColumn className="text-sm font-medium">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleSortToggle("dilovodSaleExportDate")}>Відвантажено{sortField === "dilovodSaleExportDate" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
            </TableColumn>
            <TableColumn className="text-sm font-medium">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleSortToggle("status")}>Статус{sortField === "status" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
            </TableColumn>
            <TableColumn className="text-sm font-medium text-center">
              <div className="flex items-center gap-2 justify-center cursor-pointer select-none" onClick={() => handleSortToggle("productQuantity")}>{(useMonolithicModal ? "Наборів" : "Порцій")}{sortField === "productQuantity" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
            </TableColumn>
            <TableColumn className="text-sm font-medium text-right">
              <div className="flex items-center gap-2 justify-end cursor-pointer select-none" onClick={() => handleSortToggle("totalPrice")}>Сума{sortField === "totalPrice" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
            </TableColumn>
            <TableColumn className="text-sm font-medium text-center">Дії</TableColumn>
          </TableHeader>
          <TableBody items={orderList}>
            {(order) => (
              <TableRow key={order.externalId} className="hover:bg-grey-50 transition-colors duration-200">
                <TableCell className="font-medium text-sm">{order.orderNumber}</TableCell>
                <TableCell className="font-medium text-sm">
                  {order.ttn &&
                    formatTrackingNumberWithIcon(order.ttn, {
                      compactMode: true,
                      boldLastGroup: true,
                      showIcon: false,
                    })}
                </TableCell>
                <TableCell className="text-sm text-neutral-600">{formatDate(order.orderDate)}</TableCell>
                <TableCell className="text-sm text-neutral-600">{formatDate(order.dilovodSaleExportDate)}</TableCell>
                <TableCell className="text-sm">
                  {order.dilovodReturnDate ? (
                    <Tooltip color="secondary" content={`Повернено ${formatDate(order.dilovodReturnDate)}`}>
                      <Chip
                        size="sm"
                        variant="flat"
                        className="text-xs"
                        classNames={{ base: getStatusColor(order.status) }}
                      >
                        {order.statusText}
                      </Chip>
                    </Tooltip>
                  ) : (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="text-xs"
                      classNames={{ base: getStatusColor(order.status) }}
                    >
                      {order.statusText}
                    </Chip>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm font-semibold">
                  {order[quantityField] ?? order.productQuantity}
                </TableCell>
                <TableCell className="text-right text-sm text-neutral-600">
                  {order.totalPrice !== undefined && order.totalPrice !== null
                    ? Number(order.totalPrice)
                        .toLocaleString("uk-UA", {
                          style: "currency",
                          currency: "UAH",
                          maximumFractionDigits: 0,
                        })
                        .replace(/\s?грн\.?|UAH|₴/gi, "")
                    : "—"}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    className="h-8 min-w-0 px-2"
                    onPress={() => window.open(`/orders/${order.externalId}`, "_blank")}
                  >
                    <DynamicIcon name="eye" size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="4xl"
      scrollBehavior="outside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2>
                {activeOrders.length} {pluralize(activeOrders.length, "замовлення", "замовлення", "замовлень")} для "{product?.name}"
                <span
                  className={`rounded-sm text-sm px-2 py-1 ml-2 ${
                    selectedTab === "monolithic"
                      ? "bg-warning/15 text-orange-400"
                      : "bg-blue-200/40 text-blue-900/75"
                  }`}
                >
                  {activePortions} {useMonolithicModal
                    ? pluralize(activePortions, "набір", "набори", "наборів")
                    : pluralize(activePortions, "порція", "порції", "порцій")}
                </span>
              </h2>
              <span className="text-sm font-normal text-neutral-500">
                SKU: {product?.sku}
              </span>
            </ModalHeader>
            <ModalBody>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-3 text-gray-600">Завантаження замовлень...</span>
                </div>
              ) : useMonolithicModal ? (
                // Старий формат для монолітних наборів — плоский список без табів
                renderOrdersTable(sortedMonolithicOrders, "monolithicComponentQuantity")
              ) : (
                <div className="space-y-4">
                  {/* Кастомні таби замість HeroUI Tabs: підкреслення через CSS (без JS-вимірювань),
                      тому індикатор не зміщується під час анімації появи модалки. */}
                  <div className="flex gap-1 border-b border-default-200">
                    <button
                      type="button"
                      onClick={() => switchTab("regular")}
                      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        selectedTab === "regular"
                          ? "border-blue-700/75 text-blue-700/75"
                          : "border-transparent text-default-500 hover:text-default-700"
                      }`}
                    >
                      <DynamicIcon name="package" size={16} />
                      <span>Звичайні порції</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTab("monolithic")}
                      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        selectedTab === "monolithic"
                          ? "border-warning text-warning"
                          : "border-transparent text-default-500 hover:text-default-700"
                      }`}
                    >
                      <DynamicIcon name="boxes" size={16} />
                      <span>У складі монолітних наборів</span>
                    </button>
                  </div>

                  <div
                    className="transition-opacity duration-150 ease-in-out"
                    style={{ opacity: contentVisible ? 1 : 0 }}
                  >
                    {selectedTab === "monolithic"
                      ? renderOrdersTable(sortedMonolithicOrders, "monolithicComponentQuantity")
                      : renderOrdersTable(sortedOrders, "regularQuantity")}
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
  );
}