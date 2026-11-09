import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import type {
  ProductionBatchCreateInput,
  ProductionBatchDetailDto,
  ProductionBatchListItemDto,
  ProductionBatchStatus,
  ProductionBatchUpdatePlanInput,
} from '@shared/types/production';
import { TECH_CARDS_QUERY_KEY } from './useTechCards';

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export const BATCHES_QUERY_KEY = ['production', 'batches'] as const;

export function batchQueryKey(id: number) {
  return [...BATCHES_QUERY_KEY, 'detail', id] as const;
}

export interface BatchListFilters {
  status?: ProductionBatchStatus | null;
  goodId?: string | null;
  from?: string | null;
  to?: string | null;
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function useRequest() {
  const { apiCall } = useApi();
  return useCallback(
    async <T,>(url: string, init?: { method: string; body?: unknown }): Promise<T> => {
      const response = await apiCall(url, {
        ...(init ? { method: init.method } : {}),
        ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      const data = (await response.json()) as ApiResponse<T>;
      if (!response.ok || !data.success || data.data === undefined) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data.data;
    },
    [apiCall],
  );
}

/** Список варок з фільтрами (стан, товар, плановий день). */
export function useProductionBatches(filters: BatchListFilters = {}, enabled = true) {
  const request = useRequest();
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.goodId) params.set('goodId', filters.goodId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  const query = useQuery({
    queryKey: [...BATCHES_QUERY_KEY, 'list', qs],
    enabled,
    queryFn: () => request<ProductionBatchListItemDto[]>(`/api/production/batches${qs ? `?${qs}` : ''}`),
  });
  return { items: query.data ?? [], loading: query.isLoading, error: errorText(query.error), refetch: query.refetch };
}

export function useProductionBatch(id: number | null) {
  const request = useRequest();
  const query = useQuery({
    queryKey: batchQueryKey(id ?? 0),
    enabled: id != null && id > 0,
    queryFn: () => request<ProductionBatchDetailDto>(`/api/production/batches/${id}`),
  });
  return { data: query.data ?? null, loading: query.isLoading, error: errorText(query.error) };
}

/** Створення, зміна плану, скасування; оновлює кеш варки, списки варок і техкарт. */
export function useProductionBatchActions() {
  const request = useRequest();
  const queryClient = useQueryClient();

  const apply = useCallback(
    (detail: ProductionBatchDetailDto) => {
      queryClient.setQueryData(batchQueryKey(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: [...BATCHES_QUERY_KEY, 'list'] });
      void queryClient.invalidateQueries({ queryKey: TECH_CARDS_QUERY_KEY, exact: true });
      return detail;
    },
    [queryClient],
  );

  return {
    create: async (input: ProductionBatchCreateInput) =>
      apply(await request<ProductionBatchDetailDto>('/api/production/batches', { method: 'POST', body: input })),
    updatePlan: async (id: number, input: ProductionBatchUpdatePlanInput) =>
      apply(await request<ProductionBatchDetailDto>(`/api/production/batches/${id}`, { method: 'PATCH', body: input })),
    cancel: async (id: number, reason: string) =>
      apply(
        await request<ProductionBatchDetailDto>(`/api/production/batches/${id}/cancel`, {
          method: 'POST',
          body: { reason },
        }),
      ),
  };
}
