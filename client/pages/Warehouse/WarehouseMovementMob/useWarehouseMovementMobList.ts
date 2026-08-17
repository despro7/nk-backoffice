import { useCallback, useMemo, useState } from 'react';
import type { CalendarDate } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { MovementMobApiRecord, MovementMobListCardViewModel } from './WarehouseMovementMobTypes';
import {
  MOVEMENT_MOB_DEFAULT_PRESET_KEY,
  calendarDateToIso,
  getDefaultMovementMobDateRange,
  toListCardViewModel,
} from './WarehouseMovementMobUtils';

interface MovementMobListResponse {
  movements: MovementMobApiRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export function useWarehouseMovementMobList() {
  const { apiCall } = useApi();
  const [dateRange, setDateRange] = useState<DateRange | null>(() => getDefaultMovementMobDateRange());
  const [datePresetKey, setDatePresetKey] = useState<string | null>(MOVEMENT_MOB_DEFAULT_PRESET_KEY);

  const fromIso = dateRange?.start ? calendarDateToIso(dateRange.start as CalendarDate) : null;
  const toIso = dateRange?.end ? calendarDateToIso(dateRange.end as CalendarDate) : null;

  const query = useQuery({
    queryKey: ['warehouse-movement-mob-list', fromIso, toIso],
    enabled: Boolean(fromIso && toIso),
    queryFn: async (): Promise<MovementMobListCardViewModel[]> => {
      const params = new URLSearchParams({
        page: '1',
        limit: '100',
      });
      if (fromIso) params.set('from', fromIso);
      if (toIso) params.set('to', toIso);

      const response = await apiCall(`/api/warehouse?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Не вдалося завантажити переміщення');
      }

      const data = (await response.json()) as MovementMobListResponse;
      return (data.movements ?? []).map(toListCardViewModel);
    },
  });

  const resetFilters = useCallback(() => {
    setDateRange(getDefaultMovementMobDateRange());
    setDatePresetKey(MOVEMENT_MOB_DEFAULT_PRESET_KEY);
  }, []);

  const cards = useMemo(() => query.data ?? [], [query.data]);

  return {
    cards,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    dateRange,
    setDateRange,
    datePresetKey,
    setDatePresetKey,
    resetFilters,
    refetch: query.refetch,
  };
}
