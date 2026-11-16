/**
 * Invoices module (admin only): preview/create invoices, payer presets, archive,
 * time-tracking periods and the dashboard. See Docs/features/invoices.md.
 */

import type {
  DashboardData,
  DashboardMode,
  InvoiceCreateInput,
  InvoiceLine,
  InvoicePayer,
  InvoicePreview,
  InvoicePreviewInput,
  InvoiceRecord,
  InvoiceSettings,
  IsoDate,
  TrackingPeriod,
} from '../../../shared/types/invoices.js';
import {
  buildDashboard,
  defaultInvoicePeriod,
  isIsoDate,
  lastDayOfMonth,
  parseIsoDate,
  portionsAmount,
  roundMoney,
  toIsoDate,
} from '../../../shared/utils/invoiceCalc.js';
import {
  DEFAULT_PAYERS,
  archiveStore,
  payerStore,
  periodStore,
  readInvoiceSettings,
  writeInvoiceSettings,
} from './invoiceStores.js';
import { getReportingDayStartHour } from '../../lib/utils.js';
import { getPortionsForRange } from './PortionsService.js';
import { getNbuUsdRate } from './NbuRateService.js';
import { buildHistoryPeriods } from './historySeed.js';

export class InvoicesError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Today in Kyiv, `YYYY-MM-DD`. */
export function todayKyiv(now = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

function addDays(date: IsoDate, delta: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function halfMonthOf(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const { year, month, day } = parseIsoDate(date);
  return day <= 15
    ? { start: toIsoDate(year, month, 1), end: toIsoDate(year, month, 15) }
    : { start: toIsoDate(year, month, 16), end: toIsoDate(year, month, lastDayOfMonth(year, month)) };
}

// ---------- settings ----------

export async function getSettings(): Promise<InvoiceSettings> {
  return readInvoiceSettings();
}

export async function saveSettings(input: Partial<InvoiceSettings>): Promise<InvoiceSettings> {
  const current = await readInvoiceSettings();
  const next: InvoiceSettings = { ...current };
  if (input.payee) {
    next.payee = {
      fullName: str(input.payee.fullName) || current.payee.fullName,
      taxId: str(input.payee.taxId, 20) || current.payee.taxId,
      address: str(input.payee.address) || current.payee.address,
      phone: str(input.payee.phone, 40),
      bank: str(input.payee.bank, 100),
      iban: str(input.payee.iban, 40),
      signatureName: str(input.payee.signatureName, 60) || current.payee.signatureName,
    };
  }
  if (input.serviceName !== undefined) next.serviceName = str(input.serviceName) || current.serviceName;
  if (input.paymentPurpose !== undefined) next.paymentPurpose = str(input.paymentPurpose);
  if (input.taxNote !== undefined) next.taxNote = str(input.taxNote, 1000);
  if (input.paymentTerms !== undefined) next.paymentTerms = str(input.paymentTerms, 1000);
  if (input.defaultTariff !== undefined) {
    const t = num(input.defaultTariff);
    if (t == null || t <= 0) throw new InvoicesError('Тариф має бути більшим за нуль');
    next.defaultTariff = t;
  }
  if (input.roundToHryvnia !== undefined) next.roundToHryvnia = input.roundToHryvnia === true;
  if (Array.isArray(input.countedStatuses)) {
    const statuses = input.countedStatuses.map(String).filter((s) => /^\d$/.test(s));
    if (statuses.length === 0) throw new InvoicesError('Потрібен хоча б один статус замовлення');
    next.countedStatuses = [...new Set(statuses)];
  }
  if (Array.isArray(input.hourlyRates)) {
    const steps = input.hourlyRates
      .filter((s) => s && isIsoDate(s.from) && num(s.usd) != null && s.usd > 0)
      .map((s) => ({ from: s.from, usd: s.usd }));
    if (steps.length === 0) throw new InvoicesError('Потрібна хоча б одна ставка години');
    next.hourlyRates = steps.sort((a, b) => a.from.localeCompare(b.from));
  }
  if (input.nextNumberFloor !== undefined) {
    const n = num(input.nextNumberFloor);
    if (n == null || n < 1 || !Number.isInteger(n)) throw new InvoicesError('Номер має бути цілим числом');
    next.nextNumberFloor = n;
  }
  return writeInvoiceSettings(next);
}

// ---------- payers ----------

export async function listPayers(): Promise<InvoicePayer[]> {
  if (!(await payerStore.exists())) {
    await payerStore.mutate((draft) => {
      if (draft.items.length > 0) return;
      draft.items = DEFAULT_PAYERS.map((p) => ({ ...p, id: draft.allocateId() }));
    });
  }
  const items = await payerStore.read();
  return items.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name, 'uk'));
}

