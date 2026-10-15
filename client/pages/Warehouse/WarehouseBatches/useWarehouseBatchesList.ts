import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  WAREHOUSE_BATCH_KIND_OPTIONS,
} from '@shared/types/warehouse';
import { fetchWarehouseBatches } from './batchesApi';
import type {
  WarehouseBatchKind,
  WarehouseBatchListItem,
  WarehouseBatchNegativeMode,
} from './WarehouseBatchesTypes';

interface UseWarehouseBatchesListParams {
  onlyWithStock: boolean;
  negativeMode: WarehouseBatchNegativeMode;
  batchKinds: WarehouseBatchKind[];
}

const ALL_BATCH_KINDS = WAREHOUSE_BATCH_KIND_OPTIONS.map((option) => option.key);

function matchesNegativeMode(
  total: number,
  negativeMode: WarehouseBatchNegativeMode,
  onlyWithStock: boolean,
): boolean {
  switch (negativeMode) {
    case 'only':
      return total < 0;
    case 'without':
      return onlyWithStock ? total > 0 : total >= 0;
    case 'all':
      return onlyWithStock ? total !== 0 : true;
    default: {
      const _exhaustive: never = negativeMode;
      void _exhaustive;
      return true;
    }
  }
}

/**
 * Один широкий запит до API (усі типи + мінуси), фільтри — на клієнті.
 * Інакше кожна зміна Switch/Select б’є Dilovod повторно через зміну queryKey.
 */
export function useWarehouseBatchesList(params: UseWarehouseBatchesListParams) {
  const query = useQuery({
    queryKey: ['warehouse-batches', 'full'],
    queryFn: async (): Promise<WarehouseBatchListItem[]> => {
      const response = await fetchWarehouseBatches({
        onlyWithStock: false,
        negativeMode: 'all',
        batchKinds: ALL_BATCH_KINDS,
      });
      return response.data;
    },
    staleTime: 60_000,
  });

  const kindSet = useMemo(() => new Set(params.batchKinds), [params.batchKinds]);

  const items = useMemo(() => {
    const source = query.data ?? [];
    return source.filter((item) => (
      kindSet.has(item.batchKind)
      && matchesNegativeMode(item.totalQuantity, params.negativeMode, params.onlyWithStock)
    ));
  }, [kindSet, params.negativeMode, params.onlyWithStock, query.data]);

  return {
    items,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
