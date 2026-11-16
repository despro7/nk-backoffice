/**
 * Invoices module storage (admin only), all in settings_base (category `invoices`):
 * - `invoices_settings`  – single JSON object (payee, defaults, hourly rate history);
 * - `invoices_payers`    – JsonCollection of payer presets;
 * - `invoices_archive`   – JsonCollection of issued invoices (snapshots);
 * - `invoices_periods`   – JsonCollection of half-month tracking periods for the dashboard.
 */

import { prisma } from '../../lib/utils.js';
import { JsonCollection } from '../../lib/jsonCollection.js';
import type { InvoicePayer, InvoiceRecord, InvoiceSettings, TrackingPeriod } from '../../../shared/types/invoices.js';

const CATEGORY = 'invoices';
const SETTINGS_KEY = 'invoices_settings';

export const payerStore = new JsonCollection<InvoicePayer>('invoices_payers', 'Рахунки: пресети платників', CATEGORY);
export const archiveStore = new JsonCollection<InvoiceRecord>('invoices_archive', 'Рахунки: архів виставлених рахунків', CATEGORY);
export const periodStore = new JsonCollection<TrackingPeriod>('invoices_periods', 'Рахунки: періоди обліку часу для дашборда', CATEGORY);

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  payee: {
    fullName: 'ФОП Дзіова Галина Георгіївна',
    taxId: '2186817784',
    address: 'м. Кривий Ріг, вул. Сергія Колачевського, буд. 6, кв. 27',
    phone: '+380 96 250 1444',
    bank: 'monobank',
    iban: 'UA313220010000026007320033142',
    signatureName: 'Дзіова Г.Г.',
  },
  serviceName: 'IT-підтримка та супровід цифрових сервісів компанії',
  paymentPurpose: 'Послуги з технічної підтримки та супроводу IT-систем.',
  defaultTariff: 2.5,
  roundToHryvnia: true,
  taxNote: 'ФОП працює на спрощеній системі оподаткування, не є платником ПДВ згідно з п. 291.3 ПКУ.',
  paymentTerms: 'Оплату просимо здійснити протягом 5 банківських днів.',
  countedStatuses: ['1', '2', '3', '4', '5'],
  hourlyRates: [{ from: '2025-11-01', usd: 20 }],
  nextNumberFloor: 110,
};

export const DEFAULT_PAYERS: Array<Omit<InvoicePayer, 'id'>> = [
  { name: 'ФОП Бубнова Аліна Сергіївна', taxId: '3898001825', address: 'Київська обл., м. Славутич, пр-т. Інтузіастів, 8' },
  { name: 'ФОП Ситник Андрій Юрійович', taxId: '2881407171', address: 'Київська обл., м. Славутич, пр-т. Інтузіастів, 8' },
  { name: 'ФОП Бубнов Сергій Вікторович', taxId: '2979811252', address: 'Київська обл., м. Славутич, пр-т. Інтузіастів, 8' },
  { name: 'ФОП Бубнова Марія Валеріївна', taxId: '3028114556', address: 'Київська обл., м. Славутич, пр-т. Інтузіастів, 8' },
];

function mergeSettings(raw: unknown): InvoiceSettings {
  const d = DEFAULT_INVOICE_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<InvoiceSettings>;
  return {
    ...d,
    ...r,
    payee: { ...d.payee, ...(r.payee ?? {}) },
    countedStatuses: Array.isArray(r.countedStatuses) && r.countedStatuses.length > 0 ? r.countedStatuses.map(String) : d.countedStatuses,
    hourlyRates: Array.isArray(r.hourlyRates) && r.hourlyRates.length > 0 ? r.hourlyRates : d.hourlyRates,
  };
}

export async function readInvoiceSettings(): Promise<InvoiceSettings> {
  const row = await prisma.settingsBase.findUnique({ where: { key: SETTINGS_KEY }, select: { value: true } });
  if (!row?.value) return mergeSettings(null);
  try {
    return mergeSettings(JSON.parse(row.value));
  } catch {
    return mergeSettings(null);
  }
}

const SIGNATURE_KEY = 'invoices_signature';
const SIGNATURE_MAX_CHARS = 600_000;

/** Signature image as a `data:image/...;base64,...` URL. Private: only the admin endpoint serves it. */
export async function readInvoiceSignature(): Promise<string | null> {
  const row = await prisma.settingsBase.findUnique({ where: { key: SIGNATURE_KEY }, select: { value: true } });
  return row?.value ? row.value : null;
}

export async function writeInvoiceSignature(dataUrl: string | null): Promise<void> {
  if (dataUrl === null) {
    await prisma.settingsBase.deleteMany({ where: { key: SIGNATURE_KEY } });
    return;
  }
  if (dataUrl.length > SIGNATURE_MAX_CHARS || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error('Підпис: потрібне зображення PNG або JPEG до ~400 КБ');
  }
  await prisma.settingsBase.upsert({
    where: { key: SIGNATURE_KEY },
    create: { key: SIGNATURE_KEY, value: dataUrl, category: CATEGORY, description: 'Рахунки: графічний підпис виконавця (приватний)' },
    update: { value: dataUrl },
  });
}

export async function writeInvoiceSettings(settings: InvoiceSettings): Promise<InvoiceSettings> {
  const merged = mergeSettings(settings);
  await prisma.settingsBase.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(merged), category: CATEGORY, description: 'Рахунки: налаштування (реквізити, тариф, ставка години)' },
    update: { value: JSON.stringify(merged) },
  });
  return merged;
}
