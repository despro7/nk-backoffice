import { useEffect, useMemo } from "react";
import {
  Button,
  Chip,
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
  Tooltip,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatDate, formatDateLong, formatRelativeDate, formatWeekdayOnly, getStatusColor, getStatusLabel } from "@/lib";
import type { SalesData } from "../ReportsSalesTypes";

interface SalesDateDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  details: SalesData | null;
  dayStartHour: number;
  /** Дати зі звіту для перемикання на сусідні дні. */
  dateItems?: SalesData[];
  onNavigate?: (details: SalesData) => void;
}

const STATUS_ICONS: Record<string, string> = {
  "1": "circle-dashed",
  "2": "circle-check",
  "3": "package-check",
  "4": "truck",
  "5": "check-check",
  "6": "rotate-ccw",
  "7": "ban",
  "8": "trash-2",
  "9": "pause-circle",
};

const STATUS_CONFIRMED = "2";
const STATUS_READY_TO_SHIP = "3";

type StatusHistoryEntry = {
  status: string;
  statusText: string;
  changedAt: string;
};

const STATUS_DEDUPE_WINDOW_MS = 60_000;

function toLocalDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Звітна дата з урахуванням години початку звітного дня (як на сервері). */
function getReportingDateKey(value: string | Date, dayStartHour: number): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (date.getHours() >= dayStartHour) {
    date.setDate(date.getDate() + 1);
  }

  return formatLocalDateKey(date);
}

/** Якщо звітна дата випадає на сб/нд — переносимо на понеділок. */
function skipWeekendsToMonday(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  if (!date) return dateKey;

  const weekday = date.getDay(); // 0 = нд, 6 = сб
  if (weekday === 6) {
    date.setDate(date.getDate() + 2);
  } else if (weekday === 0) {
    date.setDate(date.getDate() + 1);
  }

  return formatLocalDateKey(date);
}

/** Прибирає підряд однакові статуси, якщо різниця в часі ≤ 1 хв. */
function dedupeNearbyStatusHistory(statusHistory: StatusHistoryEntry[]): StatusHistoryEntry[] {
  const result: StatusHistoryEntry[] = [];

  for (const entry of statusHistory) {
    const prev = result[result.length - 1];
    if (prev && prev.status === entry.status) {
      const prevTime = new Date(prev.changedAt).getTime();
      const entryTime = new Date(entry.changedAt).getTime();
      if (
        Number.isFinite(prevTime) &&
        Number.isFinite(entryTime) &&
        Math.abs(entryTime - prevTime) <= STATUS_DEDUPE_WINDOW_MS
      ) {
        continue;
      }
    }
    result.push(entry);
  }

  return result;
}

function findLastStatusEntry(
  statusHistory: StatusHistoryEntry[],
  status: string,
): StatusHistoryEntry | undefined {
  for (let index = statusHistory.length - 1; index >= 0; index -= 1) {
    if (statusHistory[index].status === status) {
      return statusHistory[index];
    }
  }
  return undefined;
}

