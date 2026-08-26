import {
  Button,
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
} from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { formatDate, pluralize } from "@/lib";
import { OrderStatusChip, type OrderStatusHistoryEntry } from "@/components/OrderStatusChip";
import { formatTrackingNumberWithIcon } from "@/lib/formatUtilsJSX";
import useReportingDayStartHour from "@/pages/Reports/shared/useReportingDayStartHour";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ProductOrdersModalProduct {
  name: string;
  sku: string;
}

export interface ProductOrderRow {
  externalId: string;
  orderNumber: string;
  ttn?: string | null;
  orderDate?: string | null;
  dilovodSaleExportDate?: string | null;
  dilovodReturnDate?: string | null;
  status: string;
  statusText: string;
  statusHistory?: OrderStatusHistoryEntry[];
  productQuantity?: number | null;
  regularQuantity?: number | null;
  monolithicComponentQuantity?: number | null;
  monolithicSetQuantity?: number | null;
  totalPrice?: number | string | null;
}

export type ProductOrdersQuantityField =
  | "regularQuantity"
  | "monolithicComponentQuantity"
  | "productQuantity";

export interface ProductOrdersModalTab {
  key: string;
  label: string;
  icon?: IconName;
  /** Класи активного таба (підкреслення + текст) */
  activeClassName?: string;
  /** Класи бейджа порцій у заголовку */
  badgeClassName?: string;
  orders: ProductOrderRow[];
  quantityField?: ProductOrdersQuantityField;
  portionsSingular?: string;
  portionsFew?: string;
  portionsMany?: string;
}

export interface ProductOrdersModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isLoading: boolean;
  product: ProductOrdersModalProduct | null;
  tabs: ProductOrdersModalTab[];
  defaultTab?: string;
  /** Плоский список без табів (наприклад, лише монолітні набори) */
  hideTabs?: boolean;
  productItems?: ProductOrdersModalProduct[];
  onNavigate?: (product: ProductOrdersModalProduct) => void;
}

const DEFAULT_ACTIVE_TAB_CLASS = "border-blue-700/75 text-blue-700/75";
const DEFAULT_BADGE_CLASS = "bg-blue-200/40 text-blue-900/75";

function orderQuantity(order: ProductOrderRow, field?: ProductOrdersQuantityField): number {
  if (field === "regularQuantity") {
    return order.regularQuantity ?? order.productQuantity ?? 0;
  }
  if (field === "monolithicComponentQuantity") {
    return order.monolithicComponentQuantity ?? order.productQuantity ?? 0;
  }
  return order.productQuantity ?? order.regularQuantity ?? order.monolithicComponentQuantity ?? 0;
}

function sortOrders(
  orders: ProductOrderRow[],
  sortField: string | null,
  sortDirection: "asc" | "desc",
): ProductOrderRow[] {
  if (!sortField) return orders;

  const getComparable = (o: ProductOrderRow) => {
    const v = (o as unknown as Record<string, unknown>)[sortField];
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

  const copy = [...orders];
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
}

function ProductOrdersNavControl({
  currentIndex,
  total,
  prevProduct,
  nextProduct,
  onNavigate,
}: {
  currentIndex: number;
  total: number;
  prevProduct: ProductOrdersModalProduct | null;
  nextProduct: ProductOrdersModalProduct | null;
  onNavigate: (product: ProductOrdersModalProduct) => void;
}) {
  return (
    <div
      className="flex h-8 items-center gap-2.5 overflow-hidden rounded-sm border border-default-200 bg-white px-2.5"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(212,212,212,0.2) 100%)",
      }}
    >
      <button
        type="button"
        aria-label="Попередній товар"
        disabled={!prevProduct}
        className="flex size-[19px] items-center justify-center text-default-400 transition-colors hover:text-default-600 disabled:pointer-events-none disabled:opacity-30"
        onClick={() => {
          if (prevProduct) onNavigate(prevProduct);
        }}
      >
        <DynamicIcon name="chevron-up" size={19} />
      </button>
      <span className="h-[18px] w-px shrink-0 bg-default-200" aria-hidden />
      <button
        type="button"
        aria-label="Наступний товар"
        disabled={!nextProduct}
        className="flex size-[19px] items-center justify-center text-default-400 transition-colors hover:text-default-600 disabled:pointer-events-none disabled:opacity-30"
        onClick={() => {
          if (nextProduct) onNavigate(nextProduct);
        }}
      >
        <DynamicIcon name="chevron-down" size={19} />
      </button>
      <span className="h-[18px] w-px shrink-0 bg-default-200" aria-hidden />
      <span className="flex items-center gap-0.5 text-[11px] leading-none tracking-tight text-default-400 tabular-nums">
        <span className="font-medium">{currentIndex + 1}</span>
        <span className="font-normal">/</span>
        <span className="font-medium">{total}</span>
      </span>
    </div>
  );
}

