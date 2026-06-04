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
} from "../ReportsShipmentTypes";
import { useMemo, useState } from "react";

interface ShipmentOrdersModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isLoading: boolean;
  orders: ShipmentProductOrder[];
  product: ShipmentModalProduct | null;
}

export function ShipmentOrdersModal({
  isOpen,
  onOpenChange,
  isLoading,
  orders,
  product,
}: ShipmentOrdersModalProps) {
  const totalPortions = orders.reduce(
    (sum, order) => sum + (order.productQuantity || 0),
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

  const handleSortToggle = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
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
                {orders.length} {pluralize(orders.length, "замовлення", "замовлення", "замовлень")} для "{product?.name}"
                <span className="bg-neutral-200/70 rounded-sm text-sm px-2 py-1 ml-2">
                  {totalPortions} {pluralize(totalPortions, "порція", "порції", "порцій")}
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
              ) : (
                <div className="space-y-4">
                  {orders.length === 0 ? (
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
                            <div className="flex items-center gap-2 justify-center cursor-pointer select-none" onClick={() => handleSortToggle("productQuantity")}>Порцій{sortField === "productQuantity" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
                          </TableColumn>
                          <TableColumn className="text-sm font-medium text-right">
                            <div className="flex items-center gap-2 justify-end cursor-pointer select-none" onClick={() => handleSortToggle("totalPrice")}>Сума{sortField === "totalPrice" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
                          </TableColumn>
                          <TableColumn className="text-sm font-medium text-center">Дії</TableColumn>
                        </TableHeader>
                        <TableBody items={sortedOrders}>
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
                              <TableCell className="text-center text-sm font-semibold">{order.productQuantity}</TableCell>
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
  );
}