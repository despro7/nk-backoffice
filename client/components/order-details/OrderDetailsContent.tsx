import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate } from '@/lib/formatUtils';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { useApi } from '@/hooks/useApi';
import { useDilovodSettings } from '@/hooks/useDilovodSettings';
import { parseDilovodErrorText, dedupeAndNormalize } from '@/lib/metaLogsParser';
import { useProductMovementsDrawer } from '@/features/product-movements/context/ProductMovementsDrawerContext';
import { StockBadge } from '@/components/StockBadge';
import MetaLogJsonView from '../MetaLogJsonView';

type ErrorQtyBySku = Record<string, { stock?: string; missing?: string }>;

type SetComponentMeta = {
  sku: string;
  name: string;
  quantity: number;
};

type ProductMeta = {
  name: string;
  isSet: boolean;
  setComponents: SetComponentMeta[];
};

type OrderedDisplayRow = {
  key: string;
  sku: string;
  displayName: string;
  quantity: number;
  isSet: boolean;
  isSetComponent: boolean;
  parentSetSku?: string;
};

export type OrderDetailsViewModel = {
  orderNumber: string;
  orderDate?: string | Date | null;
  readyToShipAt?: string | Date | null;
  customerName?: string | null;
  paymentMethod?: string | null;
  totalPrice?: number | null;
  quantity?: number | null;
  sajt?: string | null;
  items?: unknown[];
  payloadData?: unknown;
  rawData?: unknown;
  dilovodSaleExportDate?: string | Date | null;
};

function parseSetComponents(raw: unknown): SetComponentMeta[] {
  if (!Array.isArray(raw)) return [];
  const components: SetComponentMeta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const sku = String((entry as { id?: unknown; sku?: unknown }).id
      ?? (entry as { sku?: unknown }).sku
      ?? '').trim();
    if (!sku) continue;
    components.push({
      sku,
      name: String((entry as { name?: unknown }).name ?? '').trim(),
      quantity: Number((entry as { quantity?: unknown }).quantity) || 1,
    });
  }
  return components;
}

const infoBox = 'flex flex-col gap-1 min-h-[90px] justify-between border-1 rounded-md p-3';
const infoBoxLabel = 'text-gray-400 text-xs';
const infoBoxText = 'text-sm font-medium leading-tight';

interface OrderDetailsContentProps {
  order: OrderDetailsViewModel;
  getChannelName?: (channelId: string | null | undefined) => string;
  showRawJson?: boolean;
}

