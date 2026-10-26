import { zonedWallTimeToUtc } from './kyivDateTime.js';

export type WarehouseDocHistorySortBy = 'operDate' | 'createdAt' | 'docNumber';
export type WarehouseDocHistoryDateField = 'operDate' | 'createdAt';

export type WarehouseDocHistoryListQuery = {
  page?: number;
  limit?: number;
  status?: 'active' | 'deleted';
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dateField?: WarehouseDocHistoryDateField | null;
  sortBy?: WarehouseDocHistorySortBy | null;
  sortOrder?: 'asc' | 'desc' | null;
};

export type WarehouseDocHistoryFilters = {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  dateField: WarehouseDocHistoryDateField;
  sortBy: WarehouseDocHistorySortBy;
  sortOrder: 'asc' | 'desc';
};

export const DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS: WarehouseDocHistoryFilters = {
  search: '',
  dateFrom: null,
  dateTo: null,
  dateField: 'operDate',
  sortBy: 'operDate',
  sortOrder: 'desc',
};

function parseYmdDate(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(trimmed)) return null;
  return trimmed;
}

export function kyivDayBounds(dateYmd: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateYmd).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return {
    start: zonedWallTimeToUtc(year, month, day, 0, 0, 0),
    end: zonedWallTimeToUtc(year, month, day, 23, 59, 59),
  };
}

export function parseWarehouseDocHistoryListQuery(
  query: Record<string, unknown>,
  defaults?: Partial<WarehouseDocHistoryListQuery>,
): WarehouseDocHistoryListQuery {
  const page = Math.max(1, Number(query.page) || defaults?.page || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || defaults?.limit || 10));
  const status = String(query.status ?? defaults?.status ?? 'active').toLowerCase() === 'deleted'
    ? 'deleted'
    : 'active';

  const sortByRaw = String(query.sortBy ?? defaults?.sortBy ?? 'operDate');
  const sortBy: WarehouseDocHistorySortBy = sortByRaw === 'createdAt' || sortByRaw === 'docNumber'
    ? sortByRaw
    : 'operDate';

  const dateFieldRaw = String(query.dateField ?? defaults?.dateField ?? 'operDate');
  const dateField: WarehouseDocHistoryDateField = dateFieldRaw === 'createdAt' ? 'createdAt' : 'operDate';
  const sortOrder = String(query.sortOrder ?? defaults?.sortOrder ?? 'desc').toLowerCase() === 'asc'
    ? 'asc'
    : 'desc';

  const dateFrom = parseYmdDate(
    typeof query.dateFrom === 'string' ? query.dateFrom : (typeof query.from === 'string' ? query.from : null),
  ) ?? parseYmdDate(defaults?.dateFrom ?? null);
  const dateTo = parseYmdDate(
    typeof query.dateTo === 'string' ? query.dateTo : (typeof query.to === 'string' ? query.to : null),
  ) ?? parseYmdDate(defaults?.dateTo ?? null);

  const search = String(query.search ?? defaults?.search ?? '').trim() || null;

  return {
    page,
    limit,
    status,
    search,
    dateFrom,
    dateTo,
    dateField,
    sortBy,
    sortOrder,
  };
}

export function warehouseDocHistoryFiltersToListQuery(
  filters: WarehouseDocHistoryFilters,
  page: number,
  limit: number,
  status: 'active' | 'deleted' = 'active',
): WarehouseDocHistoryListQuery {
  return {
    page,
    limit,
    status,
    search: filters.search.trim() || null,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    dateField: filters.dateField,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };
}

export function appendWarehouseDocHistoryQueryToUrl(
  url: URL,
  query: WarehouseDocHistoryListQuery,
  extra?: Record<string, string>,
): void {
  if (query.page) url.searchParams.set('page', String(query.page));
  if (query.limit) url.searchParams.set('limit', String(query.limit));
  if (query.status) url.searchParams.set('status', query.status);
  if (query.sortBy) url.searchParams.set('sortBy', query.sortBy);
  if (query.sortOrder) url.searchParams.set('sortOrder', query.sortOrder);
  if (query.dateField) url.searchParams.set('dateField', query.dateField);
  if (query.search) url.searchParams.set('search', query.search);
  if (query.dateFrom) url.searchParams.set('dateFrom', query.dateFrom);
  if (query.dateTo) url.searchParams.set('dateTo', query.dateTo);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      url.searchParams.set(key, value);
    }
  }
}

export function hasActiveWarehouseDocHistoryFilters(filters: WarehouseDocHistoryFilters): boolean {
  return Boolean(
    filters.search.trim()
    || filters.dateFrom
    || filters.dateTo,
  );
}

function normalizeSearch(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Client-side / in-memory search over mapped history rows. */
export function warehouseDocHistoryRowMatchesSearch(
  row: {
    id?: number | string | null;
    internalDocNumber?: string | null;
    docNumber?: string | null;
    dilovodDocId?: string | null;
    writeOffNumber?: string | null;
    surplusNumber?: string | null;
    returnNumber?: string | null;
    orderNumber?: string | null;
    comment?: string | null;
    items?: unknown;
  },
  searchRaw: string | null | undefined,
): boolean {
  const search = normalizeSearch(searchRaw);
  if (!search) return true;

  const candidates = [
    row.internalDocNumber,
    row.docNumber,
    row.dilovodDocId,
    row.writeOffNumber,
    row.surplusNumber,
    row.returnNumber,
    row.orderNumber,
    row.comment,
  ];
  if (candidates.some((value) => String(value ?? '').toLowerCase().includes(search))) {
    return true;
  }

  const searchDigits = search.replace(/\D/g, '');
  if (searchDigits && String(row.id ?? '').includes(searchDigits)) {
    return true;
  }

  try {
    const itemsBlob = JSON.stringify(row.items ?? '').toLowerCase();
    if (itemsBlob.includes(search)) return true;
  } catch {
    // ignore
  }

  return false;
}

export type WarehouseDocHistoryDateColumn = 'operDate' | 'createdAt';

export function buildPrismaDateRangeFilter(
  dateField: WarehouseDocHistoryDateField,
  operDateColumn: string,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): Record<string, { gte?: Date; lte?: Date }> | null {
  const from = parseYmdDate(dateFrom ?? null);
  const to = parseYmdDate(dateTo ?? null);
  if (!from && !to) return null;

  const column = dateField === 'createdAt' ? 'createdAt' : operDateColumn;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const bounds = kyivDayBounds(from);
    if (bounds) range.gte = bounds.start;
  }
  if (to) {
    const bounds = kyivDayBounds(to);
    if (bounds) range.lte = bounds.end;
  }
  if (!range.gte && !range.lte) return null;
  return { [column]: range };
}

export function buildPrismaSearchOr<T extends Record<string, unknown>>(
  search: string | null | undefined,
  fields: Array<keyof T | string>,
  itemsColumn = 'items',
): T[] | null {
  const term = String(search ?? '').trim();
  if (!term) return null;
  const clauses: T[] = [];
  for (const field of fields) {
    clauses.push({ [field]: { contains: term } } as T);
  }
  clauses.push({ [itemsColumn]: { contains: term } } as T);
  const digits = term.replace(/\D/g, '');
  if (digits && /^\d+$/.test(digits)) {
    const numeric = Number(digits);
    if (Number.isFinite(numeric)) {
      clauses.push({ id: numeric } as T);
    }
  }
  return clauses;
}
