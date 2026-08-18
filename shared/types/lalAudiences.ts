/** Фільтри, рядки та summary модуля LAL Аудиторії */

export type LalPeriodKey = '1m' | '3m' | '6m' | 'all' | 'custom';

/** «За весь період» vs «Суворий режим» */
export type LalLogicMode = 'lifetime' | 'strict';

export type LalPresetId = 'loyal' | 'vip' | 'new' | 'churn' | 'military' | 'b2b';

export type LalExportFormat = 'csv' | 'xlsx';

export type LalExportColumn =
  | 'phone'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'city'
  | 'country'
  | 'orderCount'
  | 'ltv'
  | 'lastOrderDate';

export const LAL_EXPORT_COLUMN_OPTIONS: ReadonlyArray<{
  key: LalExportColumn;
  header: string;
  label: string;
}> = [
  { key: 'phone', header: 'Phone', label: 'Телефон' },
  { key: 'email', header: 'Email', label: 'Email' },
  { key: 'firstName', header: 'First Name', label: 'Імʼя' },
  { key: 'lastName', header: 'Last Name', label: 'Прізвище' },
  { key: 'city', header: 'City', label: 'Місто' },
  { key: 'country', header: 'Country', label: 'Країна' },
  { key: 'orderCount', header: 'Orders', label: 'Замовлень' },
  { key: 'ltv', header: 'LTV', label: 'LTV' },
  { key: 'lastOrderDate', header: 'Last Order', label: 'Останнє замовлення' },
];

export const LAL_DEFAULT_EXPORT_COLUMNS: LalExportColumn[] = [
  'phone',
  'email',
  'firstName',
  'lastName',
  'city',
  'country',
];

export type LalAudienceQuality = 'high' | 'medium' | 'low';

export const LAL_DEFAULT_STATUSES = ['1', '2', '5'] as const;

/** Статус SalesDrive «Видалений» — ніколи не входить у вибірку */
export const LAL_EXCLUDED_STATUS = '8';

export const LAL_DEFAULT_PERIOD: LalPeriodKey = '1m';
export const LAL_DEFAULT_LOGIC: LalLogicMode = 'lifetime';
export const LAL_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const LAL_DEFAULT_PAGE_SIZE = 25;

export const LAL_SORT_COLUMNS = ['name', 'phone', 'email', 'city', 'orders', 'ltv', 'lastOrder'] as const;
export type LalSortColumn = (typeof LAL_SORT_COLUMNS)[number];
export type LalSortDirection = 'asc' | 'desc';
export const LAL_DEFAULT_SORT_COLUMN: LalSortColumn = 'ltv';
export const LAL_DEFAULT_SORT_DIRECTION: LalSortDirection = 'desc';

/** VIP / B2B: LTV строго більше цього порогу (₴) */
export const LAL_VIP_LTV_MIN = 10_000;

/** Постійні: orderCount > 2 */
export const LAL_LOYAL_MIN_ORDER_COUNT = 3;

export const LAL_NEW_BUYER_DAYS = 30;
export const LAL_CHURN_DAYS = 90;

/** B2B: є замовлення з кількістю порцій не менше цього порогу */
export const B2B_MIN_PORTIONS_IN_ORDER = 100;

/**
 * Правий край слайдера «кількість замовлень» (25+) = без верхньої межі.
 * Якщо клієнт надсилає саме це значення як max — бекенд ігнорує верхню межу.
 */
export const LAL_ORDER_COUNT_UNBOUNDED = 25;

/**
 * Правий край слайдера LTV (100 000+) = без верхньої межі.
 */
export const LAL_LTV_UNBOUNDED = 100_000;

/**
 * Коди SalesDrive `pricinaZnizki` для сегмента «Військові».
 * У звіті продажів (`server/routes/orders.ts`) код `33` мапиться на «Військові/волонтери».
 * DISTINCT з прод-БД не знімали — якщо з’являться інші коди, дописати сюди.
 * Не трактувати всі знижки як військові.
 */
export const MILITARY_DISCOUNT_REASON_IDS: readonly string[] = ['33'];

export interface LalAudienceFilters {
  period: LalPeriodKey;
  /** YYYY-MM-DD, для period=custom */
  startDate?: string;
  endDate?: string;
  orderCountMin?: number;
  /** null / omit / LAL_ORDER_COUNT_UNBOUNDED → без верхньої межі */
  orderCountMax?: number | null;
  ltvMin?: number;
  /** null / omit / LAL_LTV_UNBOUNDED → без верхньої межі */
  ltvMax?: number | null;
  logic: LalLogicMode;
  statuses: string[];
  preset?: LalPresetId | null;
  page?: number;
  limit?: number;
  sortBy?: LalSortColumn;
  sortDir?: LalSortDirection;
}

export interface LalAudienceRow {
  /** E.164 з префіксом `+` */
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  city: string;
  country: 'UA';
  orderCount: number;
  ltv: number;
  lastOrderDate: string;
  maxPortionsInOrder: number;
  hasMilitaryDiscount: boolean;
}

export interface LalAudienceSummary {
  customers: number;
  phonePercent: number;
  emailPercent: number;
  quality: LalAudienceQuality;
  totalOrdersInSelection: number;
}

export interface LalAudiencePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface LalAudienceListResponse {
  success: true;
  rows: LalAudienceRow[];
  summary: LalAudienceSummary;
  pagination: LalAudiencePagination;
}

export interface LalAudienceExportBody extends LalAudienceFilters {
  excludePhones?: string[];
  format: LalExportFormat;
  columns?: LalExportColumn[];
}