export function ProductOrdersModal({
  isOpen,
  onOpenChange,
  isLoading,
  product,
  tabs,
  defaultTab,
  hideTabs = false,
  productItems = [],
  onNavigate,
}: ProductOrdersModalProps) {
  const { dayStartHour } = useReportingDayStartHour({ enabled: isOpen });
  const initialTab = defaultTab ?? tabs[0]?.key ?? "";
  const [selectedTab, setSelectedTab] = useState(initialTab);

  useEffect(() => {
    setSelectedTab(defaultTab ?? tabs[0]?.key ?? "");
    // tabs навмисно не в deps: батько часто передає новий масив на кожен рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab, product?.sku]);

  const [contentVisible, setContentVisible] = useState(true);
  const switchTab = useCallback(
    (next: string) => {
      if (next === selectedTab) return;
      setContentVisible(false);
      window.setTimeout(() => {
        setSelectedTab(next);
        setContentVisible(true);
      }, 150);
    },
    [selectedTab],
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.key === selectedTab) ?? tabs[0],
    [tabs, selectedTab],
  );

  const activeOrders = useMemo(() => activeTab?.orders ?? [], [activeTab]);
  const quantityField = activeTab?.quantityField;
  const activePortions = activeOrders.reduce(
    (sum, order) => sum + orderQuantity(order, quantityField),
    0,
  );

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const currentProductIndex = useMemo(() => {
    if (!product || productItems.length === 0) return -1;
    return productItems.findIndex((item) => item.sku === product.sku);
  }, [product, productItems]);

  const prevProduct =
    currentProductIndex > 0 ? productItems[currentProductIndex - 1] : null;
  const nextProduct =
    currentProductIndex >= 0 && currentProductIndex < productItems.length - 1
      ? productItems[currentProductIndex + 1]
      : null;

  useEffect(() => {
    if (!isOpen || !onNavigate) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "ArrowUp" && prevProduct) {
        event.preventDefault();
        onNavigate(prevProduct);
      } else if (event.key === "ArrowDown" && nextProduct) {
        event.preventDefault();
        onNavigate(nextProduct);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, nextProduct, onNavigate, prevProduct]);

  const sortedActiveOrders = useMemo(
    () => sortOrders(activeOrders, sortField, sortDirection),
    [activeOrders, sortField, sortDirection],
  );

  const handleSortToggle = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const portionsSingular = activeTab?.portionsSingular ?? "порція";
  const portionsFew = activeTab?.portionsFew ?? "порції";
  const portionsMany = activeTab?.portionsMany ?? "порцій";
  const quantityHeader =
    portionsSingular === "набір" || portionsFew === "набори" ? "Наборів" : "Порцій";

  const renderOrdersTable = (orderList: ProductOrderRow[]) => {
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
              <div className="flex items-center gap-2 justify-center cursor-pointer select-none" onClick={() => handleSortToggle("productQuantity")}>{quantityHeader}{sortField === "productQuantity" && <DynamicIcon name={sortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} />}</div>
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
                  <OrderStatusChip
                    status={order.status}
                    statusHistory={order.statusHistory ?? []}
                    dayStartHour={dayStartHour}
                  />
                </TableCell>
                <TableCell className="text-center text-sm font-semibold">
                  {orderQuantity(order, quantityField)}
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
      classNames={{
        base: "rounded-xl",
        body: "pb-6",
      }}
    >
      <ModalContent>
        {(_onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2>
                {activeOrders.length} {pluralize(activeOrders.length, "замовлення", "замовлення", "замовлень")} для «{product?.name}»
                <span
                  className={`rounded-sm text-sm px-2 py-1 ml-2 ${
                    activeTab?.badgeClassName ?? DEFAULT_BADGE_CLASS
                  }`}
                >
                  {activePortions} {pluralize(activePortions, portionsSingular, portionsFew, portionsMany)}
                </span>
              </h2>
              <div className="flex items-center gap-2.5 text-sm font-normal text-neutral-500">
                {onNavigate && currentProductIndex >= 0 && productItems.length > 0 && (
                  <ProductOrdersNavControl
                    currentIndex={currentProductIndex}
                    total={productItems.length}
                    prevProduct={prevProduct}
                    nextProduct={nextProduct}
                    onNavigate={onNavigate}
                  />
                )}
                <span>SKU: {product?.sku}</span>
              </div>
            </ModalHeader>
            <ModalBody>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-3 text-gray-600">Завантаження замовлень...</span>
                </div>
              ) : hideTabs || tabs.length <= 1 ? (
                renderOrdersTable(sortedActiveOrders)
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-1 border-b border-default-200">
                    {tabs.map((tab) => {
                      const isActive = selectedTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => switchTab(tab.key)}
                          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            isActive
                              ? tab.activeClassName ?? DEFAULT_ACTIVE_TAB_CLASS
                              : "border-transparent text-default-500 hover:text-default-700"
                          }`}
                        >
                          {tab.icon ? <DynamicIcon name={tab.icon} size={16} /> : null}
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="transition-opacity duration-150 ease-in-out"
                    style={{ opacity: contentVisible ? 1 : 0 }}
                  >
                    {renderOrdersTable(sortedActiveOrders)}
                  </div>
                </div>
              )}
            </ModalBody>
            {false && <ModalFooter />}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
