/**
 * Видача сировини на варку (крок 2): скільки видати, в якій одиниці, і чи є нестача.
 *
 * Одиниця видачі = одиниця складського обліку: сировина з відомою масою – кг брутто
 * (так її зважує комірник і так її веде Dilovod), решта – одиниця рядка (пакування – шт).
 */

export interface IssueLineLike {
  kind: 'raw' | 'packaging';
  unitName: string | null;
  plannedQty: number;
  plannedGrossKg: number | null;
  stockRawSnap: number | null;
  stockProdSnap: number | null;
}

export interface IssuePlan {
  qty: number;
  unit: string;
}

/** Допуск округлення: видано менше плану лише якщо різниця більша за 0,1% плану. */
const SHORTAGE_TOLERANCE = 0.001;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** План видачі в одиниці складу. */
export function issuePlan(line: IssueLineLike): IssuePlan {
  if (line.kind === 'raw' && line.plannedGrossKg != null) {
    return { qty: round3(line.plannedGrossKg), unit: 'кг' };
  }
  return { qty: round3(line.plannedQty), unit: line.unitName?.trim() || '' };
}

/** Обліковий залишок СП + ВП зі знімка; null – знімка немає. */
export function snapshotAvailable(line: Pick<IssueLineLike, 'stockRawSnap' | 'stockProdSnap'>): number | null {
  if (line.stockRawSnap == null && line.stockProdSnap == null) return null;
  return round3((line.stockRawSnap ?? 0) + (line.stockProdSnap ?? 0));
}

function below(value: number, plan: number): boolean {
  return plan - value > Math.max(plan * SHORTAGE_TOLERANCE, 1e-9);
}

/** Облікового залишку (СП + ВП) не вистачає на план. */
export function isStockShort(line: IssueLineLike): boolean {
  const available = snapshotAvailable(line);
  return available != null && below(available, issuePlan(line).qty);
}

/**
 * Товари, облікового залишку яких не вистачає на всю варку: один товар може бути в кількох рядках
 * (напр. буряк для бульйону і для дозування), тож план сумується по товару.
 */
export function stockShortGoodIds(lines: Array<IssueLineLike & { goodId: string }>): Set<string> {
  const need = new Map<string, number>();
  const available = new Map<string, number | null>();
  for (const line of lines) {
    need.set(line.goodId, (need.get(line.goodId) ?? 0) + issuePlan(line).qty);
    if (!available.has(line.goodId)) available.set(line.goodId, snapshotAvailable(line));
  }
  const out = new Set<string>();
  for (const [goodId, qty] of need) {
    const stock = available.get(goodId);
    if (stock != null && below(stock, round3(qty))) out.add(goodId);
  }
  return out;
}

/** Видано менше плану – потрібен коментар нестачі. */
export function isIssueShortage(line: IssueLineLike, issuedQty: number | null | undefined): boolean {
  if (issuedQty == null || !Number.isFinite(issuedQty)) return false;
  return below(issuedQty, issuePlan(line).qty);
}

export interface IssueLineInput {
  id: number;
  stockActual?: number | null;
  issuedQty?: number | null;
  issueNote?: string | null;
  shortageComment?: string | null;
}

/** Нормалізоване введення: числа ≥ 0 або null, тексти без пробілів по краях або null. */
export function normalizeIssueInput(raw: unknown): IssueLineInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const num = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? round3(n) : null;
  };
  const text = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null;
  };
  return {
    id,
    stockActual: num(r.stockActual),
    issuedQty: num(r.issuedQty),
    issueNote: text(r.issueNote),
    shortageComment: text(r.shortageComment),
  };
}

/**
 * Чому видачу не можна підтвердити; [] – можна.
 * Кожен рядок має «Видано»; видано менше плану – обовʼязковий коментар нестачі.
 */
export function issueSignErrors(
  lines: Array<IssueLineLike & { name: string; issuedQty: number | null; shortageComment: string | null }>,
): string[] {
  const errors: string[] = [];
  for (const line of lines) {
    if (line.issuedQty == null) {
      errors.push(`«${line.name}»: вкажіть, скільки видано`);
      continue;
    }
    if (isIssueShortage(line, line.issuedQty) && !line.shortageComment?.trim()) {
      errors.push(`«${line.name}»: видано менше плану, поясніть нестачу`);
    }
  }
  return errors;
}
