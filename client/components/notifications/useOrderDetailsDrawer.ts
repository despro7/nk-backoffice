import { useCallback, useRef, useState } from 'react';
import type { SalesDriveOrderForExport } from '@shared/types/salesdrive';
import { useApi } from '@/hooks/useApi';

interface SalesChannel {
  id: string;
  name: string;
}

export interface OrderDetailsDrawerState {
  isOpen: boolean;
  title: string;
  result: unknown;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Деталі замовлення в дровері (як на сторінці «Стан замовлень») для кнопки сповіщення.
 * Замовлення шукається за номером через той самий API списку.
 */
export function useOrderDetailsDrawer() {
  const { apiCall } = useApi();
  const [state, setState] = useState<OrderDetailsDrawerState>({ isOpen: false, title: '', result: null });
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const channelsLoaded = useRef(false);

  const loadChannels = useCallback(async () => {
    if (channelsLoaded.current) return;
    channelsLoaded.current = true;
    try {
      const res = await apiCall('/api/salesdrive/channels');
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) setChannels(json.data);
    } catch {
      channelsLoaded.current = false;
    }
  }, [apiCall]);

  /** true – дровер відкрито; false – замовлення не знайдено або немає доступу. */
  const open = useCallback(
    async (orderNumber: string): Promise<boolean> => {
      void loadChannels();
      try {
        const qs = new URLSearchParams({ search: orderNumber, searchCategory: 'orderNumber', limit: '5' });
        const res = await apiCall(`/api/dilovod/salesdrive/orders?${qs}`);
        if (!res.ok) return false;
        const json = await res.json();
        const list: SalesDriveOrderForExport[] = Array.isArray(json?.data) ? json.data : [];
        const order = list.find((o) => String(o.orderNumber) === orderNumber);
        if (!order) return false;
        setState({
          isOpen: true,
          title: `Деталі замовлення ${order.orderNumber}`,
          result: {
            ...order,
            items: parseJson(order.items),
            rawData: parseJson(order.rawData),
            payloadData: parseJson(order.payloadData),
          },
        });
        return true;
      } catch {
        return false;
      }
    },
    [apiCall, loadChannels],
  );

  const close = useCallback(() => setState((s) => ({ ...s, isOpen: false })), []);

  const getChannelName = useCallback(
    (channelId: string | null | undefined): string => {
      if (!channelId) return '⚠️ Невідомо';
      return channels.find((ch) => ch.id === channelId)?.name ?? `Канал ${channelId}`;
    },
    [channels],
  );

  return { state, open, close, getChannelName };
}
