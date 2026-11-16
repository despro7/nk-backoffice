/**
 * Invoices module (admin only): types shared by server and client.
 * Everything lives in settings_base (JSON), see server/modules/Invoices.
 */

/** Calendar date `YYYY-MM-DD`. */
export type IsoDate = string;

/** SalesDrive order status codes with names (same as server/services/salesdrive/statusMapper). */
export const INVOICE_ORDER_STATUS_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: '1', label: 'Новий' },
  { code: '2', label: 'Підтверджено' },
  { code: '3', label: 'На відправку' },
  { code: '4', label: 'Відправлено' },
  { code: '5', label: 'Продаж' },
  { code: '6', label: 'Відмова' },
  { code: '7', label: 'Повернення' },
  { code: '8', label: 'Видалений' },
  { code: '9', label: 'На утриманні' },
];

export interface InvoicePayee {
  fullName: string;
  taxId: string;
  address: string;
  phone: string;
  bank: string;
  iban: string;
  /** Short name for the signature line, e.g. `Дзіова Г.Г.` */
  signatureName: string;
}

export interface HourlyRateStep {
  /** Effective from this date (inclusive). */
  from: IsoDate;
  usd: number;
}

export interface InvoiceSettings {
  payee: InvoicePayee;
  serviceName: string;
  paymentPurpose: string;
  /** Default tariff UAH per portion for new invoices (each invoice stores its own). */
  defaultTariff: number;
  /** Round the total to whole hryvnias (as in the old invoices). */
  roundToHryvnia: boolean;
  taxNote: string;
  paymentTerms: string;
  /** Order statuses counted as sold portions (SalesDrive codes); same as the sales report default (1-5). */
  countedStatuses: string[];
  hourlyRates: HourlyRateStep[];
  /** Next invoice number when the archive is empty or lower. */
  nextNumberFloor: number;
}

export interface InvoicePayer {
  id: number;
  /** `ФОП Бубнова Аліна Сергіївна` */
  name: string;
  /** ІПН / код ЄДРПОУ */
  taxId: string;
  address: string;
  lastUsedAt?: string;
}

export interface InvoiceLine {
  title: string;
  quantity: number;
  unit: string;
  price: number;
  amount: number;
  /** Line computed from sold portions (the main one). */
  kind: 'portions' | 'custom';
}

/** Snapshot of the numbers at the moment of invoicing. */
export interface InvoiceSnapshot {
  portions: number;
  tariff: number;
  /** portions × tariff (rounded as configured), before the internal adjustment. */
  grossUah: number;
  adjustmentUah: number;
  totalUah: number;
  takenAt: string;
}

export interface InvoiceRecord {
  id: number;
  number: number;
  /** `NNN/1` style act number is derived: `${number}/1`. */
  date: IsoDate;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  payerId: number;
  payer: Pick<InvoicePayer, 'name' | 'taxId' | 'address'>;
  paymentPurpose: string;
  lines: InvoiceLine[];
  /** Internal only, never printed: deduction/addition vs the portions sum (e.g. goods taken in lieu of pay). */
  adjustmentUah: number;
  adjustmentNote: string;
  totalUah: number;
  snapshot: InvoiceSnapshot;
  /** Payee details at the time of issue (so old PDFs stay identical after settings change). */
  payee: InvoicePayee;
  taxNote: string;
  paymentTerms: string;
  createdAt: string;
  /** Imported from the old archive, without a rendered snapshot of lines. */
  imported?: boolean;
}

export type RateSource = 'nbu' | 'manual' | 'imported';

/** Half-month period of the time-tracking dashboard. */
export interface TrackingPeriod {
  id: number;
  start: IsoDate;
  end: IsoDate;
  /** Worked minutes, null = not entered yet. */
  factMinutes: number | null;
  /** UAH per portion for this period (null = default at the moment of reading). */
  tariff: number | null;
  usdRate: number | null;
  rateSource: RateSource | null;
  adjustmentUah: number;
  adjustmentNote: string;
  invoiceId: number | null;
  /** Fixed numbers at invoicing time (history mode). */
  snapshot: InvoiceSnapshot | null;
}

export type DashboardMode = 'live' | 'history';

export interface DashboardRow {
  periodId: number;
  start: IsoDate;
  end: IsoDate;
  days: number;
  factMinutes: number | null;
  portions: number | null;
  /** Where the portions come from: the fixed snapshot (invoice/import) or the current orders. */
  portionsSource: 'snapshot' | 'live' | null;
  tariff: number;
  grossUah: number;
  adjustmentUah: number;
  adjustmentNote: string;
  amountUah: number;
  usdRate: number | null;
  rateSource: RateSource | null;
  amountUsd: number;
  hourlyRate: number;
  costUsd: number;
  paidMinutes: number;
  accumulatedMinutes: number;
  overdraftMinutes: number;
  /** amountUsd - costUsd (positive: paid more than the hours cost). */
  deltaUsd: number;
  invoiceNumber: number | null;
  /** live portions minus snapshot portions (for the diff in time). */
  portionsDrift: number | null;
}

export interface DashboardMonthRow {
  month: string;
  portions: number;
  /** Days covered by the periods of the month (the period in progress counts up to today). */
  days: number;
  /** amountUah / days */
  amountPerDay: number;
  /** amountUsd / days */
  amountUsdPerDay: number;
  /** Cost of the worked hours in UAH (costUsd of each period × its USD rate). */
  costUah: number;
  amountUah: number;
  amountUsd: number;
  costUsd: number;
  /** vs previous month, fraction (0.1 = +10%). */
  amountChange: number | null;
}

export interface DashboardKpi {
  overdraftMinutes: number;
  overdraftUsd: number;
  yearAmountUah: number;
  yearAmountUsd: number;
  yearCostUsd: number;
  /** Average invoice of the last 12 complete half-month periods (6 months). */
  avgAmountUah: number;
  /**
   * Average invoice of the last 12 complete periods vs the 12 before them
   * (fraction, 0.1 = +10%); null when there is nothing to compare with.
   */
  avgAmountChange: number | null;
}

export interface DashboardData {
  mode: DashboardMode;
  rows: DashboardRow[];
  months: DashboardMonthRow[];
  kpi: DashboardKpi;
  generatedAt: string;
}

export interface InvoicePreviewInput {
  periodStart?: IsoDate;
  periodEnd?: IsoDate;
  tariff?: number;
}

export interface InvoicePreview {
  number: number;
  date: IsoDate;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  portions: number;
  tariff: number;
  grossUah: number;
  /** Reporting day start hour used for the count (the sales report setting). */
  dayStartHour: number;
  /** Portions per reporting day, for the transparency of the number. */
  byDay: Array<{ date: IsoDate; portions: number }>;
}

export interface InvoiceCreateInput {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  date?: IsoDate;
  payer: { id?: number; name: string; taxId: string; address: string };
  paymentPurpose: string;
  tariff: number;
  serviceTitle?: string;
  /** Extra free-form lines (positive sums only: they are printed). */
  customLines?: Array<{ title: string; quantity: number; unit: string; price: number }>;
  /** Internal, not printed. */
  adjustmentUah?: number;
  adjustmentNote?: string;
}