function getReadyToShipDayMismatch(
  statusHistory: StatusHistoryEntry[] | undefined,
  dayStartHour: number,
): {
  mismatched: boolean;
  lastReadyToShipChangedAt: string | null;
} {
  if (!statusHistory?.length) {
    return { mismatched: false, lastReadyToShipChangedAt: null };
  }

  const visibleHistory = dedupeNearbyStatusHistory(statusHistory);
  const lastConfirmed = findLastStatusEntry(visibleHistory, STATUS_CONFIRMED);
  const lastReadyToShip = findLastStatusEntry(visibleHistory, STATUS_READY_TO_SHIP);

  if (!lastConfirmed || !lastReadyToShip) {
    return { mismatched: false, lastReadyToShipChangedAt: null };
  }

  const confirmedCalendarDateKey = toLocalDateKey(lastConfirmed.changedAt);
  const confirmedReportingDateKey = getReportingDateKey(lastConfirmed.changedAt, dayStartHour);
  const expectedDateKey = confirmedReportingDateKey
    ? skipWeekendsToMonday(confirmedReportingDateKey)
    : null;
  const actualDateKey = toLocalDateKey(lastReadyToShip.changedAt);

  if (
    expectedDateKey == null ||
    actualDateKey == null ||
    expectedDateKey === actualDateKey
  ) {
    return {
      mismatched: false,
      lastReadyToShipChangedAt: lastReadyToShip.changedAt,
    };
  }

  // Виняток: «На відправку» того ж календарного дня, що й підтвердження,
  // а «інший день» з’явився лише через зсув звітної години (без правила вихідних).
  // Приклад: підтверджено й на відправку 28.07 о 15:55 → формально очікується 29.07, але це норма.
  const isReportingHourSameDayException =
    confirmedCalendarDateKey != null &&
    confirmedReportingDateKey != null &&
    actualDateKey === confirmedCalendarDateKey &&
    confirmedReportingDateKey !== confirmedCalendarDateKey &&
    expectedDateKey === confirmedReportingDateKey;

  return {
    mismatched: !isReportingHourSameDayException,
    lastReadyToShipChangedAt: lastReadyToShip.changedAt,
  };
}

