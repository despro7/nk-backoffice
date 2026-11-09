import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type {
  TechCardDetailDto,
  TechCardListItemDto,
  TechCardVersionDto,
} from '@shared/types/production';

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export const TECH_CARDS_QUERY_KEY = ['production', 'techcards'] as const;

export function techCardQueryKey(goodId: string) {
  return [...TECH_CARDS_QUERY_KEY, goodId] as const;
}

function useGet() {
  const { apiCall } = useApi();
  return async <T,>(url: string): Promise<T> => {
    const response = await apiCall(url);
    const data = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !data.success || data.data === undefined) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data.data;
  };
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Список техкарт: готова продукція зі статусом техкарти. */
export function useTechCards() {
  const get = useGet();
  const query = useQuery({
    queryKey: TECH_CARDS_QUERY_KEY,
    queryFn: () => get<TechCardListItemDto[]>('/api/production/techcards'),
  });
  return {
    items: query.data ?? [],
    loading: query.isLoading,
    error: errorText(query.error),
    refetch: query.refetch,
  };
}

/** Техкарта товару: товар зі специфікацією, чинна версія і чернетка. */
export function useTechCard(goodId: string | null) {
  const get = useGet();
  const query = useQuery({
    queryKey: techCardQueryKey(goodId ?? ''),
    enabled: Boolean(goodId),
    queryFn: () => get<TechCardDetailDto>(`/api/production/techcards/${encodeURIComponent(goodId ?? '')}`),
  });
  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: errorText(query.error),
    refetch: query.refetch,
  };
}

export function useTechCardVersions(goodId: string, enabled: boolean) {
  const get = useGet();
  const query = useQuery({
    queryKey: [...techCardQueryKey(goodId), 'versions'],
    enabled,
    queryFn: () =>
      get<TechCardVersionDto[]>(`/api/production/techcards/${encodeURIComponent(goodId)}/versions`),
  });
  return { versions: query.data ?? [], loading: query.isLoading, error: errorText(query.error) };
}
