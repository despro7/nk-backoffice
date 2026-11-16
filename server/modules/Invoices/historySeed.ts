/**
 * One-time import of the old time-tracking spreadsheet ("Облік робочого часу Нова Кухня",
 * Nov 2025 – 31.10.2026). Values are copied as they were in the sheet.
 *
 * The exchange rate is not stored in the sheet; it is derived from "sum UAH" and "paid hours":
 *   rate = sumUah / (paidHours × hourlyRate).
 * 01–15.10.2026: the invoice was reduced by 2 960 UAH (goods taken in lieu of pay), kept as an
 * internal adjustment that is never printed.
 */

import type { TrackingPeriod } from '../../../shared/types/invoices.js';
import { parseHm } from '../../../shared/utils/invoiceCalc.js';

type SeedRow = {
  start: string;
  end: string;
  /** Worked time h:mm (null = not entered). */
  fact: string | null;
  portions: number;
  tariff: number;
  /** Sum in UAH in the sheet (before adjustment). */
  uah: number;
  /** "Оплачені год." h:mm in the sheet. */
  paid: string;
  adjustmentUah?: number;
  adjustmentNote?: string;
};

const HOURLY_USD = 20;
const SEED_AT = '2026-11-16T00:00:00.000Z';

export const HISTORY_ROWS: SeedRow[] = [
  { start: '2025-11-01', end: '2025-11-22', fact: '64:18', portions: 11771, tariff: 2, uah: 23542, paid: '28:01' },
  { start: '2025-11-23', end: '2025-11-30', fact: '05:08', portions: 4548, tariff: 2, uah: 9096, paid: '10:50' },
  { start: '2025-12-01', end: '2025-12-15', fact: '36:10', portions: 9328, tariff: 2, uah: 18656, paid: '20:43' },
  { start: '2025-12-16', end: '2025-12-29', fact: '08:24', portions: 6439, tariff: 2, uah: 12878, paid: '15:19' },
  { start: '2025-12-30', end: '2026-01-15', fact: '05:56', portions: 8305, tariff: 2, uah: 16610, paid: '19:12' },
  { start: '2026-01-16', end: '2026-01-29', fact: '18:45', portions: 9304, tariff: 2, uah: 18608, paid: '20:40' },
  { start: '2026-01-30', end: '2026-02-15', fact: '24:44', portions: 9919, tariff: 2, uah: 19838, paid: '22:02' },
  { start: '2026-02-16', end: '2026-02-28', fact: '01:15', portions: 6173, tariff: 2, uah: 12346, paid: '14:25' },
  { start: '2026-03-01', end: '2026-03-15', fact: '03:53', portions: 6758, tariff: 2, uah: 13516, paid: '15:01' },
  { start: '2026-03-16', end: '2026-03-31', fact: '30:50', portions: 10374, tariff: 2, uah: 20748, paid: '23:45' },
  { start: '2026-04-01', end: '2026-04-15', fact: '52:35', portions: 13673, tariff: 2, uah: 27346, paid: '31:34' },
  { start: '2026-04-16', end: '2026-04-30', fact: '22:18', portions: 14245, tariff: 2, uah: 28490, paid: '32:36' },
  { start: '2026-05-01', end: '2026-05-15', fact: '65:35', portions: 16103, tariff: 2, uah: 32206, paid: '36:40' },
  { start: '2026-05-16', end: '2026-05-31', fact: '15:55', portions: 15090, tariff: 2, uah: 30180, paid: '33:32' },
  { start: '2026-06-01', end: '2026-06-15', fact: '66:06', portions: 18074, tariff: 2, uah: 36148, paid: '41:31' },
  { start: '2026-06-16', end: '2026-06-30', fact: '25:53', portions: 14722, tariff: 2, uah: 29444, paid: '33:55' },
  { start: '2026-07-01', end: '2026-07-15', fact: '19:13', portions: 17362, tariff: 2, uah: 34724, paid: '40:09' },
  { start: '2026-07-16', end: '2026-07-31', fact: '23:33', portions: 16578, tariff: 2, uah: 33156, paid: '38:23' },
  { start: '2026-08-01', end: '2026-08-15', fact: '58:34', portions: 16631, tariff: 2, uah: 33262, paid: '38:21' },
  { start: '2026-08-16', end: '2026-08-31', fact: '61:13', portions: 22120, tariff: 2.5, uah: 55300, paid: '64:01' },
  { start: '2026-09-01', end: '2026-09-15', fact: '54:16', portions: 20740, tariff: 2.5, uah: 51850, paid: '57:36' },
  { start: '2026-09-16', end: '2026-09-30', fact: '58:37', portions: 15779, tariff: 2.5, uah: 39448, paid: '45:30' },
  {
    start: '2026-10-01',
    end: '2026-10-15',
    fact: '76:34',
    portions: 16614,
    tariff: 2.5,
    uah: 41535,
    paid: '47:46',
    adjustmentUah: -2960,
    adjustmentNote: 'Замовлення на підприємстві в рахунок зарплати (рахунок №108 на 38 575 грн)',
  },
  { start: '2026-10-16', end: '2026-10-31', fact: null, portions: 14513, tariff: 2.5, uah: 36283, paid: '40:02' },
];

/** `id` is allocated by the caller. */
export function buildHistoryPeriods(): Array<Omit<TrackingPeriod, 'id'>> {
  return HISTORY_ROWS.map((row) => {
    const paidMinutes = parseHm(row.paid) ?? 0;
    const rate = paidMinutes > 0 ? Math.round((row.uah / ((paidMinutes / 60) * HOURLY_USD)) * 100) / 100 : null;
    const adjustment = row.adjustmentUah ?? 0;
    return {
      start: row.start,
      end: row.end,
      factMinutes: row.fact ? parseHm(row.fact) : null,
      tariff: row.tariff,
      usdRate: rate,
      rateSource: rate ? ('imported' as const) : null,
      adjustmentUah: adjustment,
      adjustmentNote: row.adjustmentNote ?? '',
      invoiceId: null,
      snapshot: {
        portions: row.portions,
        tariff: row.tariff,
        grossUah: row.uah,
        adjustmentUah: adjustment,
        totalUah: row.uah + adjustment,
        takenAt: SEED_AT,
      },
    };
  });
}
