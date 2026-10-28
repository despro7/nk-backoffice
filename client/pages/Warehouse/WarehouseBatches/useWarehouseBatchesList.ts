import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
const WAREHOUSE_BATCHES_QUERY_KEY = ['warehouse-batches', 'full'] as const;

async function fetchFullWarehouseBatches(force = false): Promise<WarehouseBatchListItem[]> {
  const response = await fetchWarehouseBatches({
    onlyWithStock: false,
    negativeMode: 'all',
    batchKinds: ALL_BATCH_KINDS,
    force,
  });
  return response.data;
}

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
  const queryClient = useQueryClient();
  const [cacheRefreshing, setCacheRefreshing] = useState(false);

  const query = useQuery({
    queryKey: WAREHOUSE_BATCHES_QUERY_KEY,
    queryFn: () => fetchFullWarehouseBatches(false),
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

  const refreshFromServer = useCallback(async () => {
    setCacheRefreshing(true);
    try {
      const data = await fetchFullWarehouseBatches(true);
      queryClient.setQueryData(WAREHOUSE_BATCHES_QUERY_KEY, data);
    } finally {
      setCacheRefreshing(false);
    }
  }, [queryClient]);

  return {
    items,
    loading: query.isLoading || query.isFetching,
    cacheRefreshing,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
    refreshFromServer,
  };
}
