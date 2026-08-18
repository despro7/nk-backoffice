/**
 * Агрегація клієнтів з таблиці orders для LAL-аудиторій (Meta/Google Ads).
 */

import * as XLSX from 'xlsx';
import { prisma, logServer } from '../lib/utils.js';
import { normalizePhoneNumber } from '../../shared/utils/phoneNormalizer.js';
import {
  B2B_MIN_PORTIONS_IN_ORDER,
  LAL_CHURN_DAYS,
  LAL_DEFAULT_EXPORT_COLUMNS,
  LAL_DEFAULT_PAGE_SIZE,
  LAL_DEFAULT_PERIOD,
  LAL_DEFAULT_SORT_COLUMN,
  LAL_DEFAULT_SORT_DIRECTION,
  LAL_DEFAULT_STATUSES,
  LAL_EXCLUDED_STATUS,
  LAL_EXPORT_COLUMN_OPTIONS,
  LAL_LOYAL_MIN_ORDER_COUNT,
  LAL_LTV_UNBOUNDED,
  LAL_NEW_BUYER_DAYS,
  LAL_ORDER_COUNT_UNBOUNDED,
  LAL_PAGE_SIZE_OPTIONS,
  LAL_SORT_COLUMNS,
  LAL_VIP_LTV_MIN,
  MILITARY_DISCOUNT_REASON_IDS,
  type LalAudienceFilters,
  type LalAudienceListResponse,
  type LalAudienceQuality,
  type LalAudienceRow,
  type LalExportColumn,
  type LalExportFormat,
  type LalLogicMode,
  type LalPeriodKey,
  type LalPresetId,
  type LalSortColumn,
  type LalSortDirection,
} from '../../shared/types/lalAudiences.js';

const EXPORT_COLUMN_KEYS = new Set(LAL_EXPORT_COLUMN_OPTIONS.map((option) => option.key));

const MILITARY_SET = new Set(MILITARY_DISCOUNT_REASON_IDS.map(String));
const RAW_DATA_BATCH = 400; // 400 замовлень в одному запиті
const AUDIENCE_CACHE_TTL_MS = 60_000 * 10; // 10 хвилин
const AUDIENCE_CACHE_MAX_ENTRIES = 20; // 20 аудиторій в кеші

type OrderContact = { rawData: string; customerName: string | null; cityName: string | null };

type CollectedAudience = {
  customers: AggregatedCustomer[];
  contacts: Map<number, OrderContact>;
};

type AudienceCacheEntry = {
  expiresAt: number;
  value: CollectedAudience;
};

function audienceCacheKey(filters: LalAudienceFilters): string {
  const statuses = [...filters.statuses].sort();
  return JSON.stringify({
    period: filters.period,
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null,
    logic: filters.logic,
    statuses,
    preset: filters.preset ?? null,
    orderCountMin: filters.orderCountMin ?? 0,
    orderCountMax: filters.orderCountMax ?? null,
    ltvMin: filters.ltvMin ?? 0,
    ltvMax: filters.ltvMax ?? null,
  });
}

type OrderLite = {
  id: number;
  customerPhone: string | null;
  customerName: string | null;
  cityName: string | null;
  orderDate: Date | null;
  totalPrice: number | null;
  quantity: number;
  pricinaZnizki: string | null;
};

type AggregatedCustomer = {
  phoneKey: string;
  e164: string;
  orderCount: number;
  ltv: number;
  lastOrderDate: Date;
  maxPortionsInOrder: number;
  hasMilitaryDiscount: boolean;
  latestOrderId: number;
  city: string;
  customerName: string;
  ordersInPeriod: number;
  ordersOutsidePeriod: number;
};

export type LalExportResult = {
  buffer: Buffer;
  filename: string;
  mime: string;
};

function isLalPeriodKey(value: string): value is LalPeriodKey {
  return value === '1m' || value === '3m' || value === '6m' || value === 'all' || value === 'custom';
}

function isLalLogicMode(value: string): value is LalLogicMode {
  return value === 'lifetime' || value === 'strict';
}

