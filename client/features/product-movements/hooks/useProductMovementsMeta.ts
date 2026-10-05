import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/auth-context';
import type { ProductMovementsMetaResponse } from '../types';
import { readApiError } from '../productMovementsUtils';

export default function useProductMovementsMeta(enabled = true) {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();

  const query = useQuery({
    queryKey: ['product-movements-meta'],
    enabled: enabled && !isAuthLoading,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductMovementsMetaResponse> => {
      const response = await apiCall('/api/reports/product-movements/meta');
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Не вдалося завантажити метадані рухів'));
      }
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success === false) {
        throw new Error(
          (data as { error?: string; message?: string }).error
            || (data as { message?: string }).message
            || 'Не вдалося завантажити метадані рухів',
        );
      }
      return data as ProductMovementsMetaResponse;
    },
  });

  return {
    meta: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
