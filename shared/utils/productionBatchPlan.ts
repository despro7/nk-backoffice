/**
 * Планові кількості варки зі знімка рецепту (той самий розрахунок, що й склад техкарти):
 * сировина – масштаб на порції, похідні рядки – за формулою `k · x + b` (b – на всю варку),
 * брутто – за формулою втрат; пакування «на порцію» × порції, «на коробку» × коробки.
 */
import type {
  CatalogLossEntry,
  ProductionBatchLineKind,
  ProductionBatchSnapshot,
} from '../types/production.js';
import { bomRowGrossKg } from './catalogBomWeight.js';
import { grossFromNet, normalizeLossEntries, resolveCookingLossPercent } from './catalogLoss.js';
import { derivedBatchQty, kgPerRowUnit, normalizeQtyFormula } from './catalogQtyFormula.js';

type UnitLike = { id: string; name: string; code?: string | null };

export interface PlannedBatchLine {
  kind: ProductionBatchLineKind;
  sortOrder: number;
  goodId: string;
  rowKey: string | null;
  name: string;
  unitId: string | null;
  unitName: string | null;
  plannedQty: number;
  plannedNetKg: number | null;
  plannedGrossKg: number | null;
  losses: CatalogLossEntry[] | null;
}

const QTY_DECIMALS = 6;

function round(value: number): number {
  const factor = 10 ** QTY_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** Коробок на варку: ціле вгору; null – «Порцій у коробці» не задано. */
export function batchBoxes(portions: number, portionsPerBox: number | null | undefined): number | null {
  if (portionsPerBox == null || !(portionsPerBox > 0)) return null;
  return Math.ceil(portions / portionsPerBox);
}

export function planBatchLines(
  snapshot: ProductionBatchSnapshot,
  portions: number,
  units: UnitLike[],
): PlannedBatchLine[] {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitName = (id: string | null) => (id ? unitById.get(id)?.name?.trim() || null : null);
  const specQty = snapshot.specQty > 0 ? snapshot.specQty : 1;
  const scale = portions / specQty;
  const components = snapshot.components.filter((c) => Number(c.qty) > 0);

  // Нетто звичайних рядків на варку, кг – джерела для похідних
  const sourceNetKg = new Map<string, number>();
  for (const c of components) {
    if (!c.rowKey || normalizeQtyFormula(c.qtyFormula)) continue;
    const kg = bomRowGrossKg({ qty: c.qty, unitId: c.unitId ?? '', componentWeight: c.componentWeight }, unitById);
    if (kg != null) sourceNetKg.set(c.rowKey, kg * scale);
  }

  const raw: PlannedBatchLine[] = components.map((c, idx) => {
    const formula = normalizeQtyFormula(c.qtyFormula);
    let qty = c.qty * scale;
    if (formula) {
      const source = sourceNetKg.get(formula.sourceRowKey);
      const rowKg = kgPerRowUnit({ unitId: c.unitId, componentWeight: c.componentWeight }, units);
      if (source != null && rowKg != null) qty = derivedBatchQty(formula, source / rowKg);
    }
    const netKg = bomRowGrossKg({ qty, unitId: c.unitId ?? '', componentWeight: c.componentWeight }, unitById);
    const losses = normalizeLossEntries(c.losses);
    const grossKg =
      netKg != null
        ? grossFromNet(
            netKg,
            { losses, cookingLossPercent: resolveCookingLossPercent(losses, c.cookingLossPercent) },
            snapshot.lossFormula,
          )
        : null;
    return {
      kind: 'raw',
      sortOrder: idx,
      goodId: c.componentGoodId,
      rowKey: c.rowKey,
      name: c.note?.trim() ? `${c.name} (${c.note.trim()})` : c.name,
      unitId: c.unitId,
      unitName: unitName(c.unitId),
      plannedQty: round(qty),
      plannedNetKg: netKg != null ? round(netKg) : null,
      plannedGrossKg: grossKg != null ? round(grossKg) : null,
      losses,
    };
  });

  const boxes = batchBoxes(portions, snapshot.payload.portionsPerBox);
  const packaging: PlannedBatchLine[] = snapshot.payload.packaging.map((row, idx) => {
    const good = snapshot.packagingGoods[row.goodId];
    const qty = row.basis === 'box' ? row.qty * (boxes ?? 0) : row.qty * portions;
    return {
      kind: 'packaging',
      sortOrder: raw.length + idx,
      goodId: row.goodId,
      rowKey: null,
      name: good?.name ?? row.goodId,
      unitId: good?.unitId ?? null,
      unitName: unitName(good?.unitId ?? null),
      plannedQty: round(qty),
      plannedNetKg: null,
      plannedGrossKg: null,
      losses: null,
    };
  });

  return [...raw, ...packaging];
}

/** Номер варки `ВР-YMMDD-N`: одна цифра року, місяць, день планового дня, N – порядковий у межах дня. */
export function formatBatchNumber(plannedDate: string, seq: number): string {
  const [y, m, d] = plannedDate.split('-');
  return `ВР-${y.slice(-1)}${m}${d}-${seq}`;
}

/** Префікс номерів одного дня (для підрахунку N). */
export function batchNumberPrefix(plannedDate: string): string {
  return formatBatchNumber(plannedDate, 0).replace(/0$/, '');
}

/** YYYY-MM-DD; null – невалідна дата. */
export function normalizeBatchDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (date.getUTCFullYear() !== Number(m[1]) || date.getUTCMonth() !== Number(m[2]) - 1) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
