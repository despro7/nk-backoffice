import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import type { NavBadge } from '@/routes.config';

export const SALESDRIVE_ORDERS_PATH = '/salesdrive-to-dilovod';
export const NOT_SHIPPED_ORDERS_HREF = '/salesdrive-to-dilovod#shipmentFilter=not_shipped';
export const NOT_SHIPPED_ORDERS_QUERY_KEY = ['salesdrive', 'shipment-counts', 'not_shipped'] as const;

interface ShipmentCountsResponse {
  success?: boolean;
  counts?: {
    not_shipped?: number;
  };
}

export function useNotShippedOrdersCount(enabled: boolean): number {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();

  const query = useQuery({
    queryKey: NOT_SHIPPED_ORDERS_QUERY_KEY,
    enabled: enabled && !isAuthLoading,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const response = await apiCall('/api/dilovod/salesdrive/orders/shipment-counts');
      if (!response.ok) return 0;
      const data = (await response.json()) as ShipmentCountsResponse;
      if (!data?.success) return 0;
      return Number(data.counts?.not_shipped) || 0;
    },
  });

  return query.data ?? 0;
}

export function buildNotShippedNavBadge(count: number): NavBadge | null {
  if (count <= 0) return null;
  return {
    label: String(count),
    color: 'danger',
    tooltip: 'Невідвантажені замовлення',
  };
}

export function resolveSalesdriveNavTo(count: number): string {
  return count > 0 ? NOT_SHIPPED_ORDERS_HREF : SALESDRIVE_ORDERS_PATH;
}

export function resolveRouteNavBadge(
  path: string,
  staticBadge: NavBadge | undefined,
  notShippedCount: number,
): NavBadge | null {
  if (path === SALESDRIVE_ORDERS_PATH) {
    return buildNotShippedNavBadge(notShippedCount);
  }
  return staticBadge ?? null;
}
