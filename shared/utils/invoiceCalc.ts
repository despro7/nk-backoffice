/**
 * Pure calculations for the invoices module (admin only): used by the server and the client.
 * Mirrors the logic of the old time-tracking spreadsheet:
 *   amountUah   = round(portions × tariff) + internal adjustment
 *   amountUsd   = amountUah / usdRate
 *   paidMinutes = amountUsd / hourlyRate × 60
 *   costUsd     = factMinutes / 60 × hourlyRate
 *   accumulated = previous overdraft + factMinutes
 *   overdraft   = accumulated − paidMinutes
 */

import type {
  DashboardData,
  DashboardMode,
  DashboardMonthRow,
  DashboardRow,
  HourlyRateStep,
  InvoiceSnapshot,
  IsoDate,
  TrackingPeriod,
} from '../types/invoices.js';

// ---------- dates ----------

const pad = (n: number): string => String(n).padStart(2, '0');

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseIsoDate(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month);
}

/** Inclusive number of days between two dates. */
export function daysInclusive(start: IsoDate, end: IsoDate): number {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Billing period for an invoice created on `today`:
 *  day 16 and later  → 1–15 of the same month;
 *  day 1–15          → 16–end of the previous month.
 */
export function defaultInvoicePeriod(today: IsoDate): { start: IsoDate; end: IsoDate } {
  const { year, month, day } = parseIsoDate(today);
  if (day >= 16) return { start: toIsoDate(year, month, 1), end: toIsoDate(year, month, 15) };
  const py = month === 1 ? year - 1 : year;
  const pm = month === 1 ? 12 : month - 1;
  return { start: toIsoDate(py, pm, 16), end: toIsoDate(py, pm, lastDayOfMonth(py, pm)) };
}

/** `2026-11-02` → `02.11.2026` */
export function formatDateUa(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${pad(day)}.${pad(month)}.${year}`;
}

// ---------- time ----------

/** `64:18` → 3858. Returns null for an empty or invalid value. */
export function parseHm(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = /^\s*(\d{1,4}):([0-5]?\d)\s*$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 3858 → `64:18`; negative values get a minus sign. */
export function formatHm(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '–';
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.round(Math.abs(minutes));
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// ---------- money ----------

export function roundMoney(value: number, wholeHryvnias: boolean): number {
  return wholeHryvnias ? Math.round(value) : Math.round(value * 100) / 100;
}

/** portions × tariff, rounded as configured (14513 × 2,5 = 36282,5 → 36283). */
export function portionsAmount(portions: number, tariff: number, wholeHryvnias: boolean): number {
  return roundMoney(portions * tariff, wholeHryvnias);
}

/** `36283` → `36 283,00` (non-breaking spaces). */
export function formatMoneyUa(value: number): string {
  const fixed = (Math.round(value * 100) / 100).toFixed(2);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${frac}`;
}

const APOS = 'ʼ';
const ONES_M = ['', 'один', 'два', 'три', 'чотири', `п${APOS}ять`, 'шість', 'сім', 'вісім', `дев${APOS}ять`];
const ONES_F = ['', 'одна', 'дві', 'три', 'чотири', `п${APOS}ять`, 'шість', 'сім', 'вісім', `дев${APOS}ять`];
const TEENS = [
  'десять',
  'одинадцять',
  'дванадцять',
  'тринадцять',
  'чотирнадцять',
  `п${APOS}ятнадцять`,
  'шістнадцять',
  'сімнадцять',
  'вісімнадцять',
  `дев${APOS}ятнадцять`,
];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', `п${APOS}ятдесят`, 'шістдесят', 'сімдесят', 'вісімдесят', `дев${APOS}яносто`];
const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', `п${APOS}ятсот`, 'шістсот', 'сімсот', 'вісімсот', `дев${APOS}ятсот`];

function pluralIndex(n: number): 0 | 1 | 2 {
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return 2;
  const m10 = n % 10;
  if (m10 === 1) return 0;
  if (m10 >= 2 && m10 <= 4) return 1;
  return 2;
}

function triadWords(n: number, feminine: boolean): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) words.push(HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) {
    words.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) words.push(TENS[t]);
    if (o) words.push((feminine ? ONES_F : ONES_M)[o]);
  }
  return words;
}