function isLalPresetId(value: string): value is LalPresetId {
  return (
    value === 'loyal' ||
    value === 'vip' ||
    value === 'new' ||
    value === 'churn' ||
    value === 'military' ||
    value === 'b2b'
  );
}

function isExportablePhone(normalized: string): boolean {
  if (/^380\d{9}$/.test(normalized)) return true;
  return /^\d{10,15}$/.test(normalized) && !normalized.startsWith('0');
}

function toE164(normalized: string): string {
  return `+${normalized}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function parseIsoDate(value: string | undefined, end: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return end ? endOfDay(date) : startOfDay(date);
}

function resolveDateRange(filters: LalAudienceFilters): { from: Date | null; to: Date | null } {
  const now = new Date();
  const to = endOfDay(now);

  if (filters.period === 'all') {
    return { from: null, to: null };
  }

  if (filters.period === 'custom') {
    return {
      from: parseIsoDate(filters.startDate, false),
      to: parseIsoDate(filters.endDate, true) ?? to,
    };
  }

  const from = startOfDay(now);
  const months = filters.period === '1m' ? 1 : filters.period === '6m' ? 6 : 3;
  from.setMonth(from.getMonth() - months);
  return { from, to };
}

function inRange(date: Date | null, from: Date | null, to: Date | null): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function isMilitaryReason(code: string | null): boolean {
  if (!code) return false;
  return MILITARY_SET.has(String(code).trim());
}

function isUnboundedOrderCountMax(value: number | null | undefined): boolean {
  return value == null || value >= LAL_ORDER_COUNT_UNBOUNDED;
}

function isUnboundedLtvMax(value: number | null | undefined): boolean {
  return value == null || value >= LAL_LTV_UNBOUNDED;
}

function applyPreset(customer: AggregatedCustomer, preset: LalPresetId | null | undefined, now: Date): boolean {
  if (!preset) return true;
  switch (preset) {
    case 'loyal':
      return customer.orderCount >= LAL_LOYAL_MIN_ORDER_COUNT;
    case 'vip':
      return customer.ltv > LAL_VIP_LTV_MIN;
    case 'new': {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - LAL_NEW_BUYER_DAYS);
      return customer.orderCount === 1 && customer.lastOrderDate >= cutoff;
    }
    case 'churn': {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - LAL_CHURN_DAYS);
      return customer.lastOrderDate < cutoff;
    }
    case 'military':
      return customer.hasMilitaryDiscount;
    case 'b2b':
      return customer.ltv > LAL_VIP_LTV_MIN && customer.maxPortionsInOrder >= B2B_MIN_PORTIONS_IN_ORDER;
    default:
      return true;
  }
}

type ContactInfo = {
  email: string | null;
  firstName: string;
  lastName: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickEmail(value: unknown): string | null {
  if (typeof value === 'string' && value.includes('@')) {
    return value.trim().toLowerCase();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickEmail(item);
      if (found) return found;
    }
  }
  const obj = asRecord(value);
  if (obj?.email) return pickEmail(obj.email);
  return null;
}

function parseRawData(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function extractContact(rawData: string | null | undefined, fallbackName: string): ContactInfo {
  const raw = parseRawData(rawData);
  const primary = asRecord(raw?.primaryContact);
  const contacts = Array.isArray(raw?.contacts) ? raw.contacts : null;
  const firstContact = contacts ? asRecord(contacts[0]) : null;

  const email =
    pickEmail(primary?.email) ||
    pickEmail(firstContact?.email) ||
    pickEmail(raw?.email) ||
    pickEmail(raw?.contactEmail) ||
    null;

  const lastFromContact = String(primary?.lName || firstContact?.lName || '').trim();
  const firstFromContact = String(primary?.fName || firstContact?.fName || '').trim();

  if (lastFromContact || firstFromContact) {
    return { email, firstName: firstFromContact, lastName: lastFromContact };
  }

  const parts = fallbackName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { email, firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { email, firstName: parts[0], lastName: '' };
  }
  return { email, firstName: parts[1] ?? '', lastName: parts[0] ?? '' };
}

function qualityFromPercents(phonePercent: number, emailPercent: number): LalAudienceQuality {
  if (phonePercent >= 100 && emailPercent >= 70) return 'high';
  if (emailPercent >= 40) return 'medium';
  return 'low';
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function isLalExportColumn(value: string): value is LalExportColumn {
  return EXPORT_COLUMN_KEYS.has(value as LalExportColumn);
}

export function sanitizeExportColumns(raw: unknown): LalExportColumn[] {
  const source = Array.isArray(raw) ? raw.map(String) : [];
  const unique: LalExportColumn[] = [];
  for (const key of source) {
    if (!isLalExportColumn(key) || unique.includes(key)) continue;
    unique.push(key);
  }
  return unique.length > 0 ? unique : [...LAL_DEFAULT_EXPORT_COLUMNS];
}

function exportCellValue(row: LalAudienceRow, column: LalExportColumn): string | number {
  switch (column) {
    case 'phone':
      return row.phone;
    case 'email':
      return row.email ?? '';
    case 'firstName':
      return row.firstName;
    case 'lastName':
      return row.lastName;
    case 'city':
      return row.city;
    case 'country':
      return row.country;
    case 'orderCount':
      return row.orderCount;
    case 'ltv':
      return row.ltv;
    case 'lastOrderDate':
      return row.lastOrderDate.slice(0, 10);
  }
}

function exportHeaders(columns: LalExportColumn[]): string[] {
  return columns.map((key) => LAL_EXPORT_COLUMN_OPTIONS.find((option) => option.key === key)?.header ?? key);
}

function buildCsv(rows: LalAudienceRow[], columns: LalExportColumn[]): Buffer {
  const header = exportHeaders(columns);
  const lines = [
    header.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(String(exportCellValue(row, column)))).join(',')),
  ];
  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
}

function buildXlsx(rows: LalAudienceRow[], columns: LalExportColumn[]): Buffer {
  const aoa = [
    exportHeaders(columns),
    ...rows.map((row) => columns.map((column) => exportCellValue(row, column))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'LAL Audiences');
  const out = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(out);
}

function clampPageSize(limit: number | undefined): number {
  const value = limit ?? LAL_DEFAULT_PAGE_SIZE;
  if ((LAL_PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) return value;
  return LAL_DEFAULT_PAGE_SIZE;
}

function isLalSortColumn(value: string): value is LalSortColumn {
  return (LAL_SORT_COLUMNS as readonly string[]).includes(value);
}

function isLalSortDirection(value: string): value is LalSortDirection {
  return value === 'asc' || value === 'desc';
}

function compareLocale(a: string, b: string): number {
  return a.localeCompare(b, 'uk', { numeric: true, sensitivity: 'base' });
}

function sortCollectedCustomers(
  customers: AggregatedCustomer[],
  contacts: Map<number, OrderContact>,
  sortBy: LalSortColumn | undefined,
  sortDir: LalSortDirection | undefined
): AggregatedCustomer[] {
  const column = sortBy && isLalSortColumn(sortBy) ? sortBy : LAL_DEFAULT_SORT_COLUMN;
  const direction = sortDir && isLalSortDirection(sortDir) ? sortDir : LAL_DEFAULT_SORT_DIRECTION;
  const dir = direction === 'asc' ? 1 : -1;

  const decorated = customers.map((customer) => {
    const latest = contacts.get(customer.latestOrderId);
    const contact = extractContact(latest?.rawData ?? null, latest?.customerName || customer.customerName);
    return {
      customer,
      name: `${contact.lastName} ${contact.firstName}`.trim(),
      email: contact.email ?? '',
      city: (latest?.cityName || customer.city).trim(),
    };
  });

  decorated.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'name':
        cmp = compareLocale(a.name, b.name);
        break;
      case 'phone':
        cmp = compareLocale(a.customer.e164, b.customer.e164);
        break;
      case 'email':
        cmp = compareLocale(a.email, b.email);
        break;
      case 'city':
        cmp = compareLocale(a.city, b.city);
        break;
      case 'orders':
        cmp = a.customer.orderCount - b.customer.orderCount;
        break;
      case 'ltv':
        cmp = a.customer.ltv - b.customer.ltv;
        break;
      case 'lastOrder':
        cmp = a.customer.lastOrderDate.getTime() - b.customer.lastOrderDate.getTime();
        break;
    }
    if (cmp === 0) {
      return b.customer.ltv - a.customer.ltv || b.customer.orderCount - a.customer.orderCount;
    }
    return cmp * dir;
  });

  return decorated.map((item) => item.customer);
}

export function parseLalAudienceFilters(
  source: Record<string, unknown>,
  defaults?: { requireFormat?: boolean }
): LalAudienceFilters & { format?: LalExportFormat; excludePhones?: string[]; columns?: LalExportColumn[] } {
  const periodRaw = String(source.period ?? LAL_DEFAULT_PERIOD);
  const period: LalPeriodKey = isLalPeriodKey(periodRaw) ? periodRaw : LAL_DEFAULT_PERIOD;

  const logicRaw = String(source.logic ?? 'lifetime');
  const logic: LalLogicMode = isLalLogicMode(logicRaw) ? logicRaw : 'lifetime';

  let statuses: string[] = [];
  if (Array.isArray(source.statuses)) {
    statuses = source.statuses.map(String);
  } else if (typeof source.statuses === 'string' && source.statuses.trim()) {
    statuses = source.statuses.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (statuses.length === 0) {
    statuses = [...LAL_DEFAULT_STATUSES];
  }
  statuses = statuses.filter((s) => s !== LAL_EXCLUDED_STATUS);

  const presetRaw = source.preset == null || source.preset === '' ? null : String(source.preset);
  const preset = presetRaw && isLalPresetId(presetRaw) ? presetRaw : null;

  const parseNum = (value: unknown): number | undefined => {
    if (value == null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const formatRaw = source.format == null ? undefined : String(source.format);
  const format: LalExportFormat | undefined =
    formatRaw === 'csv' || formatRaw === 'xlsx' ? formatRaw : defaults?.requireFormat ? 'csv' : undefined;

  let excludePhones: string[] | undefined;
  if (Array.isArray(source.excludePhones)) {
    excludePhones = source.excludePhones.map(String);
  }

  const columns = sanitizeExportColumns(source.columns);

  const sortByRaw = source.sortBy == null ? '' : String(source.sortBy);
  const sortDirRaw = source.sortDir == null ? '' : String(source.sortDir);

  return {
    period,
    startDate: typeof source.startDate === 'string' ? source.startDate : undefined,
    endDate: typeof source.endDate === 'string' ? source.endDate : undefined,
    orderCountMin: parseNum(source.orderCountMin),
    orderCountMax: parseNum(source.orderCountMax) ?? null,
    ltvMin: parseNum(source.ltvMin),
    ltvMax: parseNum(source.ltvMax) ?? null,
    logic,
    statuses,
    preset,
    page: parseNum(source.page),
    limit: parseNum(source.limit),
    sortBy: sortByRaw && isLalSortColumn(sortByRaw) ? sortByRaw : LAL_DEFAULT_SORT_COLUMN,
    sortDir: sortDirRaw && isLalSortDirection(sortDirRaw) ? sortDirRaw : LAL_DEFAULT_SORT_DIRECTION,
    format,
    excludePhones,
    columns,
  };
}

export class LalAudiencesService {
  private audienceCache = new Map<string, AudienceCacheEntry>();
  private audienceInflight = new Map<string, Promise<CollectedAudience>>();

  async list(filters: LalAudienceFilters): Promise<LalAudienceListResponse> {
    const { customers, contacts } = await this.getCollectedAudience(filters);
    const sorted = sortCollectedCustomers(customers, contacts, filters.sortBy, filters.sortDir);
    const page = Math.max(1, filters.page ?? 1);
    const limit = clampPageSize(filters.limit);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const slice = sorted.slice(start, start + limit);
    const rows = slice.map((customer) => this.toRow(customer, contacts.get(customer.latestOrderId)));

    const withEmail = customers.filter((c) => {
      const contact = contacts.get(c.latestOrderId);
      return Boolean(extractContact(contact?.rawData ?? null, c.customerName).email);
    }).length;

    const emailPercent = total === 0 ? 0 : Math.round((withEmail / total) * 1000) / 10;
    const phonePercent = total === 0 ? 0 : 100;
    const totalOrdersInSelection = customers.reduce((sum, c) => sum + c.orderCount, 0);

    return {
      success: true,
      rows,
      summary: {
        customers: total,
        phonePercent,
        emailPercent,
        quality: qualityFromPercents(phonePercent, emailPercent),
        totalOrdersInSelection,
      },
      pagination: { page, limit, total, totalPages },
    };
  }

  async export(
    filters: LalAudienceFilters,
    format: LalExportFormat,
    excludePhones: string[] = [],
    columns: LalExportColumn[] = LAL_DEFAULT_EXPORT_COLUMNS
  ): Promise<LalExportResult> {
    const { customers, contacts } = await this.getCollectedAudience(filters);
    const sorted = sortCollectedCustomers(customers, contacts, filters.sortBy, filters.sortDir);
    const excluded = new Set(
      excludePhones
        .map((phone) => {
          const normalized = normalizePhoneNumber(phone);
          return isExportablePhone(normalized) ? toE164(normalized) : phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
        })
        .filter(Boolean)
    );

    const rows = sorted
      .filter((c) => !excluded.has(c.e164))
      .map((customer) => this.toRow(customer, contacts.get(customer.latestOrderId)));

    const stamp = new Date().toISOString().slice(0, 10);
    const exportColumns = sanitizeExportColumns(columns);
    if (format === 'xlsx') {
      return {
        buffer: buildXlsx(rows, exportColumns),
        filename: `lal-audiences-${stamp}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    return {
      buffer: buildCsv(rows, exportColumns),
      filename: `lal-audiences-${stamp}.csv`,
      mime: 'text/csv; charset=utf-8',
    };
  }

  private toRow(
    customer: AggregatedCustomer,
    latest?: { rawData: string; customerName: string | null; cityName: string | null }
  ): LalAudienceRow {
    const contact = extractContact(latest?.rawData ?? null, latest?.customerName || customer.customerName);
    return {
      phone: customer.e164,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      city: (latest?.cityName || customer.city).trim(),
      country: 'UA',
      orderCount: customer.orderCount,
      ltv: Math.round(customer.ltv * 100) / 100,
      lastOrderDate: customer.lastOrderDate.toISOString(),
      maxPortionsInOrder: customer.maxPortionsInOrder,
      hasMilitaryDiscount: customer.hasMilitaryDiscount,
    };
  }

  private async getCollectedAudience(filters: LalAudienceFilters): Promise<CollectedAudience> {
    const key = audienceCacheKey(filters);
    const now = Date.now();
    const cached = this.audienceCache.get(key);
    if (cached && cached.expiresAt > now) {
      this.audienceCache.delete(key);
      this.audienceCache.set(key, cached);
      logServer('[LalAudiences] cache hit', { customers: cached.value.customers.length });
      return cached.value;
    }

    const inflight = this.audienceInflight.get(key);
    if (inflight) {
      return inflight;
    }

    const pending = this.collectAudience(filters)
      .then((value) => {
        this.setAudienceCache(key, value);
        return value;
      })
      .finally(() => {
        this.audienceInflight.delete(key);
      });

    this.audienceInflight.set(key, pending);
    return pending;
  }

  private setAudienceCache(key: string, value: CollectedAudience): void {
    while (this.audienceCache.size >= AUDIENCE_CACHE_MAX_ENTRIES) {
      const oldest = this.audienceCache.keys().next().value;
      if (oldest == null) break;
      this.audienceCache.delete(oldest);
    }
    this.audienceCache.set(key, {
      expiresAt: Date.now() + AUDIENCE_CACHE_TTL_MS,
      value,
    });
  }

  private async collectAudience(filters: LalAudienceFilters): Promise<CollectedAudience> {
    const statuses =
      filters.statuses.length > 0 ? filters.statuses.filter((s) => s !== LAL_EXCLUDED_STATUS) : [...LAL_DEFAULT_STATUSES];

    const { from, to } = resolveDateRange(filters);
    const now = new Date();

    const orders: OrderLite[] = await prisma.order.findMany({
      where: {
        status: { in: statuses },
        AND: [{ customerPhone: { not: null } }, { NOT: { customerPhone: '' } }],
      },
      select: {
        id: true,
        customerPhone: true,
        customerName: true,
        cityName: true,
        orderDate: true,
        totalPrice: true,
        quantity: true,
        pricinaZnizki: true,
      },
    });

    const grouped = new Map<string, AggregatedCustomer>();

    for (const order of orders) {
      const normalized = normalizePhoneNumber(order.customerPhone || '');
      if (!isExportablePhone(normalized)) continue;

      const inPeriod = from == null && to == null ? Boolean(order.orderDate) : inRange(order.orderDate, from, to);
      let customer = grouped.get(normalized);
      if (!customer) {
        customer = {
          phoneKey: normalized,
          e164: toE164(normalized),
          orderCount: 0,
          ltv: 0,
          lastOrderDate: order.orderDate ?? new Date(0),
          maxPortionsInOrder: 0,
          hasMilitaryDiscount: false,
          latestOrderId: order.id,
          city: order.cityName || '',
          customerName: order.customerName || '',
          ordersInPeriod: 0,
          ordersOutsidePeriod: 0,
        };
        grouped.set(normalized, customer);
      }

      customer.orderCount += 1;
      customer.ltv += Number(order.totalPrice) || 0;
      customer.maxPortionsInOrder = Math.max(customer.maxPortionsInOrder, order.quantity || 0);
      if (isMilitaryReason(order.pricinaZnizki)) {
        customer.hasMilitaryDiscount = true;
      }
      if (inPeriod) customer.ordersInPeriod += 1;
      else customer.ordersOutsidePeriod += 1;

      const orderDate = order.orderDate ?? new Date(0);
      if (orderDate >= customer.lastOrderDate) {
        customer.lastOrderDate = orderDate;
        customer.latestOrderId = order.id;
        customer.city = order.cityName || customer.city;
        customer.customerName = order.customerName || customer.customerName;
      }
    }

    const filtered: AggregatedCustomer[] = [];
    for (const customer of grouped.values()) {
      if (filters.logic === 'strict') {
        if (from != null || to != null) {
          if (customer.ordersOutsidePeriod > 0 || customer.ordersInPeriod === 0) continue;
        }
      } else if (from != null || to != null) {
        if (!inRange(customer.lastOrderDate, from, to)) continue;
      }

      if (!applyPreset(customer, filters.preset, now)) continue;

      const minCount = filters.orderCountMin ?? 0;
      if (customer.orderCount < minCount) continue;
      if (!isUnboundedOrderCountMax(filters.orderCountMax) && customer.orderCount > (filters.orderCountMax as number)) {
        continue;
      }

      const minLtv = filters.ltvMin ?? 0;
      if (customer.ltv < minLtv) continue;
      if (!isUnboundedLtvMax(filters.ltvMax) && customer.ltv > (filters.ltvMax as number)) {
        continue;
      }

      filtered.push(customer);
    }

    filtered.sort((a, b) => b.ltv - a.ltv || b.orderCount - a.orderCount);

    const latestIds = filtered.map((c) => c.latestOrderId);
    const contacts = await this.loadContacts(latestIds);

    logServer('[LalAudiences] aggregated', {
      orders: orders.length,
      grouped: grouped.size,
      matched: filtered.length,
      logic: filters.logic,
      period: filters.period,
      preset: filters.preset ?? null,
    });

    return { customers: filtered, contacts };
  }

  private async loadContacts(orderIds: number[]): Promise<Map<number, OrderContact>> {
    const map = new Map<number, OrderContact>();
    for (let i = 0; i < orderIds.length; i += RAW_DATA_BATCH) {
      const chunk = orderIds.slice(i, i + RAW_DATA_BATCH);
      const rows = await prisma.order.findMany({
        where: { id: { in: chunk } },
        select: { id: true, rawData: true, customerName: true, cityName: true },
      });
      for (const row of rows) {
        map.set(row.id, {
          rawData: row.rawData,
          customerName: row.customerName,
          cityName: row.cityName,
        });
      }
    }
    return map;
  }
}

export const lalAudiencesService = new LalAudiencesService();
