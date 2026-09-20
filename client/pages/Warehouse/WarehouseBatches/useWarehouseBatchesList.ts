import { useQuery } from '@tanstack/react-query';
import { fetchWarehouseBatches } from './batchesApi';
import type { WarehouseBatchListItem } from './WarehouseBatchesTypes';

export function useWarehouseBatchesList(onlyWithStock: boolean) {
  const query = useQuery({
    queryKey: ['warehouse-batches', onlyWithStock],
    queryFn: async (): Promise<WarehouseBatchListItem[]> => {
      const response = await fetchWarehouseBatches(onlyWithStock);
      return response.data;
    },
  });

  return {
    items: query.data ?? [],
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
