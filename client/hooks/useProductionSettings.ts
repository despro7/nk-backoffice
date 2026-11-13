import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import {
  DEFAULT_CATALOG_LOSS_FORMULA,
  type ProductionSettingsDto,
  type ProductionSettingsInput,
} from '@shared/types/production';

export const PRODUCTION_SETTINGS_QUERY_KEY = ['production', 'settings'] as const;

const FALLBACK: ProductionSettingsDto = {
  lossTypes: [],
  lossFormula: DEFAULT_CATALOG_LOSS_FORMULA,
  specDraftAutoEdit: false,
};

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

/** Типи втрат і формула брутто (settings_base, розділ «Виробництво»). Кешується між дроверами. */
export function useProductionSettings() {
  const { apiCall } = useApi();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PRODUCTION_SETTINGS_QUERY_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductionSettingsDto> => {
      const response = await apiCall('/api/production/settings');
      const data = (await response.json()) as ApiResponse<ProductionSettingsDto>;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data.data;
    },
  });

  const save = useCallback(
    async (input: ProductionSettingsInput): Promise<ProductionSettingsDto> => {
      const response = await apiCall('/api/production/settings', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as ApiResponse<ProductionSettingsDto>;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      queryClient.setQueryData(PRODUCTION_SETTINGS_QUERY_KEY, data.data);
      return data.data;
    },
    [apiCall, queryClient],
  );

  return {
    settings: query.data ?? FALLBACK,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
    save,
  };
}
