/**
 * Похідна кількість рядка специфікації: `кількість на варку = k · x + b`,
 * де `x` – нетто рядка-джерела на всю варку, перераховане в одиниці похідного рядка
 * (55 кг картоплі → 55 000 мл для рядка в мл), `k` – безрозмірне співвідношення,
 * `b` – константа на всю варку в одиниці рядка. У специфікацію (і Dilovod) іде кількість
 * на `specQty` порцій: `(k · x(N) + b) / N · specQty`, `N` – «Порцій на варку» (N) техкарти.
 * Формула зберігається лише локально, джерело – за `rowKey`.
 */
import type { CatalogQtyFormula } from '../types/catalog.js';
import { bomRowGrossKg, massUnitToKgFactor } from './catalogBomWeight.js';
import { isRowKey } from './catalogRowKey.js';

export const DEFAULT_BATCH_PORTIONS = 1000;
export const MAX_BATCH_PORTIONS = 1_000_000;

const COEF_DECIMALS = 6;
const QTY_DECIMALS = 6;

type UnitLike = { id: string; name: string; code?: string | null };

export interface QtyFormulaRow {
  rowKey?: string | null;
  qty: number;
  unitId?: string | null;
  componentWeight?: number | null;
  qtyFormula?: CatalogQtyFormula | null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Канонічна формула або null (немає / битий JSON / невалідні поля). Приймає і JSON-рядок з БД. */
export function normalizeQtyFormula(raw: unknown): CatalogQtyFormula | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const { sourceRowKey, k, b } = value as Record<string, unknown>;
  if (!isRowKey(sourceRowKey)) return null;
  const kNum = Number(k);
  const bNum = b == null || b === '' ? 0 : Number(b);
  if (!Number.isFinite(kNum) || !Number.isFinite(bNum)) return null;
  return { sourceRowKey, k: round(kNum, COEF_DECIMALS), b: round(bNum, COEF_DECIMALS) };
}

/** Ключ формули для порівняння вмісту специфікації. */
export function qtyFormulaKey(raw: unknown): string | null {
  const f = normalizeQtyFormula(raw);
  return f ? `${f.sourceRowKey}:${f.k}:${f.b}` : null;
}

/** «Порцій на варку» (N): ціле ≥ 1, інакше значення за замовчуванням. */
export function normalizeBatchPortions(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_PORTIONS;
  return Math.min(n, MAX_BATCH_PORTIONS);
}

export function hasDerivedRows(rows: Array<{ qtyFormula?: CatalogQtyFormula | null }>): boolean {
  return rows.some((r) => normalizeQtyFormula(r.qtyFormula) != null);
}

/** Скільки кг в одиниці рядка: маса одиниці (кг / г / л / мл) або вага штуки; null – невідомо. */
export function kgPerRowUnit(
  row: Pick<QtyFormulaRow, 'unitId' | 'componentWeight'>,
  units: UnitLike[],
): number | null {
  const unit = units.find((u) => u.id === row.unitId);
  const factor = massUnitToKgFactor(unit);
  if (factor != null) return factor;
  const w = row.componentWeight;
  return w != null && Number.isFinite(w) && w > 0 ? w : null;
}

/** Кількість на всю варку за формулою: `k · x + b`, `x` – джерело в одиницях похідного рядка. */
export function derivedBatchQty(formula: CatalogQtyFormula, sourceBatchInRowUnits: number): number {
  return formula.k * sourceBatchInRowUnits + formula.b;
}

/**
 * Чому формулу рядка не можна застосувати; null – можна.
 * Джерело: інший рядок цієї специфікації, не похідний, з масою (кг / г або вага штуки).
 */
export function qtyFormulaSourceError<T extends QtyFormulaRow>(
  row: T,
  rows: T[],
  units: UnitLike[],
): string | null {
  const formula = normalizeQtyFormula(row.qtyFormula);
  if (!formula) return null;
  if (row.rowKey && formula.sourceRowKey === row.rowKey) return 'Рядок не може залежати від себе';
  const source = rows.find((r) => r.rowKey === formula.sourceRowKey);
  if (!source) return 'Рядок-джерело видалено зі специфікації';
  if (normalizeQtyFormula(source.qtyFormula)) return 'Рядок-джерело теж похідний';
  const unitById = new Map(units.map((u) => [u.id, u]));
  const kg = bomRowGrossKg(
    { qty: source.qty, unitId: source.unitId ?? '', componentWeight: source.componentWeight ?? null },
    unitById,
  );
  if (kg == null) return 'Маса рядка-джерела невідома (немає ваги штуки)';
  if (kgPerRowUnit(row, units) == null) return 'Одиниця цього рядка без маси (немає ваги штуки)';
  return null;
}

/**
 * Кількість похідного рядка на `specQty` порцій (те, що зберігається в специфікації).
 * null – формулу не застосувати (немає джерела, джерело без маси, результат ≤ 0).
 */
export function derivedSpecQty<T extends QtyFormulaRow>(
  row: T,
  rows: T[],
  units: UnitLike[],
  specQty: number | null | undefined,
  batchPortions: number,
): number | null {
  const formula = normalizeQtyFormula(row.qtyFormula);
  if (!formula || qtyFormulaSourceError(row, rows, units)) return null;
  const source = rows.find((r) => r.rowKey === formula.sourceRowKey);
  if (!source) return null;
  const unitById = new Map(units.map((u) => [u.id, u]));
  const sourceSpecKg = bomRowGrossKg(
    { qty: source.qty, unitId: source.unitId ?? '', componentWeight: source.componentWeight ?? null },
    unitById,
  );
  if (sourceSpecKg == null) return null;
  const rowKg = kgPerRowUnit(row, units);
  if (rowKg == null) return null;
  const safeSpecQty = specQty != null && specQty > 0 ? specQty : 1;
  const n = normalizeBatchPortions(batchPortions);
  const batch = derivedBatchQty(formula, (sourceSpecKg * n) / safeSpecQty / rowKg);
  const perSpec = round((batch / n) * safeSpecQty, QTY_DECIMALS);
  return perSpec > 0 ? perSpec : null;
}

/**
 * Перераховує кількість похідних рядків. Повертає той самий масив, якщо нічого не змінилось
 * (зручно для React-стану).
 */
export function recalcDerivedRows<T extends QtyFormulaRow>(
  rows: T[],
  units: UnitLike[],
  specQty: number | null | undefined,
  batchPortions: number,
): T[] {
  let changed = false;
  const next = rows.map((row) => {
    const qty = derivedSpecQty(row, rows, units, specQty, batchPortions);
    if (qty == null || qty === row.qty) return row;
    changed = true;
    return { ...row, qty };
  });
  return changed ? next : rows;
}
