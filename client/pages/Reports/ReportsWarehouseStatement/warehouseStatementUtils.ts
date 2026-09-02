import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import {
  WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES,
  WAREHOUSE_STATEMENT_EXPENSE_KINDS,
  WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID,
  WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID,
  WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP,
  WAREHOUSE_STATEMENT_VALUE_TYPES,
  warehouseStatementSalesValueMetricId,
  warehouseStatementUnitCostMetricId,
  warehouseStatementValueTypeIncludes,
  warehouseStatementVirtualBatFields,
  type WarehouseStatementColumnHeaderStyle,
  type WarehouseStatementConstructorPreset,
  type WarehouseStatementDimensionId,
  type WarehouseStatementDirectoryItem,
  type WarehouseStatementExclusion,
  type WarehouseStatementExpenseKind,
  type WarehouseStatementMetaResponse,
  type WarehouseStatementMetricMeta,
  type WarehouseStatementPeriod,
  type WarehouseStatementQueryRequest,
  type WarehouseStatementQueryResponse,
  type WarehouseStatementRow,
} from '@shared/types/warehouseStatement';
import { formatCalendarDateValue } from '../shared/ReportsSharedUtils';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';

export const WAREHOUSE_STATEMENT_PRESET_STORAGE_KEY = 'nk.warehouseStatement.constructorPreset.v4';
export const WAREHOUSE_STATEMENT_DEFAULT_PERIOD_PRESET = 'lastMonth';
export const WAREHOUSE_STATEMENT_AS_OF_PRESETS = new Set(['today', 'yesterday']);

export const EXPENSE_KIND_LABELS: Record<WarehouseStatementExpenseKind, string> = {
  sale: 'Продаж',
  goodMoving: 'Переміщення',
  goodWriteOff: 'Списання',
};

export function calendarValueToYmd(value: { year: number; month: number; day: number }): string {
  return formatCalendarDateValue(value);
}

