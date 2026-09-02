import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addToast } from '@heroui/react';
import * as XLSX from 'xlsx';
import type { DateRange } from '@react-types/datepicker';
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import { useApi } from '@/hooks/useApi';
import { parseUrlHash, useUrlHashSync } from '@/hooks/useUrlHashSync';
import type {
  WarehouseStatementColumnHeaderStyle,
  WarehouseStatementConstructorPreset,
  WarehouseStatementDimensionId,
  WarehouseStatementExclusion,
  WarehouseStatementExpenseKind,
  WarehouseStatementMetaResponse,
  WarehouseStatementMetricId,
  WarehouseStatementPeriodMode,
  WarehouseStatementQueryRequest,
  WarehouseStatementQueryResponse,
  WarehouseStatementRow,
} from '@shared/types/warehouseStatement';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import {
  applyWarehouseStatementHash,
  buildQueryRequest,
  buildWarehouseStatementHashValues,
  calendarValueToYmd,
  dateRangeToPeriod,
  defaultAsOfDate,
  defaultPeriod,
  hasRequiredScope,
  isQueryResponse,
  loadConstructorPreset,
  matchDatePresetKey,
  parseYmdToCalendarDate,
  periodFromHash,
  periodToDateRange,
  readApiError,
  saveConstructorPreset,
  sanitizePreset,
  unwrapPayload,
  groupMetricsForConstructor,
  metricColumnHeader,
  orderColumnsByConstructor,
  UNIT_COST_COLUMN_LABEL,
  PROFITABILITY_COLUMN_LABEL,
  WAREHOUSE_STATEMENT_AS_OF_PRESETS,
  WAREHOUSE_STATEMENT_DEFAULT_PERIOD_PRESET,
} from './warehouseStatementUtils';

function flattenRows(rows: WarehouseStatementRow[]): WarehouseStatementRow[] {
  const result: WarehouseStatementRow[] = [];
  const visit = (items: WarehouseStatementRow[]) => {
    for (const row of items) {
      result.push(row);
      if (row.children?.length) {
        visit(row.children);
      }
    }
  };
  visit(rows);
  return result;
}

