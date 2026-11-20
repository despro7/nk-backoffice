import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addToast } from '@heroui/react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/auth-context';
import type {
  WarehouseStatementPresetCreateRequest,
  WarehouseStatementPresetUpdateRequest,
  WarehouseStatementPresetView,
} from '@shared/types/warehouseStatement';
import { readApiError } from './warehouseStatementUtils';

const PRESETS_URL = '/api/reports/warehouse-statement/presets';
const PRESETS_QUERY_KEY = ['warehouse-statement-presets'] as const;

function isPresetList(value: unknown): value is WarehouseStatementPresetView[] {
  return Array.isArray(value);
}

/** Збережені пресети конструктора відомості (CRUD через API). */
export default function useWarehouseStatementPresets() {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PRESETS_QUERY_KEY,
    enabled: !isAuthLoading,
    staleTime: 60_000,
    queryFn: async (): Promise<WarehouseStatementPresetView[]> => {
      const response = await apiCall(PRESETS_URL);
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Не вдалося завантажити пресети'));
      }
      const data: unknown = await response.json();
      return isPresetList(data) ? data : [];
    },
  });

  const request = useCallback(
    async <T,>(url: string, init: Parameters<typeof apiCall>[1], fallback: string): Promise<T> => {
      const response = await apiCall(url, init);
      if (!response.ok) {
        throw new Error(await readApiError(response, fallback));
      }
      return (await response.json()) as T;
    },
    [apiCall],
  );

  const onError = (error: unknown) => {
    addToast({
      title: 'Пресет',
      description: error instanceof Error ? error.message : 'Помилка збереження',
      color: 'danger',
    });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: PRESETS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (body: WarehouseStatementPresetCreateRequest) =>
      request<WarehouseStatementPresetView>(
        PRESETS_URL,
        { method: 'POST', body: JSON.stringify(body) },
        'Не вдалося зберегти пресет',
      ),
    onSuccess: invalidate,
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: WarehouseStatementPresetUpdateRequest }) =>
      request<WarehouseStatementPresetView>(
        `${PRESETS_URL}/${id}`,
        { method: 'PATCH', body: JSON.stringify(body) },
        'Не вдалося оновити пресет',
      ),
    onSuccess: invalidate,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      request<{ success: boolean }>(`${PRESETS_URL}/${id}`, { method: 'DELETE' }, 'Не вдалося видалити пресет'),
    onSuccess: invalidate,
    onError,
  });

  return {
    presets: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    createPreset: createMutation.mutateAsync,
    updatePreset: (id: number, body: WarehouseStatementPresetUpdateRequest) =>
      updateMutation.mutateAsync({ id, body }),
    deletePreset: deleteMutation.mutateAsync,
    saving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