export async function upsertPayer(input: { id?: number; name: string; taxId: string; address: string }, markUsed = false): Promise<InvoicePayer> {
  const name = str(input.name, 200);
  const taxId = str(input.taxId, 20);
  const address = str(input.address, 300);
  if (!name) throw new InvoicesError('Вкажіть назву платника (ФОП, ПІБ)');
  if (!/^\d{8,10}$/.test(taxId)) throw new InvoicesError('ІПН/ЄДРПОУ має містити 8–10 цифр');
  if (!address) throw new InvoicesError('Вкажіть адресу платника');
  await listPayers();
  return payerStore.mutate((draft) => {
    const existing = draft.items.find((p) => (input.id != null ? p.id === input.id : p.taxId === taxId));
    const lastUsedAt = markUsed ? new Date().toISOString() : existing?.lastUsedAt;
    if (existing) {
      existing.name = name;
      existing.taxId = taxId;
      existing.address = address;
      if (lastUsedAt) existing.lastUsedAt = lastUsedAt;
      return { ...existing };
    }
    const created: InvoicePayer = { id: draft.allocateId(), name, taxId, address, ...(lastUsedAt ? { lastUsedAt } : {}) };
    draft.items.push(created);
    return created;
  });
}

export async function deletePayer(id: number): Promise<void> {
  await payerStore.mutate((draft) => {
    draft.items = draft.items.filter((p) => p.id !== id);
  });
}

// ---------- invoice preview / create ----------

function nextNumber(archive: InvoiceRecord[], floor: number): number {
  return Math.max(floor - 1, ...archive.map((i) => i.number)) + 1;
}

export async function previewInvoice(input: InvoicePreviewInput = {}): Promise<InvoicePreview> {
  const settings = await readInvoiceSettings();
  const today = todayKyiv();
  const auto = defaultInvoicePeriod(today);
  const periodStart = input.periodStart ?? auto.start;
  const periodEnd = input.periodEnd ?? auto.end;
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd) {
    throw new InvoicesError('Невірний період');
  }
  const tariff = input.tariff && input.tariff > 0 ? input.tariff : settings.defaultTariff;
  const portions = await getPortionsForRange(periodStart, periodEnd, settings.countedStatuses, { force: true });
  const archive = await archiveStore.read();
  return {
    number: nextNumber(archive, settings.nextNumberFloor),
    date: today,
    periodStart,
    periodEnd,
    portions: portions.total,
    tariff,
    grossUah: portionsAmount(portions.total, tariff, settings.roundToHryvnia),
    dayStartHour: await getReportingDayStartHour(),
    byDay: portions.byDay,
  };
}

export async function listInvoices(): Promise<InvoiceRecord[]> {
  const items = await archiveStore.read();
  return items.sort((a, b) => b.number - a.number);
}

