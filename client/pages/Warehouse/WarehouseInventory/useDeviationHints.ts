import { useQuery } from '@tanstack/react-query';
import type { DeviationHintsResponse } from '@shared/types/inventoryDeviationHints';

export const deviationHintsQueryKey = (sessionId: string | number) =>
  ['inventory-deviation-hints', String(sessionId)] as const;

async function fetchDeviationHints(sessionId: string | number): Promise<DeviationHintsResponse> {
  const res = await fetch(`/api/warehouse/inventory/${sessionId}/deviation-hints`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { success: boolean; data?: DeviationHintsResponse; error?: string };
  if (!json.success || !json.data) throw new Error(json.error ?? 'Не вдалося отримати ймовірні причини');
  return json.data;
}

/** Ймовірні причини відхилень інвентаризації; запит лише коли панель відкрита і є відхилення. */
export function useDeviationHints(sessionId: string | number, enabled: boolean) {
  return useQuery({
    queryKey: deviationHintsQueryKey(sessionId),
    queryFn: () => fetchDeviationHints(sessionId),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