export default function useWarehouseStatement(meta: WarehouseStatementMetaResponse | null) {
  const { apiCall } = useApi();
  const [draft, setDraft] = useState<WarehouseStatementConstructorPreset | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<WarehouseStatementQueryRequest | null>(null);
  const [runToken, setRunToken] = useState(0);
  const [constructorOpen, setConstructorOpen] = useState(true);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(() => periodToDateRange(defaultPeriod()));
  const [datePresetKey, setDatePresetKey] = useState<string | null>(WAREHOUSE_STATEMENT_DEFAULT_PERIOD_PRESET);
  const [asOfDate, setAsOfDate] = useState<CalendarDate | null>(() => today(getLocalTimeZone()));
  const appliedMetaRef = useRef(false);
  const hashRestoreCountRef = useRef(0);

  const syncPeriodUi = useCallback((period: WarehouseStatementConstructorPreset['period']) => {
    if (period.mode === 'asOfDate') {
      const date = parseYmdToCalendarDate(period.asOfDate);
      setAsOfDate(date);
      setDateRange(date ? { start: date, end: date } : null);
      setDatePresetKey(date ? matchDatePresetKey({ start: date, end: date }) : null);
      return;
    }
    const range = periodToDateRange(period);
    setDateRange(range);
    setDatePresetKey(matchDatePresetKey(range));
  }, []);

  useEffect(() => {
    if (!meta || appliedMetaRef.current) {
      return;
    }
    appliedMetaRef.current = true;
    let next = sanitizePreset(loadConstructorPreset(), meta);
    const params = parseUrlHash(window.location.hash);
    if ([...params.keys()].length > 0) {
      next = sanitizePreset(applyWarehouseStatementHash(next, params, meta), meta);
    }
    setDraft(next);
    syncPeriodUi(next.period);
  }, [meta, syncPeriodUi]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    saveConstructorPreset(draft);
  }, [draft]);

  useUrlHashSync(
    draft && meta ? buildWarehouseStatementHashValues(draft, meta, datePresetKey) : {},
    (params) => {
      hashRestoreCountRef.current += 1;
      if ([...params.keys()].length === 0 && hashRestoreCountRef.current === 1) {
        return;
      }
      if (!meta) {
        return;
      }
      const hashedPeriod = periodFromHash(params);
      if (hashedPeriod) {
        syncPeriodUi(hashedPeriod);
      } else if (hashRestoreCountRef.current > 1) {
        syncPeriodUi(defaultPeriod());
      }
      setDraft((current) => {
        if (!current) {
          return current;
        }
        return sanitizePreset(applyWarehouseStatementHash(current, params, meta), meta);
      });
    },
    { enabled: Boolean(draft && meta), replace: true },
  );

  const periodMode: WarehouseStatementPeriodMode = draft?.period.mode ?? 'dateRange';

  const patchDraft = useCallback((patch: Partial<WarehouseStatementConstructorPreset>) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return { ...current, ...patch };
    });
  }, []);

  const setPeriodMode = useCallback((mode: WarehouseStatementPeriodMode) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      if (mode === 'asOfDate') {
        const date = asOfDate ? calendarValueToYmd(asOfDate) : defaultAsOfDate();
        return { ...current, period: { mode: 'asOfDate', asOfDate: date } };
      }
      const fromRange = dateRangeToPeriod(dateRange) ?? defaultPeriod();
      return { ...current, period: fromRange };
    });
  }, [asOfDate, dateRange]);

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range);
    const key = matchDatePresetKey(range);
    setDatePresetKey(key);
    if (range?.end && key && WAREHOUSE_STATEMENT_AS_OF_PRESETS.has(key)) {
      const end = range.end as CalendarDate;
      setAsOfDate(end);
      patchDraft({ period: { mode: 'asOfDate', asOfDate: calendarValueToYmd(end) } });
      return;
    }
    const period = dateRangeToPeriod(range);
    if (period) {
      patchDraft({ period });
    }
  }, [patchDraft]);

  const handleDatePresetChange = useCallback((key: string | null) => {
    setDatePresetKey(key);
    if (!key || key === 'custom') {
      return;
    }
    const preset = createStandardDatePresets().find((item) => item.key === key);
    if (!preset) {
      return;
    }
    const range = preset.getRange();
    setDateRange(range);
    const end = range.end as CalendarDate;
    setAsOfDate(end);

    if (WAREHOUSE_STATEMENT_AS_OF_PRESETS.has(key)) {
      patchDraft({ period: { mode: 'asOfDate', asOfDate: calendarValueToYmd(end) } });
      return;
    }

    patchDraft({ period: dateRangeToPeriod(range) ?? defaultPeriod() });
  }, [patchDraft]);

  const handleAsOfDateChange = useCallback((value: CalendarDate | null) => {
    setAsOfDate(value);
    if (!value) {
      return;
    }
    setDateRange({ start: value, end: value });
    setDatePresetKey(matchDatePresetKey({ start: value, end: value }));
    patchDraft({ period: { mode: 'asOfDate', asOfDate: calendarValueToYmd(value) } });
  }, [patchDraft]);

  const setDimensionFilter = useCallback((dimensionId: WarehouseStatementDimensionId, values: string[]) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const nextFilters = { ...(current.dimensionFilters ?? {}) };
      if (values.length === 0) {
        delete nextFilters[dimensionId];
      } else {
        nextFilters[dimensionId] = values;
      }
      return { ...current, dimensionFilters: nextFilters };
    });
  }, []);

  const setGrouping = useCallback((grouping: WarehouseStatementDimensionId[]) => {
    patchDraft({ grouping });
  }, [patchDraft]);

  const setColumns = useCallback((columns: WarehouseStatementMetricId[]) => {
    patchDraft({ columns });
  }, [patchDraft]);

  const setGroupIds = useCallback((groupIds: string[]) => {
    patchDraft({ groupIds });
  }, [patchDraft]);

  const setExpenseKinds = useCallback((expenseKinds: WarehouseStatementExpenseKind[]) => {
    patchDraft({ expenseKinds });
  }, [patchDraft]);

  const setPriceType = useCallback((priceType: string | undefined) => {
    patchDraft({ priceType });
  }, [patchDraft]);

  const setHideZeroQty = useCallback((hideZeroQty: boolean) => {
    patchDraft({ hideZeroQty });
  }, [patchDraft]);

  const setColumnHeaderStyle = useCallback((columnHeaderStyle: WarehouseStatementColumnHeaderStyle) => {
    patchDraft({ columnHeaderStyle });
  }, [patchDraft]);

  const setPinTotals = useCallback((pinTotals: boolean) => {
    patchDraft({ pinTotals });
  }, [patchDraft]);

  const setExclusions = useCallback((exclusions: WarehouseStatementExclusion[]) => {
    patchDraft({ exclusions });
  }, [patchDraft]);

  const [actionUndo, setActionUndo] = useState<{
    prefix: string;
    label: string;
    restore: Partial<WarehouseStatementConstructorPreset>;
  } | null>(null);

  const beginUndo = useCallback((
    prefix: string,
    label: string,
    restore: Partial<WarehouseStatementConstructorPreset>,
  ) => {
    setActionUndo({ prefix, label, restore });
  }, []);

  const addExclusion = useCallback((item: WarehouseStatementExclusion) => {
    if (!item.valueId || !item.dimensionId || !draft) {
      return;
    }
    const list = draft.exclusions ?? [];
    if (list.some((entry) => entry.dimensionId === item.dimensionId && entry.valueId === item.valueId)) {
      return;
    }
    beginUndo('Виключено', item.label || item.valueId, { exclusions: list });
    patchDraft({ exclusions: [...list, item] });
  }, [beginUndo, draft, patchDraft]);

  const undoAction = useCallback(() => {
    setActionUndo((current) => {
      if (current) {
        patchDraft(current.restore);
      }
      return null;
    });
  }, [patchDraft]);

  const dismissActionUndo = useCallback(() => {
    setActionUndo(null);
  }, []);

  const clearExclusions = useCallback(() => {
    const list = draft?.exclusions ?? [];
    if (list.length > 0) {
      beginUndo('Скинуто', `виключення (${list.length})`, { exclusions: list });
    }
    patchDraft({ exclusions: [] });
  }, [beginUndo, draft, patchDraft]);

  const query = useQuery({
    queryKey: ['warehouse-statement', submittedRequest, runToken],
    enabled: submittedRequest != null && runToken > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<WarehouseStatementQueryResponse> => {
      const response = await apiCall('/api/reports/warehouse-statement', {
        method: 'POST',
        body: JSON.stringify(submittedRequest),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Не вдалося сформувати відомість'));
      }
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success === false) {
        throw new Error(
          (data as { error?: string; message?: string }).error
            || (data as { message?: string }).message
            || 'Не вдалося сформувати відомість',
        );
      }
      return unwrapPayload(data, isQueryResponse);
    },
  });

  const generate = useCallback(() => {
    if (!draft || !meta) {
      addToast({
        title: 'Схема ще не завантажена',
        description: 'Зачекайте метадані конструктора',
        color: 'warning',
      });
      return;
    }
    if (draft.columns.length === 0 || draft.grouping.length === 0) {
      addToast({
        title: 'Неповна спека',
        description: 'Оберіть групування та хоча б одну колонку',
        color: 'warning',
      });
      return;
    }
    if (!hasRequiredScope(draft, meta)) {
      addToast({
        title: 'Потрібен відбір',
        description: 'Оберіть склад, групу товарів або товар — інакше запит буде занадто широким',
        color: 'warning',
      });
      return;
    }
    const request = buildQueryRequest({
      ...draft,
      columns: orderColumnsByConstructor(draft.columns, meta),
    });
    setSubmittedRequest(request);
    setRunToken((current) => current + 1);
    setHasGenerated(true);
    setConstructorOpen(false);
  }, [draft, meta]);

  const exportToExcel = useCallback(() => {
    const data = query.data;
    if (!data || !meta) {
      addToast({
        title: 'Немає даних',
        description: 'Спочатку сформуйте відомість',
        color: 'warning',
      });
      return;
    }

    const metricById = new Map(meta.metrics.map((metric) => [metric.id, metric]));
    const columns = orderColumnsByConstructor(data.columns, meta);
    const groupByMetric = new Map<string, string>();
    for (const group of groupMetricsForConstructor(meta)) {
      for (const metric of group.metrics) {
        groupByMetric.set(metric.id, group.title);
      }
    }
    const headerStyle = draft?.columnHeaderStyle ?? 'short';

    const groupRow: (string | number)[] = ['Найменування'];
    const slotRow: (string | number)[] = [''];
    const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];

    let excelCol = 1;
    let index = 0;
    while (index < columns.length) {
      const groupTitle = groupByMetric.get(columns[index]) ?? '';
      let span = 1;
      while (
        index + span < columns.length
        && (groupByMetric.get(columns[index + span]) ?? '') === groupTitle
      ) {
        span += 1;
      }
      groupRow.push(groupTitle);
      for (let extra = 1; extra < span; extra += 1) {
        groupRow.push('');
      }
      if (span > 1) {
        merges.push({ s: { r: 0, c: excelCol }, e: { r: 0, c: excelCol + span - 1 } });
      }
      for (let offset = 0; offset < span; offset += 1) {
        const metric = metricById.get(columns[index + offset]);
        if (metric?.kind === 'unitCost') {
          slotRow.push(UNIT_COST_COLUMN_LABEL);
        } else if (metric?.kind === 'salesProfitability') {
          slotRow.push(PROFITABILITY_COLUMN_LABEL);
        } else {
          const header = metric
            ? metricColumnHeader(metric, headerStyle)
            : { label: columns[index + offset] };
          slotRow.push(header.badge || header.label);
        }
      }
      excelCol += span;
      index += span;
    }

    const flat = flattenRows(data.rows);
    const aoa: (string | number)[][] = [
      groupRow,
      slotRow,
      ...flat.map((row) => {
        const skuPart = row.sku ? ` ・ ${row.sku}` : '';
        return [
          `${'  '.repeat(row.depth)}${row.label}${skuPart}`,
          ...columns.map((id) => {
            const value = row.values[id];
            return value == null || !Number.isFinite(value) ? '' : value;
          }),
        ];
      }),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet['!merges'] = merges;
    worksheet['!cols'] = [{ wch: 48 }, ...columns.map(() => ({ wch: 14 }))];
    worksheet['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let row = 2; row <= range.e.r; row += 1) {
      for (let col = 1; col <= range.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[address];
        if (cell && typeof cell.v === 'number') {
          const metricId = columns[col - 1];
          const format = metricById.get(metricId ?? '')?.format ?? 'qty';
          cell.t = 'n';
          cell.z =
            format === 'percent'
              ? '0.0%'
              : format === 'money'
                ? '#,##0.00'
                : '#,##0.###';
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Відомість');
    const periodLabel =
      draft?.period.mode === 'asOfDate'
        ? draft.period.asOfDate
        : `${draft?.period.mode === 'dateRange' ? draft.period.startDate : ''}–${draft?.period.mode === 'dateRange' ? draft.period.endDate : ''}`;
    XLSX.writeFile(workbook, `Відомість_складу_${periodLabel}.xlsx`);
  }, [draft, meta, query.data]);

  const result = query.data ?? null;

  return {
    draft,
    constructorOpen,
    setConstructorOpen,
    hasGenerated,
    periodMode,
    setPeriodMode,
    dateRange,
    datePresetKey,
    asOfDate,
    handleDateRangeChange,
    handleDatePresetChange,
    handleAsOfDateChange,
    setDimensionFilter,
    setGrouping,
    setColumns,
    setGroupIds,
    setExpenseKinds,
    setPriceType,
    setHideZeroQty,
    setColumnHeaderStyle,
    setPinTotals,
    setExclusions,
    addExclusion,
    clearExclusions,
    beginUndo,
    actionUndo,
    undoAction,
    dismissActionUndo,
    generate,
    exportToExcel,
    result,
    loading: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
