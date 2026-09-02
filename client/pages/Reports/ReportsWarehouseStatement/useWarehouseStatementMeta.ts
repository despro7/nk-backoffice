import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import type { WarehouseStatementMetaResponse } from '@shared/types/warehouseStatement';
import { isMetaResponse, readApiError, unwrapPayload } from './warehouseStatementUtils';

export default function useWarehouseStatementMeta() {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();

  const query = useQuery({
    queryKey: ['warehouse-statement-meta'],
    enabled: !isAuthLoading,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<WarehouseStatementMetaResponse> => {
      const response = await apiCall('/api/reports/warehouse-statement/meta');
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Не вдалося завантажити схему відомості'));
      }
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success === false) {
        throw new Error(
          (data as { error?: string; message?: string }).error
            || (data as { message?: string }).message
            || 'Не вдалося завантажити схему відомості',
        );
      }
      return unwrapPayload(data, isMetaResponse);
    },
  });

  return {
    meta: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
