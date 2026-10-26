import { useCallback, useEffect, useState } from 'react';
import type { WarehouseDocumentEditContextResponse } from '@shared/types/warehouseDocumentEdit';
import OrderDetailsContent, { type OrderDetailsViewModel } from '@/components/order-details/OrderDetailsContent';
import DilovodDocumentViewSections from './DilovodDocumentViewSections';
import { useApi } from '@/hooks/useApi';

type SalesChannel = { id: string; name: string };

function toOrderDetailsViewModel(
  order: NonNullable<WarehouseDocumentEditContextResponse['shipmentOrder']>,
): OrderDetailsViewModel {
  return {
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    readyToShipAt: order.readyToShipAt,
    customerName: order.customerName,
    paymentMethod: order.paymentMethod,
    totalPrice: order.totalPrice,
    quantity: order.quantity,
    sajt: order.sajt,
    items: Array.isArray(order.items) ? order.items : [],
    payloadData: order.payloadData,
    rawData: order.rawData,
    dilovodSaleExportDate: order.dilovodSaleExportDate,
  };
}

interface ShipmentDocumentViewPanelProps {
  context: WarehouseDocumentEditContextResponse;
}

export default function ShipmentDocumentViewPanel({ context }: ShipmentDocumentViewPanelProps) {
  const { apiCall } = useApi();
  const [salesChannels, setSalesChannels] = useState<SalesChannel[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiCall('/api/salesdrive/channels')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.data)) {
          setSalesChannels(data.data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [apiCall]);

  const getChannelName = useCallback((channelId: string | null | undefined): string => {
    if (!channelId) return '⚠️ Невідомо';
    const found = salesChannels.find((ch) => ch.id === channelId);
    if (found) return found.name;
    return String(channelId);
  }, [salesChannels]);

  const order = context.shipmentOrder;

  if (order) {
    return (
      <OrderDetailsContent
        order={toOrderDetailsViewModel(order)}
        getChannelName={getChannelName}
        showRawJson
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Замовлення в backoffice не знайдено. Нижче — таблична частина документа відвантаження з Діловода.
      </p>
      <DilovodDocumentViewSections
        dilovod={context.dilovod}
        title="Відвантаження"
        hideHeader
        tableOnly
      />
    </div>
  );
}