export async function createInvoice(input: InvoiceCreateInput): Promise<InvoiceRecord> {
  const settings = await readInvoiceSettings();
  const date = input.date ?? todayKyiv();
  if (!isIsoDate(date) || !isIsoDate(input.periodStart) || !isIsoDate(input.periodEnd) || input.periodStart > input.periodEnd) {
    throw new InvoicesError('Невірна дата або період');
  }
  const tariff = num(input.tariff);
  if (tariff == null || tariff <= 0) throw new InvoicesError('Тариф має бути більшим за нуль');
  const adjustmentUah = num(input.adjustmentUah ?? 0) ?? 0;
  const payer = await upsertPayer(input.payer, true);

  const portions = await getPortionsForRange(input.periodStart, input.periodEnd, settings.countedStatuses, { force: true });
  const grossUah = portionsAmount(portions.total, tariff, settings.roundToHryvnia);
  const mainAmount = roundMoney(grossUah + adjustmentUah, settings.roundToHryvnia);
  if (mainAmount < 0) throw new InvoicesError('Сума основного рядка не може бути від’ємною');

  const lines: InvoiceLine[] = [
    {
      title: str(input.serviceTitle, 300) || settings.serviceName,
      quantity: 1,
      unit: 'посл.',
      price: mainAmount,
      amount: mainAmount,
      kind: 'portions',
    },
  ];
  for (const l of input.customLines ?? []) {
    const title = str(l.title, 300);
    const quantity = num(l.quantity);
    const price = num(l.price);
    if (!title || quantity == null || quantity <= 0 || price == null || price < 0) {
      throw new InvoicesError('Додатковий рядок: вкажіть назву, кількість і ціну (не менше нуля)');
    }
    lines.push({ title, quantity, unit: str(l.unit, 20) || 'посл.', price, amount: roundMoney(quantity * price, settings.roundToHryvnia), kind: 'custom' });
  }
  const totalUah = lines.reduce((s, l) => s + l.amount, 0);
  const now = new Date().toISOString();

  const record = await archiveStore.mutate((draft) => {
    const rec: InvoiceRecord = {
      id: draft.allocateId(),
      number: nextNumber(draft.items, settings.nextNumberFloor),
      date,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      payerId: payer.id,
      payer: { name: payer.name, taxId: payer.taxId, address: payer.address },
      paymentPurpose: str(input.paymentPurpose, 500) || settings.paymentPurpose,
      lines,
      adjustmentUah,
      adjustmentNote: str(input.adjustmentNote, 500),
      totalUah,
      snapshot: { portions: portions.total, tariff, grossUah, adjustmentUah, totalUah: mainAmount, takenAt: now },
      payee: settings.payee,
      taxNote: settings.taxNote,
      paymentTerms: settings.paymentTerms,
      createdAt: now,
    };
    draft.items.push(rec);
    return rec;
  });

  // Link/refresh the dashboard period (fixed snapshot of the numbers at invoicing time).
  const rate = await getNbuUsdRate(date <= todayKyiv() ? date : todayKyiv());
  await periodStore.mutate((draft) => {
    let period = draft.items.find((p) => p.start === record.periodStart && p.end === record.periodEnd);
    if (!period) {
      period = {
        id: draft.allocateId(),
        start: record.periodStart,
        end: record.periodEnd,
        factMinutes: null,
        tariff: null,
        usdRate: null,
        rateSource: null,
        adjustmentUah: 0,
        adjustmentNote: '',
        invoiceId: null,
        snapshot: null,
      };
      draft.items.push(period);
    }
    period.invoiceId = record.id;
    period.tariff = tariff;
    period.adjustmentUah = adjustmentUah;
    period.adjustmentNote = record.adjustmentNote;
    period.snapshot = record.snapshot;
    if (period.rateSource !== 'manual' && rate != null) {
      period.usdRate = rate;
      period.rateSource = 'nbu';
    }
  });
  return record;
}

export async function deleteInvoice(id: number): Promise<void> {
  await archiveStore.mutate((draft) => {
    draft.items = draft.items.filter((i) => i.id !== id);
  });
  await periodStore.mutate((draft) => {
    for (const p of draft.items) {
      if (p.invoiceId === id) p.invoiceId = null;
    }
  });
}

// ---------- tracking periods / dashboard ----------

/** Make sure every half-month up to the current one exists. */
async function ensurePeriods(today: IsoDate): Promise<void> {
  await periodStore.mutate((draft) => {
    const latestEnd = draft.items.reduce<IsoDate | null>((max, p) => (max == null || p.end > max ? p.end : max), null);
    let cursor = latestEnd ? addDays(latestEnd, 1) : halfMonthOf(today).start;
    while (cursor <= today) {
      const half = halfMonthOf(cursor);
      draft.items.push({
        id: draft.allocateId(),
        start: cursor,
        end: half.end,
        factMinutes: null,
        tariff: null,
        usdRate: null,
        rateSource: null,
        adjustmentUah: 0,
        adjustmentNote: '',
        invoiceId: null,
        snapshot: null,
      });
      cursor = addDays(half.end, 1);
    }
  });
}

async function fillMissingRates(periods: TrackingPeriod[], invoices: InvoiceRecord[], today: IsoDate): Promise<void> {
  const missing = periods.filter((p) => p.usdRate == null && p.start <= today);
  if (missing.length === 0) return;
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const found = new Map<number, number>();
  for (const p of missing) {
    const refDate = p.invoiceId != null ? (invoiceById.get(p.invoiceId)?.date ?? p.end) : p.end;
    const rate = await getNbuUsdRate(refDate <= today ? refDate : today);
    if (rate != null) found.set(p.id, rate);
  }
  if (found.size === 0) return;
  await periodStore.mutate((draft) => {
    for (const p of draft.items) {
      const rate = found.get(p.id);
      if (rate != null && p.usdRate == null) {
        p.usdRate = rate;
        p.rateSource = 'nbu';
      }
    }
  });
}

