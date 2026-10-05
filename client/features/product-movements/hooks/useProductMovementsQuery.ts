import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type {
  ProductMovementsFilterState,
  ProductMovementsMetaResponse,
  ProductMovementsQueryResponse,
} from '../types';
import { saveProductMovementsRecentSearch } from '../productMovementsRecentSearches';
import { filtersToQueryRequest, readApiError } from '../productMovementsUtils';

interface GenerateProductMovementsInput {
  filters: ProductMovementsFilterState;
  meta?: ProductMovementsMetaResponse | null;
}

export default function useProductMovementsQuery() {
  const { apiCall } = useApi();
  const [result, setResult] = useState<ProductMovementsQueryResponse | null>(null);
  const [generatedFilters, setGeneratedFilters] = useState<ProductMovementsFilterState | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ filters }: GenerateProductMovementsInput): Promise<ProductMovementsQueryResponse> => {
      const response = await apiCall('/api/reports/product-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtersToQueryRequest(filters)),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Не вдалося сформувати рухи по товару'));
      }
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success === false) {
        throw new Error(
          (data as { error?: string; message?: string }).error
            || (data as { message?: string }).message
            || 'Не вдалося сформувати рухи по товару',
        );
      }
      return data as ProductMovementsQueryResponse;
    },
    onSuccess: (data, { filters, meta }) => {
      const enrichedFilters: ProductMovementsFilterState = {
        ...filters,
        sku: data.product.sku,
        productName: data.product.name,
        dilovodGoodId: data.product.dilovodGoodId,
      };
      setResult(data);
      setGeneratedFilters(enrichedFilters);
      setHasGenerated(true);
      try {
        saveProductMovementsRecentSearch(enrichedFilters, meta ?? null);
      } catch {
        // Не блокуємо звіт, якщо не вдалося зберегти останній запит.
      }
    },
  });
  const mutationRef = useRef(mutation);
  mutationRef.current = mutation;

  const generate = useCallback((
    filters: ProductMovementsFilterState,
    meta?: ProductMovementsMetaResponse | null,
  ) => {
    if (!filters.sku && !filters.dilovodGoodId) {
      mutationRef.current.reset();
      return;
    }
    mutationRef.current.mutate({ filters, meta });
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setGeneratedFilters(null);
    setHasGenerated(false);
    mutationRef.current.reset();
  }, []);

  return {
    result,
    generatedFilters,
    hasGenerated,
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    generate,
    reset,
  };
}
