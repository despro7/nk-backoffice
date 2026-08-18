import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { saveAs } from 'file-saver';
import type { DateRange } from '@react-types/datepicker';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import {
  LAL_DEFAULT_EXPORT_COLUMNS,
  LAL_DEFAULT_LOGIC,
  LAL_DEFAULT_PAGE_SIZE,
  LAL_DEFAULT_PERIOD,
  LAL_DEFAULT_SORT_COLUMN,
  LAL_DEFAULT_SORT_DIRECTION,
  LAL_DEFAULT_STATUSES,
  LAL_EXPORT_COLUMN_OPTIONS,
  LAL_LTV_UNBOUNDED,
  LAL_ORDER_COUNT_UNBOUNDED,
  LAL_SORT_COLUMNS,
  type LalAudienceExportBody,
  type LalAudienceFilters,
  type LalAudienceListResponse,
  type LalExportColumn,
  type LalExportFormat,
  type LalLogicMode,
  type LalPeriodKey,
  type LalPresetId,
  type LalSortColumn,
  type LalSortDirection,
} from '@shared/types/lalAudiences';
import {
  dateRangeToIso,
  getDefaultCustomDateRange,
  getPresetPatch,
  LAL_STATUS_OPTIONS,
  parseFilenameFromDisposition,
} from './LalAudiencesUtils';
import { ToastService } from '@/services/ToastService';

const DEFAULT_STATUSES = [...LAL_DEFAULT_STATUSES];
const ALL_VISIBLE_STATUS_KEYS = LAL_STATUS_OPTIONS.map((option) => option.key);
const SLIDER_DEBOUNCE_MS = 500;
const STATUS_DEBOUNCE_MS = 1000;

function isRangeValue(value: number | number[]): value is number[] {
  return Array.isArray(value) && value.length === 2;
}

function statusesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

