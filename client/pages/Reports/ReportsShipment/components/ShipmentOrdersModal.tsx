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
                          <TableColumn className="text-sm font-medium">№</TableColumn>
                          <TableColumn className="text-sm font-medium">ТТН</TableColumn>
                          <TableColumn className="text-sm font-medium">Оформлено</TableColumn>
                          <TableColumn className="text-sm font-medium">Відвантажено</TableColumn>
                          <TableColumn className="text-sm font-medium">Статус</TableColumn>
                          <TableColumn className="text-sm font-medium text-center">Порцій</TableColumn>
                          <TableColumn className="text-sm font-medium text-right">Сума</TableColumn>
                          <TableColumn className="text-sm font-medium text-center">Дії</TableColumn>
                        </TableHeader>
                        <TableBody items={orders}>
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