export default function OrderDetailsContent({
  order,
  getChannelName,
  showRawJson = false,
}: OrderDetailsContentProps) {
  const { apiCall } = useApi();
  const { open: openProductMovements } = useProductMovementsDrawer();
  const { settings: dilovodSettings } = useDilovodSettings({ loadDirectories: false });
  const smallStorageId = dilovodSettings?.smallStorageId
    ? String(dilovodSettings.smallStorageId)
    : undefined;

  const movementsDayPeriod = useMemo(() => {
    const toLocalYmd = (value: unknown): string | null => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) return null;
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const day =
      toLocalYmd(order.dilovodSaleExportDate)
      ?? toLocalYmd(order.readyToShipAt)
      ?? null;

    if (!day) return undefined;
    return { startDate: day, endDate: day };
  }, [order.dilovodSaleExportDate, order.readyToShipAt]);

  const [productLookup, setProductLookup] = useState<Record<string, ProductMeta>>({});
  const [errorQtyBySku, setErrorQtyBySku] = useState<ErrorQtyBySku>({});

  const normalizedSkuList = useMemo(() => {
    const orderedSkus = Array.isArray(order.items)
      ? order.items.map((item: unknown) => String((item as { sku?: unknown })?.sku ?? '').trim()).filter(Boolean)
      : [];
    const payload = order.payloadData as { shipment?: { bySku?: Record<string, unknown> } } | undefined;
    const shippedSkus = payload?.shipment?.bySku && typeof payload.shipment.bySku === 'object'
      ? Object.keys(payload.shipment.bySku).map((sku) => String(sku).trim()).filter(Boolean)
      : [];

    return Array.from(new Set([...orderedSkus, ...shippedSkus]));
  }, [order.items, order.payloadData]);

  useEffect(() => {
    if (normalizedSkuList.length === 0) {
      setProductLookup({});
      return;
    }

    let isCancelled = false;

    const toProductMeta = (product: Record<string, unknown>): ProductMeta => {
      const setComponents = parseSetComponents(product?.set);
      return {
        name: String(product?.name || ''),
        isSet: setComponents.length > 0,
        setComponents,
      };
    };

    const mergeProductsIntoLookup = (
      accumulator: Record<string, ProductMeta>,
      products: Record<string, unknown>[],
    ): Record<string, ProductMeta> => {
      for (const product of products) {
        const sku = String(product?.sku ?? '').trim();
        if (!sku) continue;
        accumulator[sku] = toProductMeta(product);
      }
      return accumulator;
    };

    const loadProductLookup = async () => {
      try {
        const params = new URLSearchParams({
          skus: normalizedSkuList.join(','),
          fields: 'name,set',
        });

        const response = await apiCall(`/api/products/batch?${params.toString()}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const products = Array.isArray(data?.products) ? data.products : [];
        const lookup = mergeProductsIntoLookup({}, products);

        const componentSkus = Array.from(new Set(
          Object.values(lookup)
            .flatMap((meta) => meta.setComponents.map((component) => component.sku))
            .filter((sku) => !lookup[sku]),
        ));

        if (componentSkus.length > 0) {
          const componentParams = new URLSearchParams({
            skus: componentSkus.join(','),
            fields: 'name,set',
          });
          const componentResponse = await apiCall(`/api/products/batch?${componentParams.toString()}`);
          if (componentResponse.ok) {
            const componentData = await componentResponse.json();
            const componentProducts = Array.isArray(componentData?.products) ? componentData.products : [];
            mergeProductsIntoLookup(lookup, componentProducts);
          }
        }

        if (!isCancelled) {
          setProductLookup(lookup);
        }
      } catch {
        if (!isCancelled) {
          setProductLookup({});
        }
      }
    };

    void loadProductLookup();

    return () => {
      isCancelled = true;
    };
  }, [apiCall, normalizedSkuList]);

  const getProductMeta = useCallback((sku: string): ProductMeta | null => {
    const normalizedSku = String(sku ?? '').trim();
    return normalizedSku ? (productLookup[normalizedSku] ?? null) : null;
  }, [productLookup]);

  const monolithicShippedSkuSet = useMemo(() => {
    const payload = order.payloadData as { shipment?: { bySku?: Record<string, unknown> } } | undefined;
    const bySku = payload?.shipment?.bySku;
    if (!bySku || typeof bySku !== 'object') {
      return new Set<string>();
    }
    return new Set(
      Object.keys(bySku).map((sku) => String(sku).trim()).filter(Boolean),
    );
  }, [order.payloadData]);

  const orderedDisplayRows = useMemo((): OrderedDisplayRow[] => {
    if (!Array.isArray(order.items)) {
      return [];
    }

    const rows: OrderedDisplayRow[] = [];

    order.items.forEach((item: unknown, idx: number) => {
      const row = item as Record<string, unknown>;
      const skuKey = String(row?.sku ?? '').trim();
      const productMeta = skuKey ? productLookup[skuKey] : undefined;
      const displayName = productMeta?.name || String(row?.productName ?? row?.name ?? 'Невідомий товар');
      const quantity = Number(row?.quantity) || 0;
      const canExpandSet = Boolean(
        productMeta?.isSet
        && productMeta.setComponents.length > 0
        && skuKey
        && !monolithicShippedSkuSet.has(skuKey),
      );

      if (!canExpandSet) {
        rows.push({
          key: `${skuKey || 'item'}-${idx}`,
          sku: skuKey,
          displayName,
          quantity,
          isSet: Boolean(productMeta?.isSet),
          isSetComponent: false,
        });
        return;
      }

      rows.push({
        key: `set-${skuKey}-${idx}`,
        sku: skuKey,
        displayName,
        quantity,
        isSet: true,
        isSetComponent: false,
      });

      for (const component of productMeta!.setComponents) {
        const componentMeta = productLookup[component.sku];
        const componentName = componentMeta?.name || component.name || 'Невідомий товар';
        rows.push({
          key: `set-${skuKey}-${idx}-comp-${component.sku}`,
          sku: component.sku,
          displayName: componentName,
          quantity: quantity * component.quantity,
          isSet: Boolean(componentMeta?.isSet),
          isSetComponent: true,
          parentSetSku: skuKey,
        });
      }
    });

    return rows;
  }, [monolithicShippedSkuSet, order.items, productLookup]);

  useEffect(() => {
    if (!order.orderNumber) {
      setErrorQtyBySku({});
      return;
    }

    let isCancelled = false;

    const loadErrorQtyFromLatestErrorLog = async () => {
      try {
        const res = await apiCall(`/api/meta-logs?orderNumber=${encodeURIComponent(String(order.orderNumber))}`);
        if (!res.ok) {
          if (!isCancelled) setErrorQtyBySku({});
          return;
        }

        const logs = await res.json();
        if (!Array.isArray(logs) || logs.length === 0) {
          if (!isCancelled) setErrorQtyBySku({});
          return;
        }

        const latestLog = logs[0];
        if (!latestLog || latestLog.status !== 'error') {
          if (!isCancelled) setErrorQtyBySku({});
          return;
        }

        const errorText = String(
          latestLog.data?.error
          ?? latestLog.data?.exportResult?.error
          ?? latestLog.message
          ?? '',
        );
        if (!errorText) {
          if (!isCancelled) setErrorQtyBySku({});
          return;
        }

        const parsed = dedupeAndNormalize(parseDilovodErrorText(errorText));
        const map: ErrorQtyBySku = {};
        for (let i = 0; i < parsed.skus.length; i++) {
          const sku = String(parsed.skus[i] ?? '').trim();
          if (!sku || sku === '—') continue;

          const stock = String(parsed.stock[i] ?? '').trim();
          const missing = String(parsed.missing[i] ?? '').trim();
          const entry: { stock?: string; missing?: string } = {};
          if (stock && stock !== '—') entry.stock = stock;
          if (missing && missing !== '—') entry.missing = missing;
          if (entry.stock || entry.missing) {
            map[sku] = entry;
          }
        }

        if (!isCancelled) {
          setErrorQtyBySku(map);
        }
      } catch {
        if (!isCancelled) {
          setErrorQtyBySku({});
        }
      }
    };

    void loadErrorQtyFromLatestErrorLog();

    return () => {
      isCancelled = true;
    };
  }, [apiCall, order.orderNumber]);

  const rawData = order.rawData && typeof order.rawData === 'object'
    ? order.rawData as Record<string, unknown>
    : null;
  const trackingNumber = rawData?.ord_delivery_data
    && Array.isArray(rawData.ord_delivery_data)
    && rawData.ord_delivery_data[0]
    && typeof rawData.ord_delivery_data[0] === 'object'
    ? String((rawData.ord_delivery_data[0] as { trackingNumber?: unknown }).trackingNumber ?? '').trim()
    : '';

  const payload = order.payloadData as { shipment?: { bySku?: Record<string, { quantity?: number; accGood?: string }> } } | undefined;
  const shipmentBySku = payload?.shipment?.bySku;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {order.orderDate ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Дата замовлення:</span>
            <span className={infoBoxText}>{formatDate(order.orderDate)}</span>
          </div>
        ) : null}
        {order.readyToShipAt ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Дата комплектації:</span>
            <span className={infoBoxText}>{formatDate(order.readyToShipAt)}</span>
          </div>
        ) : null}
        {order.customerName ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Клієнт:</span>
            <span className={infoBoxText}>{order.customerName}</span>
          </div>
        ) : null}
        {order.paymentMethod ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Сума і спосіб оплати:</span>
            <div className="flex gap-1">
              <span className={infoBoxText}>{order.totalPrice} грн.</span>
              <span className={`${infoBoxText} font-thin`}> – {order.paymentMethod}</span>
            </div>
          </div>
        ) : null}
        {trackingNumber ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Номер ТТН:</span>
            <div className="flex items-center gap-1">{formatTrackingNumberWithIcon(trackingNumber)}</div>
          </div>
        ) : null}
        {order.sajt ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Канал продажів:</span>
            <span className={infoBoxText}>{getChannelName ? getChannelName(order.sajt) : order.sajt}</span>
          </div>
        ) : null}
        {order.quantity != null ? (
          <div className={infoBox}>
            <span className={infoBoxLabel}>Всього товарів:</span>
            <span className={infoBoxText}>{order.quantity} порцій</span>
          </div>
        ) : null}
      </div>

      <div className="mb-8">
        <span className="text-sm font-semibold">Замовлені товари:</span>
        {orderedDisplayRows.length > 0 ? (
          <Table
            aria-label="Замовлені товари"
            removeWrapper
            className="mt-2 min-w-[420px]"
            classNames={{
              th: 'first:rounded-s-md last:rounded-e-md bg-default-100 text-xs text-default-500 h-8 px-2',
              td: 'py-1.5 px-2',
              tr: 'hover:bg-default-100/60',
            }}
          >
            <TableHeader>
              <TableColumn className="flex items-center gap-1">
                Товар
                <span className="ml-4 font-normal text-slate-400 flex items-center gap-1">
                  <DynamicIcon name="arrow-left-right" size={14} className="bg-slate-200 rounded p-0.5" />
                  – переглянути рухи товару
                </span>
              </TableColumn>
              <TableColumn align="end" width={72}>Кіл-ть</TableColumn>
              <TableColumn align="end" width={120}>
                <span className="inline-flex items-center justify-end gap-1">
                  Залишок <StockBadge variant="ms" size="9px" />
                </span>
              </TableColumn>
              <TableColumn align="end" width={100}>Бракує</TableColumn>
            </TableHeader>
            <TableBody>
              {orderedDisplayRows.map((row) => {
                const skuKey = row.sku;
                const errorQty = skuKey ? errorQtyBySku[skuKey] : undefined;
                const stock = errorQty?.stock;
                const shortage = errorQty?.missing;
                const hasStock = Boolean(stock);
                const hasShortage = Boolean(shortage);
                const isExpandedSetParent = row.isSet
                  && !row.isSetComponent
                  && !monolithicShippedSkuSet.has(skuKey);
                const showStockShortage = !isExpandedSetParent;

                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <div className={`flex items-center gap-1.5 max-w-md ${row.isSetComponent ? 'pl-5 border-l-2 border-default-200 ml-1' : ''}`}>
                        <span className={`text-tiny px-1 py-0.5 rounded tabular-nums ${row.isSetComponent ? 'bg-default-200/80' : 'bg-amber-200/60'}`}>
                          {row.sku}
                        </span>
                        <span className={`truncate ${row.isSet && !row.isSetComponent ? 'font-semibold' : ''}`}>
                          {row.displayName}
                        </span>
                        {row.isSet && !row.isSetComponent ? (
                          <Chip
                            size="sm"
                            variant="flat"
                            className={`h-5 ${monolithicShippedSkuSet.has(skuKey) ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-800'}`}
                          >
                            {monolithicShippedSkuSet.has(skuKey) ? 'набір' : 'розібраний'}
                          </Chip>
                        ) : null}
                        {skuKey ? (
                          <Button
                            size="sm"
                            variant="flat"
                            className="min-w-0 h-6 px-0.5 text-xs shrink-0"
                            startContent={<DynamicIcon name="arrow-left-right" size={14} />}
                            isIconOnly
                            onPress={() => openProductMovements({
                              sku: skuKey,
                              productName: row.displayName,
                              storageId: smallStorageId,
                              ...(movementsDayPeriod ? { period: movementsDayPeriod } : {}),
                              autoGenerate: true,
                              placement: 'left',
                              nonDismissable: true,
                            })}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {row.quantity ?? '—'}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums whitespace-nowrap ${showStockShortage && hasStock ? 'font-medium' : 'text-default-400'}`}>
                      {showStockShortage && hasStock ? stock : '—'}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums whitespace-nowrap ${showStockShortage && hasShortage ? 'text-danger font-medium' : 'text-default-400'}`}>
                      {showStockShortage && hasShortage ? shortage : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-gray-500 mt-2">Немає замовлених товарів</div>
        )}
      </div>

      {shipmentBySku && typeof shipmentBySku === 'object' ? (() => {
        const orderedItems = Array.isArray(order.items) ? order.items : [];
        const shippedItems = Object.entries(shipmentBySku)
          .map(([sku, shipmentItem]) => {
            const quantity = Number(shipmentItem?.quantity) || 0;
            if (quantity <= 0) {
              return null;
            }

            const sourceItem = orderedItems.find((item: unknown) => (item as { sku?: string })?.sku === sku);
            const source = sourceItem as { productName?: string; name?: string } | undefined;
            return {
              sku,
              productName: source?.productName || source?.name || 'Невідомий товар',
              quantity,
              accGood: shipmentItem?.accGood ? String(shipmentItem.accGood) : null,
            };
          })
          .filter(Boolean) as Array<{ sku: string; productName: string; quantity: number; accGood: string | null }>;

        if (shippedItems.length === 0) {
          return null;
        }

        return (
          <div className="p-3.5 pt-2 rounded-lg border overflow-auto mb-4">
            <span className={infoBoxLabel}>Відвантажені набори:</span>
            <div className="mt-2 space-y-1">
              {shippedItems.map((item) => {
                const productMeta = getProductMeta(item.sku);
                const displayName = productMeta?.name || item.productName;
                return (
                  <div key={`${item.sku}-${item.accGood || 'default'}`} className="text-sm flex flex-wrap items-center gap-2">
                    <span className="text-tiny bg-lime-200 px-1 py-0.5 rounded tabular-nums">{item.sku}</span>
                    <span>{displayName}</span>
                    <span className="text-gray-500">- {item.quantity} шт.</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })() : null}

      {showRawJson ? (
        <details className="group">
          <summary className="cursor-pointer font-semibold text-sm mb-3 list-none items-center gap-2 inline-flex">
            <DynamicIcon name="chevron-right" size={16} className="group-open:rotate-90 transition-transform" />
            Raw JSON
          </summary>
          <div className="bg-neutral-100 p-3 rounded-lg border-1 border-gray-200 overflow-auto">
            <MetaLogJsonView value={order} className="max-h-[50vh]" collapsed={3} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
