import {
  DEFAULT_CATALOG_LOSS_FORMULA,
  type CatalogLossEntry,
  type CatalogLossFormula,
} from '../types/production.js';

const PERCENT_DECIMALS = 3;

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(100, Math.max(0, n));
  const factor = 10 ** PERCENT_DECIMALS;
  return Math.round(clamped * factor) / factor;
}

export function isCatalogLossFormula(value: unknown): value is CatalogLossFormula {
  return value === 'additive' || value === 'sequential';
}

export function normalizeLossFormula(value: unknown): CatalogLossFormula {
  return isCatalogLossFormula(value) ? value : DEFAULT_CATALOG_LOSS_FORMULA;
}

/**
 * Розбивка втрат у канонічному вигляді: валідні typeId, % у 0–100, без нулів і дублів типу
 * (перший запис перемагає). Порожня розбивка → null («розбивки немає»).
 * Приймає і масив, і JSON-рядок (так значення може прийти з БД).
 */
export function normalizeLossEntries(raw: unknown): CatalogLossEntry[] | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const seen = new Set<number>();
  const out: CatalogLossEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const typeId = Number((item as { typeId?: unknown }).typeId);
    if (!Number.isInteger(typeId) || typeId <= 0 || seen.has(typeId)) continue;
    const percent = clampPercent((item as { percent?: unknown }).percent);
    if (percent <= 0) continue;
    seen.add(typeId);
    out.push({ typeId, percent });
  }
  return out.length > 0 ? out : null;
}

/** Сума % розбивки (те, що показує поле «Втрати» в специфікації). */
export function sumLossPercent(entries: CatalogLossEntry[] | null | undefined): number {
  if (!entries?.length) return 0;
  return clampPercent(entries.reduce((acc, e) => acc + clampPercent(e.percent), 0));
}

/**
 * Значення `cookingLossPercent` рядка: сума розбивки, якщо вона є, інакше саме поле.
 * Так старий код, що читає лише `cookingLossPercent`, бачить загальні втрати.
 */
export function resolveCookingLossPercent(
  losses: unknown,
  cookingLossPercent: unknown,
): number {
  const normalized = normalizeLossEntries(losses);
  if (normalized) return sumLossPercent(normalized);
  return clampPercent(cookingLossPercent);
}

/** Ефективний % втрат рядка з урахуванням формули (для брутто). */
export function effectiveLossPercent(
  row: { losses?: CatalogLossEntry[] | null; cookingLossPercent?: number | null },
  formula: CatalogLossFormula = DEFAULT_CATALOG_LOSS_FORMULA,
): number {
  const entries = normalizeLossEntries(row.losses);
  if (!entries) return clampPercent(row.cookingLossPercent);
  if (formula === 'sequential') {
    const kept = entries.reduce((acc, e) => acc * (1 - e.percent / 100), 1);
    return Math.min(100, Math.max(0, (1 - kept) * 100));
  }
  return sumLossPercent(entries);
}

/**
 * Брутто з нетто. Ефективні втрати ≥ 100% не мають сенсу (ділення на 0) – тоді брутто = нетто,
 * як і раніше для `cookingLossPercent = 100`.
 */
export function grossFromNet(
  net: number,
  row: { losses?: CatalogLossEntry[] | null; cookingLossPercent?: number | null },
  formula: CatalogLossFormula = DEFAULT_CATALOG_LOSS_FORMULA,
): number {
  const loss = effectiveLossPercent(row, formula);
  return loss < 100 ? net / (1 - loss / 100) : net;
}

/** Розбивку можна застосувати: для `additive` сума має бути < 100%. */
export function isLossSplitValid(
  entries: CatalogLossEntry[] | null | undefined,
  formula: CatalogLossFormula = DEFAULT_CATALOG_LOSS_FORMULA,
): boolean {
  const normalized = normalizeLossEntries(entries);
  if (!normalized) return true;
  if (formula === 'sequential') return normalized.every((e) => e.percent < 100);
  return sumLossPercent(normalized) < 100;
}

/** Канонічний ключ розбивки для порівняння (порядок записів не важливий). null – розбивки немає. */
export function lossEntriesKey(entries: CatalogLossEntry[] | null | undefined): string | null {
  const normalized = normalizeLossEntries(entries);
  if (!normalized) return null;
  return [...normalized]
    .sort((a, b) => a.typeId - b.typeId)
    .map((e) => `${e.typeId}:${e.percent}`)
    .join('|');
}

/** Ключ → записи (для журналу змін). */
export function parseLossEntriesKey(key: string | null | undefined): CatalogLossEntry[] {
  if (!key) return [];
  return key
    .split('|')
    .map((part) => {
      const [typeId, percent] = part.split(':');
      return { typeId: Number(typeId), percent: Number(percent) };
    })
    .filter((e) => Number.isInteger(e.typeId) && Number.isFinite(e.percent));
}