function OrderStatusHistoryTooltip({
  dayStartHour,
  statusHistory,
}: {
  dayStartHour: number;
  statusHistory?: StatusHistoryEntry[];
}) {
  if (!statusHistory || statusHistory.length === 0) {
    return <span className="text-xs text-neutral-400">Немає історії статусів</span>;
  }

  const visibleHistory = dedupeNearbyStatusHistory(statusHistory);
  const mismatch = getReadyToShipDayMismatch(visibleHistory, dayStartHour);

  return (
    <div className="flex flex-col gap-1.5 py-0.5 min-w-[220px]">
      {visibleHistory.map((entry, index) => {
        const iconName = STATUS_ICONS[entry.status] ?? "circle";
        const label = entry.statusText || getStatusLabel(entry.status);
        const isDifferentDay =
          mismatch.mismatched &&
          entry.status === STATUS_READY_TO_SHIP &&
          entry.changedAt === mismatch.lastReadyToShipChangedAt;

        return (
          <div
            key={`${entry.status}-${entry.changedAt}-${index}`}
            className="flex items-start gap-2 text-xs"
          >
            <DynamicIcon
              name={iconName as Parameters<typeof DynamicIcon>[0]["name"]}
              size={14}
              className={`mt-0.5 shrink-0 ${isDifferentDay ? "text-amber-500" : "text-neutral-500"}`}
            />
            <div className="flex min-w-0 flex-col leading-snug">
              <span className={isDifferentDay ? "font-medium text-amber-700" : "font-medium text-neutral-800"}>
                {isDifferentDay ? `${label} (інший день)` : label}
              </span>
              <span className="text-neutral-500">{formatDate(entry.changedAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SalesDateDetailsModal({
  isOpen,
  onOpenChange,
  details,
  dayStartHour,
  dateItems = [],
  onNavigate,
}: SalesDateDetailsModalProps) {
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
      scrollBehavior="outside"
      classNames={{
        base: "rounded-xl overflow-visible",
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
              className={`absolute -left-14 top-1/2 z-20 hidden h-30 w-10 -translate-y-1/2 rounded-full ${prevItem ? "bg-white" : "bg-white/25"} shadow-md sm:flex`}
            >
              <DynamicIcon name="chevron-left" size={28} />
            </Button>
            <Button
              isIconOnly
              variant="flat"
              aria-label="Наступна дата"
              isDisabled={!nextItem}
              onPress={() => nextItem && onNavigate(nextItem)}
              className={`absolute -right-14 top-1/2 z-20 hidden h-30 w-10 -translate-y-1/2 rounded-full ${nextItem ? "bg-white" : "bg-white/25"} shadow-md sm:flex`}
            >
              <DynamicIcon name="chevron-right" size={28} />
            </Button>
          </>
        )}
        <ModalHeader className="flex items-center gap-2 pr-10">
          {onNavigate && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Попередня дата"
              isDisabled={!prevItem}
              onPress={() => prevItem && onNavigate(prevItem)}
              className="sm:hidden"
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
              className="sm:hidden"
            >
              <DynamicIcon name="chevron-right" size={18} />
            </Button>
          )}
        </ModalHeader>
        <ModalBody>
          {details && (
            <div className="space-y-4 pb-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-100">
                  <div className="text-sm text-blue-700 font-medium">Замовлень</div>
                  <div className="text-3xl font-bold text-blue-700">{details.ordersCount}</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center border border-green-200/75">
                  <div className="text-sm text-green-700 font-medium">Порцій</div>
                  <div className="text-3xl font-bold text-green-700">{details.portionsCount}</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg text-center border border-yellow-200">
                  <div className="text-sm text-yellow-700 font-medium">Загальна сума</div>
                  <div className="text-3xl font-bold text-yellow-700">
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
                  <div className="text-3xl font-bold text-fuchsia-700">
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
                <div className="grid grid-cols-3 gap-4">
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

              <div className="flex gap-4">
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
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <Table
                      isHeaderSticky
                      aria-label="Замовлення за день"
                      classNames={{
                        wrapper: "min-h-0 max-h-120 overflow-auto p-3",
                        table: "min-w-full",
                        th: ["first:rounded-s-sm", "last:rounded-e-sm"],
                      }}
                    >
                      <TableHeader>
                        <TableColumn className="text-sm font-medium">№</TableColumn>
                        <TableColumn className="text-sm font-medium">Дата оформлення</TableColumn>
                        <TableColumn className="text-sm font-medium">Порцій</TableColumn>
                        <TableColumn className="text-sm font-medium">Джерело</TableColumn>
                        <TableColumn className="text-sm font-medium">Сума</TableColumn>
                        <TableColumn className="text-sm font-medium">Знижка</TableColumn>
                        <TableColumn className="text-sm font-medium">Статус</TableColumn>
                      </TableHeader>
                      <TableBody items={details.orders} emptyContent="Немає замовлень за цей день">
                        {(order) => {
                          const readyToShipMismatch = getReadyToShipDayMismatch(
                            order.statusHistory,
                            dayStartHour,
                          );

                          return (
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
                                <Tooltip
                                  showArrow
                                  placement="left"
                                  classNames={{
                                    content: "bg-white border border-neutral-200 text-neutral-700 px-3 py-2 shadow-md",
                                  }}
                                  content={
                                    <OrderStatusHistoryTooltip
                                      dayStartHour={dayStartHour}
                                      statusHistory={order.statusHistory}
                                    />
                                  }
                                >
                                  <span className="inline-flex items-center gap-1 cursor-help">
                                    <Chip
                                      size="sm"
                                      variant="flat"
                                      className="text-xs"
                                      classNames={{ base: getStatusColor(order.status) }}
                                    >
                                      {getStatusLabel(order.status)}
                                    </Chip>
                                    {readyToShipMismatch.mismatched && (
                                      <DynamicIcon
                                        name="alert-triangle"
                                        size={14}
                                        className="shrink-0 text-red-500"
                                        aria-label="День «На відправку» не збігається з очікуваним після підтвердження"
                                      />
                                    )}
                                  </span>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        }}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-100 absolute -top-8 left-1/2 -translate-x-1/2">Підказка: використовуйте кнопки <span className="bg-gray-100 text-black px-1 py-0.5 inline-block leading-none rounded">←</span> та <span className="bg-gray-100 text-black px-1 py-0.5 inline-block leading-none rounded">→</span> для навігації по днях</div>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