export default function useLalAudiences() {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();

  const [period, setPeriodState] = useState<LalPeriodKey>(LAL_DEFAULT_PERIOD);
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [logic, setLogic] = useState<LalLogicMode>(LAL_DEFAULT_LOGIC);
  const [statuses, setStatuses] = useState<string[]>(DEFAULT_STATUSES);
  const [committedStatuses, setCommittedStatuses] = useState<string[]>(DEFAULT_STATUSES);
  const [preset, setPreset] = useState<LalPresetId | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LAL_DEFAULT_PAGE_SIZE);
  const [orderCountRange, setOrderCountRange] = useState<[number, number]>([0, LAL_ORDER_COUNT_UNBOUNDED]);
  const [ltvRange, setLtvRange] = useState<[number, number]>([0, LAL_LTV_UNBOUNDED]);
  const [committedOrderCount, setCommittedOrderCount] = useState<[number, number]>([0, LAL_ORDER_COUNT_UNBOUNDED]);
  const [committedLtv, setCommittedLtv] = useState<[number, number]>([0, LAL_LTV_UNBOUNDED]);
  const [exportColumns, setExportColumns] = useState<Set<LalExportColumn>>(
    () => new Set(LAL_DEFAULT_EXPORT_COLUMNS),
  );
  const [isExporting, setIsExporting] = useState(false);
  const [sortBy, setSortBy] = useState<LalSortColumn>(LAL_DEFAULT_SORT_COLUMN);
  const [sortDir, setSortDir] = useState<LalSortDirection>(LAL_DEFAULT_SORT_DIRECTION);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const orderChanged =
        committedOrderCount[0] !== orderCountRange[0] || committedOrderCount[1] !== orderCountRange[1];
      const ltvChanged = committedLtv[0] !== ltvRange[0] || committedLtv[1] !== ltvRange[1];
      if (!orderChanged && !ltvChanged) {
        return;
      }
      setCommittedOrderCount(orderCountRange);
      setCommittedLtv(ltvRange);
      setPage(1);
    }, SLIDER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [committedLtv, committedOrderCount, ltvRange, orderCountRange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (statusesEqual(committedStatuses, statuses)) {
        return;
      }
      setCommittedStatuses(statuses);
      setPage(1);
    }, STATUS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [committedStatuses, statuses]);

  const customDates = dateRangeToIso(period === 'custom' ? customRange : null);

  const filters: LalAudienceFilters = useMemo(
    () => ({
      period,
      startDate: customDates.startDate,
      endDate: customDates.endDate,
      logic,
      statuses: committedStatuses,
      preset,
      orderCountMin: committedOrderCount[0],
      orderCountMax: committedOrderCount[1],
      ltvMin: committedLtv[0],
      ltvMax: committedLtv[1],
      page,
      limit,
      sortBy,
      sortDir,
    }),
    [
      committedLtv,
      committedOrderCount,
      customDates.endDate,
      customDates.startDate,
      limit,
      logic,
      page,
      period,
      preset,
      sortBy,
      sortDir,
      committedStatuses,
    ],
  );

  const customReady = period !== 'custom' || Boolean(customDates.startDate && customDates.endDate);

  const query = useQuery({
    queryKey: ['lal-audiences', filters],
    enabled: !isAuthLoading && customReady,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<LalAudienceListResponse> => {
      const params = new URLSearchParams();
      params.set('period', filters.period);
      params.set('logic', filters.logic);
      params.set('statuses', filters.statuses.join(','));
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? LAL_DEFAULT_PAGE_SIZE));
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.orderCountMin != null) params.set('orderCountMin', String(filters.orderCountMin));
      if (filters.orderCountMax != null) params.set('orderCountMax', String(filters.orderCountMax));
      if (filters.ltvMin != null) params.set('ltvMin', String(filters.ltvMin));
      if (filters.ltvMax != null) params.set('ltvMax', String(filters.ltvMax));
      if (filters.preset) params.set('preset', filters.preset);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortDir) params.set('sortDir', filters.sortDir);

      const response = await apiCall(`/api/lal-audiences?${params.toString()}`);
      const data = (await response.json()) as LalAudienceListResponse | { success: false; error?: string };
      if (!response.ok || !data.success) {
        const message = 'error' in data && data.error ? data.error : 'Не вдалося завантажити аудиторію';
        throw new Error(message);
      }
      return data;
    },
  });

  const setPeriod = useCallback((next: LalPeriodKey) => {
    setPeriodState(next);
    setPage(1);
    if (next === 'custom') {
      setCustomRange((current) => current ?? getDefaultCustomDateRange());
    }
  }, []);

  const setLogicAndResetPage = useCallback((next: LalLogicMode) => {
    setLogic(next);
    setPage(1);
  }, []);

  const setLimitAndResetPage = useCallback((next: number) => {
    setLimit(next);
    setPage(1);
  }, []);

  const handleCustomRangeChange = useCallback((value: DateRange | null) => {
    setCustomRange(value);
    setPage(1);
  }, []);

  const togglePreset = useCallback((id: LalPresetId) => {
    setPreset((current) => {
      if (current === id) {
        return null;
      }
      const patch = getPresetPatch(id);
      if (patch.period) {
        setPeriodState(patch.period);
      }
      setOrderCountRange(patch.orderCountRange);
      setLtvRange(patch.ltvRange);
      setCommittedOrderCount(patch.orderCountRange);
      setCommittedLtv(patch.ltvRange);
      setPage(1);
      return id;
    });
  }, []);

  const handleOrderCountChange = useCallback((value: number | number[]) => {
    if (!isRangeValue(value)) return;
    setOrderCountRange([value[0], value[1]]);
  }, []);

  const handleLtvChange = useCallback((value: number | number[]) => {
    if (!isRangeValue(value)) return;
    setLtvRange([value[0], value[1]]);
  }, []);

  const toggleStatus = useCallback((statusKey: string, selected: boolean) => {
    setStatuses((current) => {
      if (selected) {
        if (current.includes(statusKey)) return current;
        return [...current, statusKey];
      }
      const next = current.filter((key) => key !== statusKey);
      return next.length > 0 ? next : current;
    });
  }, []);

  const toggleAllStatuses = useCallback((selected: boolean) => {
    setStatuses(selected ? [...ALL_VISIBLE_STATUS_KEYS] : [...DEFAULT_STATUSES]);
  }, []);

  const resetFilters = useCallback(() => {
    setPeriodState(LAL_DEFAULT_PERIOD);
    setCustomRange(null);
    setLogic(LAL_DEFAULT_LOGIC);
    setStatuses(DEFAULT_STATUSES);
    setCommittedStatuses(DEFAULT_STATUSES);
    setPreset(null);
    setPage(1);
    setLimit(LAL_DEFAULT_PAGE_SIZE);
    setOrderCountRange([0, LAL_ORDER_COUNT_UNBOUNDED]);
    setLtvRange([0, LAL_LTV_UNBOUNDED]);
    setCommittedOrderCount([0, LAL_ORDER_COUNT_UNBOUNDED]);
    setCommittedLtv([0, LAL_LTV_UNBOUNDED]);
    setSortBy(LAL_DEFAULT_SORT_COLUMN);
    setSortDir(LAL_DEFAULT_SORT_DIRECTION);
  }, []);

  const handleSortChange = useCallback((column: string, direction: 'ascending' | 'descending') => {
    if (!(LAL_SORT_COLUMNS as readonly string[]).includes(column)) return;
    setSortBy(column as LalSortColumn);
    setSortDir(direction === 'ascending' ? 'asc' : 'desc');
    setPage(1);
  }, []);

  const exportAudience = useCallback(
    async (format: LalExportFormat) => {
      setIsExporting(true);
      try {
        const body: LalAudienceExportBody = {
          ...filters,
          page: undefined,
          limit: undefined,
          format,
          columns: LAL_EXPORT_COLUMN_OPTIONS.map((option) => option.key).filter((column) =>
            exportColumns.has(column),
          ),
        };
        const response = await apiCall('/api/lal-audiences/export', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type') ?? '';
          if (contentType.includes('application/json')) {
            const data = (await response.json()) as { error?: string };
            throw new Error(data.error || 'Не вдалося експортувати аудиторію');
          }
          throw new Error('Не вдалося експортувати аудиторію');
        }

        const blob = await response.blob();
        const filename = parseFilenameFromDisposition(
          response.headers.get('Content-Disposition'),
          `lal-audiences.${format}`,
        );
        saveAs(blob, filename);
        ToastService.show({
          title: 'Експорт готовий',
          description: filename,
          color: 'success',
          icon: 'check-circle',
          timeout: 3000,
        });
      } catch (error) {
        ToastService.show({
          title: 'Помилка експорту',
          description: error instanceof Error ? error.message : 'Не вдалося експортувати аудиторію',
          color: 'danger',
          icon: 'alert-circle',
          timeout: 4000,
        });
      } finally {
        setIsExporting(false);
      }
    },
    [apiCall, exportColumns, filters],
  );

  const summary = query.data?.summary ?? null;
  const allStatusesSelected = statuses.length === ALL_VISIBLE_STATUS_KEYS.length;

  return {
    allStatusesSelected,
    customRange,
    error: query.error instanceof Error ? query.error.message : null,
    exportAudience,
    exportColumns,
    handleLtvChange,
    handleOrderCountChange,
    handleSortChange,
    isExporting,
    limit,
    loading: query.isLoading || query.isFetching,
    logic,
    ltvRange,
    orderCountRange,
    page,
    pagination: query.data?.pagination ?? null,
    period,
    preset,
    resetFilters,
    rows: query.data?.rows ?? [],
    sortBy,
    sortDir,
    setCustomRange: handleCustomRangeChange,
    setExportColumns,
    setLimit: setLimitAndResetPage,
    setLogic: setLogicAndResetPage,
    setPage,
    setPeriod,
    statuses,
    summary,
    toggleAllStatuses,
    togglePreset,
    toggleStatus,
  };
}
