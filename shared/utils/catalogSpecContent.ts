import type { CatalogGoodAuditPayload, CatalogGoodAuditSnapshot } from '../types/catalogAudit.js';
import type { CatalogSpecComponent, CatalogSpecContent, CatalogSpecContentDetail } from '../types/catalogSpec.js';
import { diffCatalogGoodSnapshots } from './catalogGoodAuditDiff.js';
import { lossEntriesKey, normalizeLossEntries, resolveCookingLossPercent } from './catalogLoss.js';

const EPS = 1e-9;

/** specQty: порожнє / ≤0 / не число → 1 (як у Dilovod «Розрахунок на N шт.»). */
export function normalizeSpecQty(value: unknown): number {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n > 0 ? n : 1;
}

export function normalizeCookingLoss(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function componentSignature(
  row: Pick<CatalogSpecComponent, 'componentGoodId' | 'qty' | 'unitId' | 'note' | 'cookingLossPercent' | 'losses'>,
): string {
  return JSON.stringify([
    row.componentGoodId,
    Number(Number(row.qty).toFixed(9)),
    row.unitId || null,
    (row.note ?? '').trim() || null,
    resolveCookingLossPercent(row.losses, row.cookingLossPercent),
    lossEntriesKey(row.losses),
  ]);
}

/**
 * Чи однакові дві специфікації. Порядок рядків не важливий (multiset),
 * specQty порівнюється лише коли задано в обох (для наборів specQty немає).
 */
export function specContentEquals(a: CatalogSpecContent, b: CatalogSpecContent): boolean {
  if (a.specQty != null && b.specQty != null && Math.abs(normalizeSpecQty(a.specQty) - normalizeSpecQty(b.specQty)) > EPS) {
    return false;
  }
  if (a.components.length !== b.components.length) return false;
  const left = a.components.map(componentSignature).sort();
  const right = b.components.map(componentSignature).sort();
  return left.every((sig, idx) => sig === right[idx]);
}

/** Вміст у форматі картки (DTO компонентів) → вміст специфікації. */
export function specContentFromDetail(detail: CatalogSpecContentDetail): CatalogSpecContent {
  return {
    specQty: detail.specQty,
    components: detail.components.map((c, idx) => ({
      componentGoodId: c.componentGoodId,
      name: c.componentName || c.componentGoodId,
      sku: c.componentSku ?? null,
      qty: Number(c.qty),
      rowNum: c.rowNum || idx + 1,
      unitId: c.unitId ?? null,
      note: c.note?.trim() || null,
      cookingLossPercent: resolveCookingLossPercent(c.losses, c.cookingLossPercent),
      losses: normalizeLossEntries(c.losses),
    })),
  };
}

/** Знімок лише зі специфікацією – для diff журналу (чернетка / версія vs чинна). */
export function specContentToAuditSnapshot(goodId: string, content: CatalogSpecContent): CatalogGoodAuditSnapshot {
  return {
    id: goodId,
    fields: { specQty: content.specQty },
    components: content.components.map((c) => ({
      componentGoodId: c.componentGoodId,
      name: c.name,
      sku: c.sku,
      qty: c.qty,
      unitId: c.unitId,
      note: c.note,
      cookingLossPercent: c.cookingLossPercent,
      losses: lossEntriesKey(c.losses),
    })),
    prices: {},
    barcodes: [],
    images: [],
  };
}

/** Різниця «від → до» у форматі payload журналу (null – без змін). */
export function diffSpecContent(goodId: string, from: CatalogSpecContent, to: CatalogSpecContent): CatalogGoodAuditPayload | null {
  return diffCatalogGoodSnapshots(specContentToAuditSnapshot(goodId, from), specContentToAuditSnapshot(goodId, to));
}
