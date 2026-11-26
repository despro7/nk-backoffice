import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  type SortDescriptor,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatDateLong, formatWeekdayOnly, getStatusLabel } from "@/lib";
import { OrderStatusChip } from "@/components/OrderStatusChip";
import type { SalesData } from "../ReportsSalesTypes";

type DayOrder = SalesData["orders"][number];

const ORDER_COLUMNS = [
  { key: "orderNumber", label: "№" },
  { key: "orderDate", label: "Дата оформлення" },
  { key: "portionsCount", label: "Порцій" },
  { key: "source", label: "Джерело" },
  { key: "totalPrice", label: "Сума" },
  { key: "discount", label: "Знижка" },
  { key: "status", label: "Статус" },
];

function orderSortValue(order: DayOrder, column: string): string | number {
  switch (column) {
    case "orderNumber":
      return order.orderNumber;
    case "orderDate":
      return order.orderDateIso ? new Date(order.orderDateIso).getTime() : 0;
    case "portionsCount":
      return order.portionsCount || 0;
    case "source":
      return order.source || "";
    case "totalPrice":
      return Number(order.totalPrice) || 0;
    case "discount":
      return order.hasDiscount || order.discountReasonCode ? 1 : 0;
    case "status":
      return getStatusLabel(order.status);
    default:
      return 0;
  }
}

interface SalesDateDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  details: SalesData | null;
  dayStartHour: number;
  /** Дати зі звіту для перемикання на сусідні дні. */
  dateItems?: SalesData[];
  onNavigate?: (details: SalesData) => void;
}

