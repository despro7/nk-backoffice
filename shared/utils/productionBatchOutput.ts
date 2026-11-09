/**
 * Факт виходу варки (крок 5): порції, тара, залишки по рядках і відхилення від плану.
 *
 * По рядку вводиться залишок після варки (його зважують); витрачено = видано − залишок.
 * Залишок > 0 – треба вирішити: лишити на ВП чи повернути на СП.
 */
import type {
  ProductionBatchFact,
  ProductionBatchLeftoverAction,
  ProductionBatchOutputLineInput,
} from '../types/production.js';
import { issuePlan, type IssueLineLike } from './productionBatchIssue.js';

/** Відхилення витрати від плану, за якого рядок підсвічується. */
export const CONSUMPTION_DEVIATION_PCT = 5;
/** Відхилення порцій (ГП + брак + проба) від плану, за якого показується попередження. */
export const PORTIONS_DEVIATION_PCT = 2;

const FACT_INT_KEYS = ['portionsGood', 'portionsReject', 'portionsSample', 'labelRejects', 'portionsPerBox', 'boxes', 'pallets'] as const;

export const EMPTY_FACT: ProductionBatchFact = {
  portionsGood: null,
  portionsReject: null,
  portionsSample: null,
  labelRejects: null,
  portionsPerBox: null,
  boxes: null,
  pallets: null,
  comment: null,
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Факт із JSON / введення: цілі ≥ 0 або null, коментар без пробілів по краях. */
export function normalizeFact(raw: unknown, base: ProductionBatchFact = EMPTY_FACT): ProductionBatchFact {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: ProductionBatchFact = { ...base };
  for (const key of FACT_INT_KEYS) {
    if (key in r) out[key] = intOrNull(r[key]);
  }
  if ('comment' in r) out.comment = typeof r.comment === 'string' && r.comment.trim() ? r.comment.trim().slice(0, 2000) : null;
  return out;
}

/** Коробок: ціле вгору від порцій на ГП. */
export function factBoxes(portionsGood: number | null, portionsPerBox: number | null): number | null {
  if (portionsGood == null || portionsPerBox == null || portionsPerBox <= 0) return null;
  return Math.ceil(portionsGood / portionsPerBox);
}

/** Усього порцій зварено (ГП + брак + проба); null – ГП ще не вказано. */
export function factTotalPortions(fact: ProductionBatchFact): number | null {
  if (fact.portionsGood == null) return null;
  return fact.portionsGood + (fact.portionsReject ?? 0) + (fact.portionsSample ?? 0);
}

/** Відхилення, %: (факт − план) / план · 100; null – плану немає. */
export function deviationPct(fact: number | null | undefined, plan: number): number | null {
  if (fact == null || !(plan > 0)) return null;
  return Math.round(((fact - plan) / plan) * 1000) / 10;
}

export interface OutputLineLike extends IssueLineLike {
  issuedQty: number | null;
}

/** Витрачено = видано − залишок (не менше 0); null – видано невідомо. */
export function consumedQty(line: OutputLineLike, leftover: number | null | undefined): number | null {
  if (line.issuedQty == null) return null;
  return round3(Math.max(0, line.issuedQty - (leftover ?? 0)));
}

/** Відхилення витрати від плану видачі, %. */
export function consumptionDeviationPct(line: OutputLineLike, leftover: number | null | undefined): number | null {
  return deviationPct(consumedQty(line, leftover), issuePlan(line).qty);
}

export function isDeviationNotable(pct: number | null, threshold = CONSUMPTION_DEVIATION_PCT): boolean {
  return pct != null && Math.abs(pct) > threshold;
}

function isLeftoverAction(value: unknown): value is ProductionBatchLeftoverAction {
  return value === 'keep_vp' || value === 'return_sp';
}

/** Нормалізоване введення рядка: undefined – не змінювати. */
export function normalizeOutputLineInput(raw: unknown): ProductionBatchOutputLineInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const out: ProductionBatchOutputLineInput = { id };
  if (r.leftoverQty !== undefined) {
    const n = r.leftoverQty === null || r.leftoverQty === '' ? null : Number(r.leftoverQty);
    out.leftoverQty = n != null && Number.isFinite(n) && n >= 0 ? round3(n) : null;
  }
  if (r.leftoverAction !== undefined) out.leftoverAction = isLeftoverAction(r.leftoverAction) ? r.leftoverAction : null;
  if (r.note !== undefined) out.note = typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 2000) : null;
  return out;
}

/** Чому факт виходу не можна підписати; [] – можна. */
export function outputSignErrors(
  fact: ProductionBatchFact,
  lines: Array<OutputLineLike & { name: string; leftoverQty: number | null; leftoverAction: string | null }>,
): string[] {
  const errors: string[] = [];
  if (fact.portionsGood == null) errors.push('Вкажіть, скільки порцій прийнято на ГП');
  for (const line of lines) {
    if (line.issuedQty != null && line.leftoverQty != null && line.leftoverQty > line.issuedQty + 1e-9) {
      errors.push(`«${line.name}»: залишок більший за видане`);
    }
    if ((line.leftoverQty ?? 0) > 0 && !isLeftoverAction(line.leftoverAction)) {
      errors.push(`«${line.name}»: оберіть, що робити із залишком`);
    }
  }
  return errors;
}