async function loadLivePortions(periods: TrackingPeriod[], settings: InvoiceSettings, all: boolean): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const targets = periods.filter((p) => all || p.snapshot == null);
  for (let i = 0; i < targets.length; i += 4) {
    const chunk = targets.slice(i, i + 4);
    const parts = await Promise.all(chunk.map((p) => getPortionsForRange(p.start, p.end, settings.countedStatuses)));
    chunk.forEach((p, idx) => result.set(p.id, parts[idx].total));
  }
  return result;
}

export async function getDashboard(mode: DashboardMode): Promise<DashboardData> {
  const today = todayKyiv();
  const settings = await readInvoiceSettings();
  // First open: import the old spreadsheet history once.
  if (!(await periodStore.exists())) await importHistory();
  await ensurePeriods(today);
  const invoices = await archiveStore.read();
  await fillMissingRates(await periodStore.read(), invoices, today);
  const periods = await periodStore.read();
  const livePortions = await loadLivePortions(periods, settings, mode === 'live');
  return buildDashboard({
    periods,
    mode,
    livePortions,
    invoiceNumbers: new Map(invoices.map((i) => [i.id, i.number])),
    defaultTariff: settings.defaultTariff,
    roundToHryvnia: settings.roundToHryvnia,
    hourlyRates: settings.hourlyRates,
    generatedAt: new Date().toISOString(),
  });
}

export interface PeriodPatch {
  factMinutes?: number | null;
  tariff?: number | null;
  usdRate?: number | null;
  adjustmentUah?: number;
  adjustmentNote?: string;
}

export async function updatePeriod(id: number, patch: PeriodPatch): Promise<TrackingPeriod> {
  return periodStore.mutate((draft) => {
    const p = draft.items.find((x) => x.id === id);
    if (!p) throw new InvoicesError('Період не знайдено', 404);
    if (patch.factMinutes !== undefined) {
      if (patch.factMinutes !== null && !(Number.isInteger(patch.factMinutes) && patch.factMinutes >= 0)) {
        throw new InvoicesError('Години: невірний формат (гг:хх)');
      }
      p.factMinutes = patch.factMinutes;
    }
    if (patch.tariff !== undefined) {
      if (patch.tariff !== null && !(patch.tariff > 0)) throw new InvoicesError('Тариф має бути більшим за нуль');
      p.tariff = patch.tariff;
    }
    if (patch.usdRate !== undefined) {
      if (patch.usdRate === null) {
        p.usdRate = null;
        p.rateSource = null;
      } else {
        if (!(patch.usdRate > 0)) throw new InvoicesError('Курс має бути більшим за нуль');
        p.usdRate = patch.usdRate;
        p.rateSource = 'manual';
      }
    }
    if (patch.adjustmentUah !== undefined) {
      if (!Number.isFinite(patch.adjustmentUah)) throw new InvoicesError('Корекція: невірне число');
      p.adjustmentUah = patch.adjustmentUah;
    }
    if (patch.adjustmentNote !== undefined) p.adjustmentNote = str(patch.adjustmentNote, 500);
    return { ...p };
  });
}

export async function refreshPeriodRate(id: number): Promise<TrackingPeriod> {
  const periods = await periodStore.read();
  const period = periods.find((p) => p.id === id);
  if (!period) throw new InvoicesError('Період не знайдено', 404);
  const invoices = await archiveStore.read();
  const invoice = period.invoiceId != null ? invoices.find((i) => i.id === period.invoiceId) : undefined;
  const today = todayKyiv();
  const ref = invoice?.date ?? period.end;
  const rate = await getNbuUsdRate(ref <= today ? ref : today);
  if (rate == null) throw new InvoicesError('Не вдалося отримати курс НБУ', 502);
  return periodStore.mutate((draft) => {
    const p = draft.items.find((x) => x.id === id);
    if (!p) throw new InvoicesError('Період не знайдено', 404);
    p.usdRate = rate;
    p.rateSource = 'nbu';
    return { ...p };
  });
}

/** One-time import of the old spreadsheet history; skips periods that already exist. */
export async function importHistory(): Promise<{ added: number; skipped: number }> {
  const seed = buildHistoryPeriods();
  return periodStore.mutate((draft) => {
    let added = 0;
    for (const row of seed) {
      if (draft.items.some((p) => p.start === row.start)) continue;
      draft.items.push({ ...row, id: draft.allocateId() });
      added += 1;
    }
    return { added, skipped: seed.length - added };
  });
}