export function SalesDateDetailsModal({
  isOpen,
  onOpenChange,
  details,
  dayStartHour,
  dateItems = [],
  onNavigate,
}: SalesDateDetailsModalProps) {
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "orderDate",
    direction: "ascending",
  });

  const sortedOrders = useMemo(() => {
    const column = String(sortDescriptor.column);
    const sign = sortDescriptor.direction === "descending" ? -1 : 1;

    return [...(details?.orders ?? [])].sort((first, second) => {
      const a = orderSortValue(first, column);
      const b = orderSortValue(second, column);
      const cmp =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b), "uk-UA", { numeric: true });
      return cmp * sign;
    });
  }, [details, sortDescriptor]);

  const chronologicalItems = useMemo(
    () =>
      [...dateItems].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [dateItems],
  );

  const currentIndex = useMemo(() => {
    if (!details) return -1;
    return chronologicalItems.findIndex((item) => item.date === details.date);
  }, [chronologicalItems, details]);

  const prevItem = currentIndex > 0 ? chronologicalItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < chronologicalItems.length - 1
      ? chronologicalItems[currentIndex + 1]
      : null;

  useEffect(() => {
    if (!isOpen || !onNavigate) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && prevItem) {
        event.preventDefault();
        onNavigate(prevItem);
      } else if (event.key === "ArrowRight" && nextItem) {
        event.preventDefault();
        onNavigate(nextItem);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, nextItem, onNavigate, prevItem]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: "rounded-xl overflow-visible max-h-[calc(100dvh-5rem)]",
        wrapper: "overflow-visible",
      }}
    >
      <ModalContent className="relative overflow-visible">
        {onNavigate && (
          <>
            <Button
              isIconOnly
              variant="flat"
              aria-label="Попередня дата"
              isDisabled={!prevItem}
              onPress={() => prevItem && onNavigate(prevItem)}
              className={`absolute -left-14 top-1/2 z-20 hidden h-30 w-10 -translate-y-1/2 rounded-full ${prevItem ? "bg-white" : "bg-white/25"} shadow-md min-[1040px]:flex`}
            >
              <DynamicIcon name="chevron-left" size={28} />
            </Button>
            <Button
              isIconOnly
              variant="flat"
              aria-label="Наступна дата"
              isDisabled={!nextItem}
              onPress={() => nextItem && onNavigate(nextItem)}
              className={`absolute -right-14 top-1/2 z-20 hidden h-30 w-10 -translate-y-1/2 rounded-full ${nextItem ? "bg-white" : "bg-white/25"} shadow-md min-[1040px]:flex`}
            >
              <DynamicIcon name="chevron-right" size={28} />
            </Button>
          </>
        )}
        <ModalHeader className="flex items-center gap-2 pr-10 text-base sm:text-lg">
          {onNavigate && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Попередня дата"
              isDisabled={!prevItem}
              onPress={() => prevItem && onNavigate(prevItem)}
              className="min-[1040px]:hidden"
            >
              <DynamicIcon name="chevron-left" size={18} />
            </Button>
          )}
          <span className="min-w-0 flex-1">
            Деталі за{" "}
            {details &&
              formatDateLong(details.date)
              + " (" +
              formatWeekdayOnly(details.date)
              + ")"
            }
          </span>
          {onNavigate && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Наступна дата"
              isDisabled={!nextItem}
              onPress={() => nextItem && onNavigate(nextItem)}
              className="min-[1040px]:hidden"
            >
              <DynamicIcon name="chevron-right" size={18} />
            </Button>
          )}
        </ModalHeader>
        <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-xs text-gray-100 lg:block">Підказка: використовуйте кнопки <span className="bg-gray-100 text-black px-1 py-0.5 inline-block leading-none rounded">←</span> та <span className="bg-gray-100 text-black px-1 py-0.5 inline-block leading-none rounded">→</span> для навігації по днях</div>
        <ModalBody className="min-h-0 px-3 pt-0 sm:px-6">
          {details && (
            <div className="space-y-4 pt-2 pb-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-100">
                  <div className="text-sm text-blue-700 font-medium">Замовлень</div>
                  <div className="text-2xl md:text-3xl font-bold text-blue-700">{details.ordersCount}</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center border border-green-200/75">
                  <div className="text-sm text-green-700 font-medium">Порцій</div>
                  <div className="text-2xl md:text-3xl font-bold text-green-700">{details.portionsCount}</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg text-center border border-yellow-200">
                  <div className="text-sm text-yellow-700 font-medium">Загальна сума</div>
                  <div className="text-2xl md:text-3xl font-bold text-yellow-700">
                    {details.totalPrice !== undefined
                      ? details.totalPrice
                          .toLocaleString("uk-UA", {
                            style: "currency",
                            currency: "UAH",
                            maximumFractionDigits: 0,
                          })
                          .replace(/\s?грн\.?|UAH|₴/gi, " ₴")
                      : "—"}
                  </div>
                </div>
                <div className="p-3 bg-fuchsia-50 rounded-lg text-center border border-fuchsia-200/75">
                  <div className="text-sm text-fuchsia-700 font-medium">Середній чек</div>
                  <div className="text-2xl md:text-3xl font-bold text-fuchsia-700">
                    {details.totalPrice !== undefined
                      ? (details.totalPrice / (details.ordersCount || 1))
                          .toLocaleString("uk-UA", {
                            style: "currency",
                            currency: "UAH",
                            maximumFractionDigits: 0,
                          })
                          .replace(/\s?грн\.?|UAH|₴/gi, " ₴")
                      : "—"}
                  </div>
                </div>
              </div>

              {(details.vidskoduvannaTotal || 0) > 0 && (
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                    <div className="text-xs text-orange-700 font-medium mb-1">Замовлень з відшкодуванням</div>
                    <div className="text-2xl font-bold text-orange-700">{details.vidskoduvannaTotal}</div>
                  </div>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                    <div className="text-xs text-orange-700 font-medium mb-1">Кількість порцій</div>
                    <div className="text-2xl font-bold text-orange-700">{details.vidskoduvannaPortions || 0}</div>
                  </div>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                    <div className="text-xs text-orange-700 font-medium mb-1">Сума відшкодувань</div>
                    <div className="text-2xl font-bold text-orange-700">
                      {(details.vidskoduvannaGrnTotal || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 pt-1 sm:flex-row">
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3 relative">
                    <h4 className="text-[11px] font-medium uppercase mb-2 text-neutral-400 absolute -top-2 left-1/2 -translate-x-1/2">
                      <span className="bg-white px-2 py-0.5 whitespace-nowrap">По джерелах</span>
                    </h4>
                    <div className="">
                      {Object.entries(details.ordersBySource)
                        .sort((a, b) => b[1] - a[1])
                        .map(([source, orders]) => {
                          const portions = details.portionsBySource[source] || 0;
                          return (
                            <div key={source} className="flex justify-between items-center text-sm">
                              <span className="text-neutral-600">{source}</span>
                              <span className="font-medium">{orders} / {portions}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3 relative">
                  <h4 className="text-[11px] font-medium uppercase text-neutral-400 absolute -top-2 left-1/2 -translate-x-1/2">
                    <span className="bg-white px-2 py-0.5 whitespace-nowrap">Зі знижкою</span>
                  </h4>
                  <div className="flex justify-between items-center text-sm">
                    {details.discountReasonText && (
                      <span className="text-neutral-600">{details.discountReasonText}</span>
                    )}
                    {details.ordersWithDiscountReason} / {details.portionsWithDiscountReason}
                  </div>
                </div>

                <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3 relative">
                  <h4 className="text-[11px] font-medium uppercase text-neutral-400 absolute -top-2 left-1/2 -translate-x-1/2">
                    <span className="bg-white px-2 py-0.5 whitespace-nowrap">По статусах</span>
                  </h4>
                  <div>
                    {Object.keys({
                      ...details.ordersByStatus,
                      ...details.portionsByStatus,
                    })
                      .sort(
                        (a, b) =>
                          (details.ordersByStatus[b] || 0) -
                          (details.ordersByStatus[a] || 0),
                      )
                      .map((status) => {
                        const orders = details.ordersByStatus[status] || 0;
                        const portions = details.portionsByStatus[status] || 0;
                        return (
                          <div key={status} className="flex justify-between items-center text-sm">
                            <span className="text-neutral-600">{getStatusLabel(status)}</span>
                            <span className="font-medium">{orders} / {portions}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {details.orders && details.orders.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold mb-3 text-neutral-700">Замовлення за день</h4>
                  <div className="border border-neutral-200 rounded-lg overflow-hidden md:overflow-visible">
                    {/* На md+ шапка липне до прокрутки модалки, на вужчих таблиця має власну (є горизонтальна) */}
                    <Table
                      isHeaderSticky
                      sortDescriptor={sortDescriptor}
                      onSortChange={setSortDescriptor}
                      aria-label="Замовлення за день"
                      classNames={{
                        wrapper: "min-h-0 max-h-[60dvh] overflow-auto p-2 sm:p-3 md:max-h-none md:overflow-visible",
                        table: "min-w-full",
                        thead: "[&>tr]:first:shadow-none",
                        th: ["first:rounded-s-sm", "last:rounded-e-sm", "whitespace-nowrap"],
                        td: "whitespace-nowrap",
                      }}
                    >
                      <TableHeader columns={ORDER_COLUMNS}>
                        {(column) => (
                          <TableColumn key={column.key} allowsSorting className="text-sm font-medium">
                            {column.label}
                          </TableColumn>
                        )}
                      </TableHeader>
                      <TableBody items={sortedOrders} emptyContent="Немає замовлень за цей день">
                        {(order) => (
                          <TableRow key={order.externalId}>
                              <TableCell className="font-medium text-sm">{order.orderNumber}</TableCell>
                              <TableCell className="text-sm text-neutral-600">{order.orderDate}</TableCell>
                              <TableCell className="text-sm text-neutral-600">{order.portionsCount || 0}</TableCell>
                              <TableCell className="text-sm text-neutral-600">{order.source || ""}</TableCell>
                              <TableCell className="text-sm text-neutral-600">
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
                              <TableCell className="text-sm text-neutral-600">
                                {order.hasDiscount || order.discountReasonCode ? (
                                  <Chip
                                    size="sm"
                                    variant="flat"
                                    className="text-xs"
                                    classNames={{ base: "bg-lime-200", content: "text-lime-800" }}
                                  >
                                    Так
                                  </Chip>
                                ) : (
                                  <span className="text-sm text-neutral-200">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                <OrderStatusChip
                                  status={order.status}
                                  statusHistory={order.statusHistory ?? []}
                                  dayStartHour={dayStartHour}
                                />
                              </TableCell>
                            </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