export function parseYmdToCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function periodToDateRange(period: WarehouseStatementPeriod): DateRange | null {
  if (period.mode === 'asOfDate') {
    const date = parseYmdToCalendarDate(period.asOfDate);
    return date ? { start: date, end: date } : null;
  }
  const start = parseYmdToCalendarDate(period.startDate);
  const end = parseYmdToCalendarDate(period.endDate);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

export function dateRangeToPeriod(range: DateRange | null): WarehouseStatementPeriod | null {
  if (!range?.start || !range.end) {
    return null;
  }
  return {
    mode: 'dateRange',
    startDate: calendarValueToYmd(range.start),
    endDate: calendarValueToYmd(range.end),
  };
}

export function defaultPeriod(): WarehouseStatementPeriod {
  const presets = createStandardDatePresets();
  const preset = presets.find((item) => item.key === WAREHOUSE_STATEMENT_DEFAULT_PERIOD_PRESET);
  const range = preset?.getRange() ?? {
    start: today(getLocalTimeZone()),
    end: today(getLocalTimeZone()),
  };
  return {
    mode: 'dateRange',
    startDate: calendarValueToYmd(range.start),
    endDate: calendarValueToYmd(range.end),
  };
}

export function defaultAsOfDate(): string {
  return calendarValueToYmd(today(getLocalTimeZone()));
}

export function matchDatePresetKey(range: DateRange | null): string | null {
  if (!range?.start || !range.end) {
    return null;
  }
  for (const preset of createStandardDatePresets()) {
    const candidate = preset.getRange();
    if (candidate.start.compare(range.start) === 0 && candidate.end.compare(range.end) === 0) {
      return preset.key;
    }
  }
  return 'custom';
}

export function loadConstructorPreset(): WarehouseStatementConstructorPreset | null {
  try {
    const raw = window.localStorage.getItem(WAREHOUSE_STATEMENT_PRESET_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as WarehouseStatementConstructorPreset;
  } catch {
    return null;
  }
}

export function saveConstructorPreset(preset: WarehouseStatementConstructorPreset): void {
  try {
    window.localStorage.setItem(WAREHOUSE_STATEMENT_PRESET_STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // quota / private mode — ігноруємо
  }
}

export function sanitizeIdList(ids: string[] | undefined, allowed: Set<string>, fallback: string[]): string[] {
  const kept = (ids ?? []).filter((id) => allowed.has(id));
  return kept.length > 0 ? kept : fallback;
}

export function sanitizeDimensionFilters(
  filters: Record<string, string[]> | undefined,
  allowedDimensionIds: Set<string>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  if (!filters) {
    return next;
  }
  for (const [key, values] of Object.entries(filters)) {
    if (!allowedDimensionIds.has(key) || !Array.isArray(values) || values.length === 0) {
      continue;
    }
    next[key] = values.filter((value) => value.length > 0);
  }
  return next;
}

export function sanitizeExpenseKinds(kinds: WarehouseStatementExpenseKind[] | undefined): WarehouseStatementExpenseKind[] {
  if (!kinds) {
    return [];
  }
  const allowed = new Set<string>(WAREHOUSE_STATEMENT_EXPENSE_KINDS);
  return kinds.filter((kind) => allowed.has(kind));
}

export function sanitizePreset(
  preset: WarehouseStatementConstructorPreset | null,
  meta: WarehouseStatementMetaResponse,
): WarehouseStatementConstructorPreset {
  const dimensionIds = new Set(meta.dimensions.map((item) => item.id));
  const metricIds = new Set(meta.metrics.map((item) => item.id));
  const priceTypeIds = new Set(meta.priceTypes.map((item) => item.id));

  const grouping = sanitizeIdList(preset?.grouping, dimensionIds, meta.defaultGrouping);
  const rawColumns = sanitizeIdList(preset?.columns, metricIds, meta.defaultColumns);
  const columns = orderColumnsByConstructor(
    syncProfitabilityColumn(rawColumns, rawColumns),
    meta,
  );

  const period = preset?.period ?? defaultPeriod();
  const priceType =
    preset?.priceType && priceTypeIds.has(preset.priceType) ? preset.priceType : undefined;

  return {
    period,
    dimensionFilters: sanitizeDimensionFilters(
      preset?.dimensionFilters,
      new Set(meta.dimensions.filter((item) => item.source === 'register').map((item) => item.id)),
    ),
    groupIds: (preset?.groupIds ?? []).filter((id) => meta.groups.some((group) => group.id === id)),
    exclusions: sanitizeExclusions(preset?.exclusions, meta),
    expenseKinds: sanitizeExpenseKinds(preset?.expenseKinds),
    priceType,
    grouping,
    columns,
    hideZeroQty: preset?.hideZeroQty ?? true,
    columnHeaderStyle: sanitizeColumnHeaderStyle(preset?.columnHeaderStyle),
    pinTotals: preset?.pinTotals ?? true,
  };
}

export function buildQueryRequest(preset: WarehouseStatementConstructorPreset): WarehouseStatementQueryRequest {
  const request: WarehouseStatementQueryRequest = {
    period: preset.period,
    grouping: preset.grouping,
    columns: preset.columns,
    hideZeroQty: preset.hideZeroQty ?? true,
  };

  if (preset.dimensionFilters && Object.keys(preset.dimensionFilters).length > 0) {
    request.dimensionFilters = preset.dimensionFilters;
  }
  if (preset.groupIds && preset.groupIds.length > 0) {
    request.groupIds = preset.groupIds;
  }
  if (preset.exclusions && preset.exclusions.length > 0) {
    request.exclusions = preset.exclusions;
  }
  if (preset.expenseKinds && preset.expenseKinds.length > 0) {
    request.expenseKinds = preset.expenseKinds;
  }
  if (preset.priceType) {
    request.priceType = preset.priceType;
  }

  return request;
}

export function hasRequiredScope(preset: WarehouseStatementConstructorPreset, meta: WarehouseStatementMetaResponse): boolean {
  const storageName = meta.resolved.storageDimensionName;
  const goodsName = meta.resolved.goodsDimensionName;
  const storageSelected = storageName ? (preset.dimensionFilters?.[storageName]?.length ?? 0) > 0 : false;
  const goodsSelected = goodsName ? (preset.dimensionFilters?.[goodsName]?.length ?? 0) > 0 : false;
  const groupsSelected = (preset.groupIds?.length ?? 0) > 0;
  return storageSelected || goodsSelected || groupsSelected;
}

export function exclusionKey(item: Pick<WarehouseStatementExclusion, 'dimensionId' | 'valueId'>): string {
  return `${item.dimensionId}::${item.valueId}`;
}

export function sanitizeExclusions(
  items: WarehouseStatementExclusion[] | undefined,
  meta: WarehouseStatementMetaResponse,
): WarehouseStatementExclusion[] {
  if (!items?.length) {
    return [];
  }
  const allowed = new Set(meta.dimensions.map((item) => item.id));
  const seen = new Set<string>();
  const next: WarehouseStatementExclusion[] = [];
  for (const item of items) {
    if (!item?.valueId || !allowed.has(item.dimensionId)) {
      continue;
    }
    const key = exclusionKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push({
      dimensionId: item.dimensionId,
      valueId: item.valueId,
      label: item.label?.trim() || undefined,
    });
  }
  return next;
}

function groupAncestors(
  groupId: string | undefined,
  groupsById: Map<string, WarehouseStatementDirectoryItem>,
): string[] {
  const ids: string[] = [];
  let current: string | null | undefined = groupId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    ids.push(current);
    current = groupsById.get(current)?.parentId ?? null;
  }
  return ids;
}

export function pruneRowsByExclusions(
  rows: WarehouseStatementRow[],
  exclusions: WarehouseStatementExclusion[] | undefined,
  meta: WarehouseStatementMetaResponse,
): WarehouseStatementRow[] {
  if (!exclusions?.length) {
    return rows;
  }
  const groupsById = new Map(meta.groups.map((group) => [group.id, group]));
  const excludedGroups = new Set(
    exclusions
      .filter((item) => item.dimensionId === WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP)
      .map((item) => item.valueId),
  );
  const keys = new Set(exclusions.map(exclusionKey));

  const visit = (items: WarehouseStatementRow[]): WarehouseStatementRow[] => {
    const next: WarehouseStatementRow[] = [];
    for (const row of items) {
      if (row.kind === 'total') {
        next.push(row);
        continue;
      }
      if (row.dimensionId && row.valueId && keys.has(exclusionKey({
        dimensionId: row.dimensionId,
        valueId: row.valueId,
      }))) {
        continue;
      }
      if (excludedGroups.size > 0) {
        const startId = row.dimensionId === WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP
          ? row.valueId
          : row.groupId;
        if (groupAncestors(startId, groupsById).some((id) => excludedGroups.has(id))) {
          continue;
        }
      }
      const children = row.children ? visit(row.children) : undefined;
      if (row.children && (!children || children.length === 0)) {
        continue;
      }
      next.push(children ? { ...row, children } : row);
    }
    return next;
  };

  return visit(rows);
}

export function sumLeafValues(
  rows: WarehouseStatementRow[],
  meta?: WarehouseStatementMetaResponse,
): Record<string, number> {
  const acc: Record<string, number> = {};
  const leaves: WarehouseStatementRow[] = [];
  const walk = (items: WarehouseStatementRow[]) => {
    for (const row of items) {
      if (row.children && row.children.length > 0) {
        walk(row.children);
        continue;
      }
      if (row.kind === 'total') {
        continue;
      }
      leaves.push(row);
      for (const [key, value] of Object.entries(row.values)) {
        acc[key] = (acc[key] ?? 0) + (value ?? 0);
      }
    }
  };
  walk(rows);

  if (!meta || leaves.length === 0) {
    return acc;
  }

  const qtyName = meta.resolved.qtyResourceName;
  const qtyBat = qtyName ? warehouseStatementVirtualBatFields(qtyName) : undefined;
  const qtyFinal = qtyBat ? (acc[qtyBat.final] ?? 0) : 0;
  const qtyStart = qtyBat ? (acc[qtyBat.start] ?? 0) : 0;

  const ratioOrFallback = (moneyFinal: number, moneyStart: number): number => {
    if (Math.abs(qtyFinal) > 1e-6) return moneyFinal / qtyFinal;
    if (Math.abs(qtyStart) > 1e-6) return moneyStart / qtyStart;
    return 0;
  };

  const weightedFromLeaves = (metricId: string): number => {
    let weight = 0;
    let weighted = 0;
    for (const leaf of leaves) {
      const qty = qtyBat
        ? (Math.abs(leaf.values[qtyBat.final] ?? 0) > 1e-6
          ? (leaf.values[qtyBat.final] ?? 0)
          : (leaf.values[qtyBat.start] ?? 0))
        : 1;
      weighted += (leaf.values[metricId] ?? 0) * qty;
      weight += qty;
    }
    return Math.abs(weight) > 1e-6 ? weighted / weight : 0;
  };

  for (const metric of meta.metrics) {
    if (metric.kind === 'unitCost' && metric.resourceName) {
      const moneyBat = warehouseStatementVirtualBatFields(metric.resourceName);
      const hasMoney = acc[moneyBat.final] != null || acc[moneyBat.start] != null;
      acc[metric.id] = hasMoney
        ? ratioOrFallback(acc[moneyBat.final] ?? 0, acc[moneyBat.start] ?? 0)
        : weightedFromLeaves(metric.id);
    }
  }

  const salesFinal = acc[warehouseStatementSalesValueMetricId('final')];
  const salesStart = acc[warehouseStatementSalesValueMetricId('start')];
  const hasSalesValue = salesFinal != null || salesStart != null;
  const salePrice = hasSalesValue
    ? ratioOrFallback(salesFinal ?? 0, salesStart ?? 0)
    : weightedFromLeaves(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID);
  acc[WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID] = salePrice;

  const costResource = meta.resources.find((resource) => resource.role === 'money' && resource.name === 'amount')
    ?? meta.resources.find((resource) => resource.role === 'money');
  const unitCostId = costResource ? warehouseStatementUnitCostMetricId(costResource.name) : undefined;
  const unitCost = unitCostId ? (acc[unitCostId] ?? 0) : 0;
  if (unitCost > 0 && Number.isFinite(salePrice) && Math.abs(salePrice) >= 1e-9) {
    acc[WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID] = (salePrice - unitCost) / salePrice;
  } else {
    delete acc[WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID];
  }

  return acc;
}

export function sanitizeColumnHeaderStyle(
  value: WarehouseStatementColumnHeaderStyle | undefined,
): WarehouseStatementColumnHeaderStyle {
  if (value && (WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES as readonly string[]).includes(value)) {
    return value;
  }
  return 'short';
}

export function isCurrencyMetricGroupTitle(title: string): boolean {
  return /валют/i.test(title);
}

const BAT_SLOT_SHORT_LABEL: Record<string, string> = {
  start: 'Початок',
  receipt: 'Прихід',
  expense: 'Витрата',
  final: 'Кінець',
};

export const UNIT_COST_COLUMN_LABEL = 'За одиницю';

export const UNIT_COST_COLUMN_TOOLTIP =
  '«За одиницю» – це собівартість однієї одиниці товару на кінець періоду: сума собівартості на кінець ÷ кількість на кінець';

export const PROFITABILITY_COLUMN_LABEL = 'Рентабельність';
export const PROFITABILITY_COLUMN_SHORT_LABEL = 'Рент.';

export const PROFITABILITY_COLUMN_TOOLTIP =
  'Рентабельність = (ціна продажу − собівартість за одиницю) ÷ ціна продажу. Не рахується, якщо собівартість нульова або відʼємна.';

export function metricColumnHeader(
  metric: WarehouseStatementMetricMeta,
  style: WarehouseStatementColumnHeaderStyle,
): { label: string; badge?: string } {
  if (metric.kind === 'unitCost') {
    return { label: UNIT_COST_COLUMN_LABEL };
  }
  if (metric.kind === 'salesProfitability') {
    return { label: PROFITABILITY_COLUMN_SHORT_LABEL };
  }

  const slotLabel = metric.slot ? BAT_SLOT_SHORT_LABEL[metric.slot] : undefined;

  if (style === 'full') {
    return { label: metric.presentation };
  }

  if (slotLabel) {
    return { label: slotLabel };
  }
  const stripped = metric.presentation.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { label: stripped || metric.presentation };
}

export interface MetricColumnGroup {
  title: string;
  metrics: WarehouseStatementMetricMeta[];
}

export function constructorMetricCheckboxLabel(
  metric: WarehouseStatementMetricMeta,
  groupTitle: string,
): string {
  if (metric.kind === 'unitCost') {
    return UNIT_COST_COLUMN_LABEL;
  }
  if (metric.kind === 'salesProfitability') {
    return PROFITABILITY_COLUMN_LABEL;
  }
  if (metric.slot && BAT_SLOT_SHORT_LABEL[metric.slot]) {
    return BAT_SLOT_SHORT_LABEL[metric.slot];
  }

  const prefix = groupTitle.trim();
  let label = metric.presentation;
  if (prefix && label.toLowerCase().startsWith(prefix.toLowerCase())) {
    label = label.slice(prefix.length).trim();
  }
  if (prefix) {
    label = label.replace(new RegExp(`\\(\\s*${escapeRegExp(prefix)}\\s*\\)`, 'i'), '').trim();
  }
  const wrapped = /^\(([^)]+)\)$/.exec(label);
  if (wrapped?.[1]) {
    return wrapped[1];
  }
  return label || metric.presentation;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function orderColumnsByConstructor(
  selected: string[],
  meta: WarehouseStatementMetaResponse,
): string[] {
  const selectedSet = new Set(selected);
  const ordered: string[] = [];
  for (const group of groupMetricsForConstructor(meta)) {
    for (const metric of group.metrics) {
      if (selectedSet.has(metric.id)) {
        ordered.push(metric.id);
      }
    }
  }
  for (const id of selected) {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  }
  return ordered;
}

/**
 * Рентабельність доступна лише разом із «Ціна продажу».
 * Коли ціну щойно увімкнули — колонка вмикається за замовчуванням.
 */
export function syncProfitabilityColumn(previous: string[], next: string[]): string[] {
  const hadPrice = previous.includes(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID);
  const hasPrice = next.includes(WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID);
  if (!hasPrice) {
    return next.filter((id) => id !== WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID);
  }
  if (
    !hadPrice
    && !next.includes(WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID)
  ) {
    return [...next, WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID];
  }
  return next;
}

export function groupMetricsForConstructor(meta: WarehouseStatementMetaResponse): MetricColumnGroup[] {
  const qtyResources = meta.resources.filter((resource) => resource.role === 'qty');
  const otherResources = meta.resources.filter((resource) => resource.role !== 'qty');

  const metricsForResource = (resourceName: string): WarehouseStatementMetricMeta[] =>
    meta.metrics.filter((metric) => metric.resourceName === resourceName);

  const groups: MetricColumnGroup[] = [];

  for (const resource of qtyResources) {
    groups.push({
      title: resource.presentation || 'Кількість',
      metrics: metricsForResource(resource.name),
    });
  }

  for (const resource of otherResources) {
    groups.push({
      title: resource.presentation || 'Собівартість',
      metrics: metricsForResource(resource.name),
    });
  }

  const salesMetrics = meta.metrics.filter(
    (metric) =>
      metric.kind === 'salesValue'
      || metric.kind === 'salesUnitPrice'
      || metric.kind === 'salesProfitability',
  );
  if (salesMetrics.length > 0) {
    groups.push({
      title: 'Ціни продажу',
      metrics: salesMetrics,
    });
  }

  const listed = new Set(groups.flatMap((group) => group.metrics.map((metric) => metric.id)));
  const rest = meta.metrics.filter((metric) => !listed.has(metric.id));
  if (rest.length > 0) {
    groups.push({ title: 'Інші', metrics: rest });
  }

  return groups.filter(
    (group) => group.metrics.length > 0 && !isCurrencyMetricGroupTitle(group.title),
  );
}

export function directoryItemsForDimension(
  dimensionId: WarehouseStatementDimensionId,
  meta: WarehouseStatementMetaResponse,
) {
  const dimension = meta.dimensions.find((item) => item.id === dimensionId);
  if (!dimension?.valueType) {
    return [];
  }
  if (warehouseStatementValueTypeIncludes(dimension.valueType, WAREHOUSE_STATEMENT_VALUE_TYPES.storages)) {
    return meta.storages;
  }
  if (warehouseStatementValueTypeIncludes(dimension.valueType, WAREHOUSE_STATEMENT_VALUE_TYPES.firms)) {
    return meta.firms;
  }
  return [];
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) {
    if (response.status === 404) {
      return 'API відомості ще недоступне (404)';
    }
    return fallback;
  }

  try {
    const data = JSON.parse(text) as {
      error?: string;
      message?: string;
      details?: string;
    };
    return data.error || data.message || data.details || fallback;
  } catch {
    if (response.status === 404) {
      return 'API відомості ще недоступне (404)';
    }
    return fallback;
  }
}

export function unwrapPayload<T extends object>(data: unknown, isMatch: (value: unknown) => value is T): T {
  if (isMatch(data)) {
    return data;
  }
  if (data && typeof data === 'object' && 'data' in data && isMatch((data as { data: unknown }).data)) {
    return (data as { data: T }).data;
  }
  throw new Error('Неочікувана відповідь сервера');
}

export function isMetaResponse(value: unknown): value is WarehouseStatementMetaResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as WarehouseStatementMetaResponse;
  return Boolean(candidate.shape && Array.isArray(candidate.dimensions) && Array.isArray(candidate.metrics));
}

export function isQueryResponse(value: unknown): value is WarehouseStatementQueryResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as WarehouseStatementQueryResponse;
  return Array.isArray(candidate.rows) && Array.isArray(candidate.columns) && candidate.totals != null;
}
