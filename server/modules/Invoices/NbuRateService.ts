/**
 * Official NBU exchange rate (UAH per 1 USD) for a date.
 * NBU publishes a rate for every calendar day; when a day has no data we step back a few days.
 */

import type { IsoDate } from '../../../shared/types/invoices.js';
import { parseIsoDate, toIsoDate } from '../../../shared/utils/invoiceCalc.js';

const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';
const cache = new Map<string, number>();

function shiftDay(date: IsoDate, delta: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

async function fetchRate(date: IsoDate): Promise<number | null> {
  const key = date;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const url = `${NBU_URL}?valcode=USD&date=${date.replaceAll('-', '')}&json`;
  // eslint-disable-next-line no-undef
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = (await res.json()) as Array<{ rate?: number }>;
  const rate = Array.isArray(body) ? body[0]?.rate : undefined;
  if (typeof rate !== 'number' || !(rate > 0)) return null;
  cache.set(key, rate);
  return rate;
}

/** Returns the rate rounded to 4 decimals, or null when NBU is unreachable or has no data. */
export async function getNbuUsdRate(date: IsoDate): Promise<number | null> {
  for (let back = 0; back <= 5; back += 1) {
    try {
      const rate = await fetchRate(shiftDay(date, -back));
      if (rate != null) return Math.round(rate * 10000) / 10000;
    } catch {
      return null;
    }
  }
  return null;
}