/** Whole number in Ukrainian words (0 → `нуль`). */
export function integerToWordsUa(value: number, feminine = false): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'нуль';
  const scales: Array<{ div: number; forms: [string, string, string]; fem: boolean }> = [
    { div: 1_000_000_000, forms: ['мільярд', 'мільярди', 'мільярдів'], fem: false },
    { div: 1_000_000, forms: ['мільйон', 'мільйони', 'мільйонів'], fem: false },
    { div: 1_000, forms: ['тисяча', 'тисячі', 'тисяч'], fem: true },
  ];
  const words: string[] = [];
  let rest = n;
  for (const scale of scales) {
    const part = Math.floor(rest / scale.div) % 1000;
    if (part > 0) {
      words.push(...triadWords(part, scale.fem), scale.forms[pluralIndex(part)]);
    }
    rest %= scale.div;
  }
  if (rest > 0) words.push(...triadWords(rest, feminine));
  return words.join(' ');
}

/**
 * `36283` → `Тридцять шість тисяч двісті вісімдесят три гривні, 00 коп.`
 */
export function amountInWordsUa(amount: number): string {
  const kopTotal = Math.round(Math.abs(amount) * 100);
  const hryvnias = Math.floor(kopTotal / 100);
  const kop = kopTotal % 100;
  const words = integerToWordsUa(hryvnias, true);
  const unit = ['гривня', 'гривні', 'гривень'][pluralIndex(hryvnias)];
  const text = `${words} ${unit}, ${pad(kop)} коп.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------- hourly rate history ----------

/** Hourly rate (USD) effective on `date`; falls back to the earliest step. */
export function hourlyRateFor(date: IsoDate, steps: HourlyRateStep[]): number {
  if (steps.length === 0) return 0;
  const sorted = [...steps].sort((a, b) => a.from.localeCompare(b.from));
  let rate = sorted[0].usd;
  for (const step of sorted) {
    if (step.from <= date) rate = step.usd;
  }
  return rate;
}

// ---------- dashboard ----------

export interface DashboardInput {
  periods: TrackingPeriod[];
  mode: DashboardMode;
  /** Live portions by period id (current state of orders); may miss some periods. */
  livePortions: Map<number, number>;
  invoiceNumbers: Map<number, number>;
  defaultTariff: number;
  roundToHryvnia: boolean;
  hourlyRates: HourlyRateStep[];
  generatedAt: string;
}

function snapshotPortions(snapshot: InvoiceSnapshot | null): number | null {
  return snapshot ? snapshot.portions : null;
}

export function buildDashboard(input: DashboardInput): DashboardData {
  const sorted = [...input.periods].sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
  const rows: DashboardRow[] = [];
  let prevOverdraft = 0;

  for (const p of sorted) {
    const snap = snapshotPortions(p.snapshot);
    const live = input.livePortions.get(p.id) ?? null;
    const portions = input.mode === 'history' ? (snap ?? live) : (live ?? snap);
    const portionsSource: DashboardRow['portionsSource'] =
      portions == null ? null : (input.mode === 'history' ? snap != null : live == null) ? 'snapshot' : 'live';
    const tariff = p.tariff ?? p.snapshot?.tariff ?? input.defaultTariff;
    const grossUah = portions == null ? 0 : portionsAmount(portions, tariff, input.roundToHryvnia);
    const amountUah = grossUah + p.adjustmentUah;
    const amountUsd = p.usdRate && p.usdRate > 0 ? amountUah / p.usdRate : 0;
    const hourlyRate = hourlyRateFor(p.start, input.hourlyRates);
    const fact = p.factMinutes ?? 0;
    const costUsd = (fact / 60) * hourlyRate;
    const paidMinutes = hourlyRate > 0 ? (amountUsd / hourlyRate) * 60 : 0;
    const accumulated = prevOverdraft + fact;
    const overdraft = accumulated - paidMinutes;
    prevOverdraft = overdraft;
    rows.push({
      periodId: p.id,
      start: p.start,
      end: p.end,
      days: daysInclusive(p.start, p.end),
      factMinutes: p.factMinutes,
      portions,
      portionsSource,
      tariff,
      grossUah,
      adjustmentUah: p.adjustmentUah,
      adjustmentNote: p.adjustmentNote,
      amountUah,
      usdRate: p.usdRate,
      rateSource: p.rateSource,
      amountUsd,
      hourlyRate,
      costUsd,
      paidMinutes,
      accumulatedMinutes: accumulated,
      overdraftMinutes: overdraft,
      deltaUsd: amountUsd - costUsd,
      invoiceNumber: p.invoiceId != null ? (input.invoiceNumbers.get(p.invoiceId) ?? null) : null,
      portionsDrift: snap != null && live != null ? live - snap : null,
    });
  }

  const todayIso = input.generatedAt.slice(0, 10);
  const byMonth = new Map<string, DashboardMonthRow>();
  for (const r of rows) {
    const key = r.start.slice(0, 7);
    const cur = byMonth.get(key) ?? { month: key, portions: 0, days: 0, amountPerDay: 0, amountUsdPerDay: 0, costUah: 0, amountUah: 0, amountUsd: 0, costUsd: 0, amountChange: null };
    cur.costUah += r.costUsd * (r.usdRate ?? 0);
    cur.portions += r.portions ?? 0;
    // A period in progress counts only the days that have passed.
    const lastDay = r.end < todayIso ? r.end : todayIso;
    if (r.start <= lastDay) cur.days += daysInclusive(r.start, lastDay);
    cur.amountUah += r.amountUah;
    cur.amountUsd += r.amountUsd;
    cur.costUsd += r.costUsd;
    byMonth.set(key, cur);
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  months.forEach((m, i) => {
    m.amountPerDay = m.days > 0 ? m.amountUah / m.days : 0;
    m.amountUsdPerDay = m.days > 0 ? m.amountUsd / m.days : 0;
    const prev = months[i - 1];
    m.amountChange = prev && prev.amountUah > 0 ? m.amountUah / prev.amountUah - 1 : null;
  });

  const last = rows[rows.length - 1];
  const lastHourly = last?.hourlyRate ?? 0;
  const yearRows = rows.slice(-24);
  // Averages use complete periods only: the half-month in progress would drag them down.
  const complete = rows.filter((r) => r.end <= todayIso && r.amountUah > 0);
  const avgOf = (list: DashboardRow[]): number => (list.length ? list.reduce((s, r) => s + r.amountUah, 0) / list.length : 0);
  const recent = complete.slice(-12);
  const earlier = complete.slice(-24, -12);
  const avgAmountChange = earlier.length > 0 && avgOf(earlier) > 0 ? avgOf(recent) / avgOf(earlier) - 1 : null;
  const yearAmountUah = yearRows.reduce((s, r) => s + r.amountUah, 0);
  return {
    mode: input.mode,
    rows,
    months,
    kpi: {
      overdraftMinutes: last?.overdraftMinutes ?? 0,
      overdraftUsd: ((last?.overdraftMinutes ?? 0) / 60) * lastHourly,
      yearAmountUah,
      yearAmountUsd: yearRows.reduce((s, r) => s + r.amountUsd, 0),
      yearCostUsd: yearRows.reduce((s, r) => s + r.costUsd, 0),
      avgAmountUah: avgOf(recent),
      avgAmountChange,
    },
    generatedAt: input.generatedAt,
  };
}
