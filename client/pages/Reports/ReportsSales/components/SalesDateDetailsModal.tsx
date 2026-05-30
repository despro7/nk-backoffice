import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { getStatusColor, getStatusLabel } from "@/lib";
import type { SalesData } from "../ReportsSalesTypes";

interface SalesDateDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  details: SalesData | null;
}

export function SalesDateDetailsModal({
  isOpen,
  onOpenChange,
  details,
}: SalesDateDetailsModalProps) {
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
              Деталі за{" "}
              {details
                ? new Date(details.date).toLocaleDateString("uk-UA", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : ""}
            </ModalHeader>
            <ModalBody>
              {details && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg text-center">
                      <div className="text-sm text-blue-700 font-medium">Замовлень</div>
                      <div className="text-3xl font-bold text-blue-700">{details.ordersCount}</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg text-center">
                      <div className="text-sm text-green-700 font-medium">Порцій</div>
                      <div className="text-3xl font-bold text-green-700">{details.portionsCount}</div>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg text-center">
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
                    <div className="p-4 bg-fuchsia-50 rounded-lg text-center">
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
                      <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3">
                        <h4 className="text-sm font-semibold mb-2 text-neutral-700">По джерелах</h4>
                        <div className="space-y-1">
                          {Object.entries(details.ordersBySource)
                            .sort((a, b) => b[1] - a[1])
                            .map(([source, orders]) => {
                              const portions = details.portionsBySource[source] || 0;
                              return (
                                <div key={source} className="flex justify-between items-center">
                                  <span className="text-neutral-600 text-sm">{source}</span>
                                  <span className="font-medium">{orders} / {portions}</span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3">
                      <h4 className="text-sm font-semibold mb-2 text-neutral-700">Зі знижкою</h4>
                      <div className="flex justify-between items-center font-medium text-neutral-800">
                        {details.discountReasonText && (
                          <span className="text-sm text-neutral-500">{details.discountReasonText}</span>
                        )}
                        {details.ordersWithDiscountReason} / {details.portionsWithDiscountReason}
                      </div>
                    </div>

                    <div className="flex-1 border-1 border-neutral-200 rounded-lg p-3">
                      <h4 className="text-sm font-semibold mb-2 text-neutral-700">По статусах</h4>
                      <div className="flex flex-col gap-2">
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
                              <div key={status} className="flex justify-between items-center">
                                <span className="text-neutral-600 text-sm">{getStatusLabel(status)}</span>
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
                            wrapper: "min-h-0 max-h-96 overflow-auto p-3",
                            table: "min-w-full",
                            th: ["first:rounded-s-sm", "last:rounded-e-sm"],
                          }}
                        >
                          <TableHeader>
                            <TableColumn className="text-sm font-medium">№</TableColumn>
                            <TableColumn className="text-sm font-medium">Дата</TableColumn>
                            <TableColumn className="text-sm font-medium">Порцій</TableColumn>
                            <TableColumn className="text-sm font-medium">Джерело</TableColumn>
                            <TableColumn className="text-sm font-medium">Сума</TableColumn>
                            <TableColumn className="text-sm font-medium">Знижка</TableColumn>
                            <TableColumn className="text-sm font-medium">Статус</TableColumn>
                          </TableHeader>
                          <TableBody items={details.orders} emptyContent="Немає замовлень за цей день">
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
                                  <Chip
                                    size="sm"
                                    variant="flat"
                                    className="text-xs"
                                    classNames={{ base: getStatusColor(order.status) }}
                                  >
                                    {getStatusLabel(order.status)}
                                  </Chip>
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