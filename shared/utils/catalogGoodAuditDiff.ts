import type { AuditFieldChange } from '../types/audit.js';
import type {
  CatalogAuditBarcodeRow,
  CatalogAuditComponentChange,
  CatalogAuditComponentRow,
  CatalogAuditScalar,
  CatalogGoodAuditPayload,
  CatalogGoodAuditSnapshot,
} from '../types/catalogAudit.js';

/** Довгі значення, які зберігаємо лише як факт зміни. */
const MAX_INLINE_LENGTH = 300;
/** Поля, для яких ніколи не зберігаємо значення (великі JSON-документи). */
const MARKER_ONLY_FIELDS = new Set(['storefrontDescriptionDoc']);

function sameScalar(a: CatalogAuditScalar | undefined, b: CatalogAuditScalar | undefined): boolean {
  const na = a === undefined || a === '' ? null : a;
  const nb = b === undefined || b === '' ? null : b;
  if (typeof na === 'number' && typeof nb === 'number') return Math.abs(na - nb) < 1e-9;
  return na === nb;
}

function fieldChange(field: string, from: CatalogAuditScalar | undefined, to: CatalogAuditScalar | undefined): AuditFieldChange {
  const tooLong = (v: unknown) => typeof v === 'string' && v.length > MAX_INLINE_LENGTH;
  if (MARKER_ONLY_FIELDS.has(field) || tooLong(from) || tooLong(to)) {
    return { field, from: null, to: null, truncated: true };
  }
  return { field, from: from ?? null, to: to ?? null };
}

function diffScalars(before: Record<string, CatalogAuditScalar>, after: Record<string, CatalogAuditScalar>): AuditFieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: AuditFieldChange[] = [];
  for (const key of keys) {
    if (!sameScalar(before[key], after[key])) out.push(fieldChange(key, before[key], after[key]));
  }
  return out;
}

function diffPrices(before: Record<string, number>, after: Record<string, number>): AuditFieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: AuditFieldChange[] = [];
  for (const key of keys) {
    if (!sameScalar(before[key] ?? null, after[key] ?? null)) {
      out.push({ field: `price:${key}`, from: before[key] ?? null, to: after[key] ?? null });
    }
  }
  return out;
}

const COMPONENT_COMPARE_KEYS = ['qty', 'unitId', 'note', 'cookingLossPercent', 'losses'] as const;

/**
 * Склад порівнюємо за componentGoodId (а не rowNum), щоб перестановка рядків не давала шуму.
 * Один інгредієнт може бути в кількох рядках – пари утворюємо за порядком.
 */
function diffComponents(
  before: CatalogAuditComponentRow[],
  after: CatalogAuditComponentRow[],
): CatalogGoodAuditPayload['components'] | undefined {
  const group = (rows: CatalogAuditComponentRow[]) => {
    const map = new Map<string, CatalogAuditComponentRow[]>();
    for (const row of rows) map.set(row.componentGoodId, [...(map.get(row.componentGoodId) ?? []), row]);
    return map;
  };
  const prev = group(before);
  const next = group(after);
  const added: CatalogAuditComponentRow[] = [];
  const removed: CatalogAuditComponentRow[] = [];
  const changed: CatalogAuditComponentChange[] = [];

  for (const id of new Set([...prev.keys(), ...next.keys()])) {
    const a = prev.get(id) ?? [];
    const b = next.get(id) ?? [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const from = a[i];
      const to = b[i];
      if (!from && to) added.push(to);
      else if (from && !to) removed.push(from);
      else if (from && to) {
        const diffFrom: Partial<CatalogAuditComponentRow> = {};
        const diffTo: Partial<CatalogAuditComponentRow> = {};
        for (const key of COMPONENT_COMPARE_KEYS) {
          if (!sameScalar(from[key], to[key])) {
            (diffFrom as Record<string, unknown>)[key] = from[key];
            (diffTo as Record<string, unknown>)[key] = to[key];
          }
        }
        if (Object.keys(diffTo).length > 0) {
          changed.push({ componentGoodId: id, name: to.name, sku: to.sku, from: diffFrom, to: diffTo });
        }
      }
    }
  }
  if (added.length + removed.length + changed.length === 0) return undefined;
  return { added, removed, changed };
}

function diffBarcodes(
  before: CatalogAuditBarcodeRow[],
  after: CatalogAuditBarcodeRow[],
): CatalogGoodAuditPayload['barcodes'] | undefined {
  const key = (r: CatalogAuditBarcodeRow) => `${r.code}|${r.goodPart}`;
  const prev = new Map(before.map((r) => [key(r), r]));
  const next = new Map(after.map((r) => [key(r), r]));
  const added = after.filter((r) => !prev.has(key(r)));
  const removed = before.filter((r) => !next.has(key(r)));
  const changed: NonNullable<CatalogGoodAuditPayload['barcodes']>['changed'] = [];
  for (const [k, to] of next) {
    const from = prev.get(k);
    if (!from) continue;
    const diffFrom: Partial<CatalogAuditBarcodeRow> = {};
    const diffTo: Partial<CatalogAuditBarcodeRow> = {};
    for (const field of ['kind', 'activity'] as const) {
      if (from[field] !== to[field]) {
        (diffFrom as Record<string, unknown>)[field] = from[field];
        (diffTo as Record<string, unknown>)[field] = to[field];
      }
    }
    if (Object.keys(diffTo).length > 0) changed.push({ code: to.code, from: diffFrom, to: diffTo });
  }
  if (added.length + removed.length + changed.length === 0) return undefined;
  return { added, removed, changed };
}

function diffImages(
  before: CatalogGoodAuditSnapshot['images'],
  after: CatalogGoodAuditSnapshot['images'],
): CatalogGoodAuditPayload['images'] | undefined {
  const prevIds = new Set(before.map((i) => i.id));
  const nextIds = new Set(after.map((i) => i.id));
  const added = after.filter((i) => !prevIds.has(i.id)).map((i) => i.name);
  const removed = before.filter((i) => !nextIds.has(i.id)).map((i) => i.name);
  const commonPrev = before.filter((i) => nextIds.has(i.id)).map((i) => i.id).join(',');
  const commonNext = after.filter((i) => prevIds.has(i.id)).map((i) => i.id).join(',');
  const reordered = commonPrev !== commonNext;
  const primaryFrom = before.find((i) => i.isPrimary)?.name ?? null;
  const primaryTo = after.find((i) => i.isPrimary)?.name ?? null;
  const primaryChanged = primaryFrom !== primaryTo;
  if (added.length + removed.length === 0 && !reordered && !primaryChanged) return undefined;
  return {
    added,
    removed,
    ...(reordered ? { reordered: true } : {}),
    ...(primaryChanged ? { primary: { from: primaryFrom, to: primaryTo } } : {}),
  };
}

/** Різниця двох знімків. null – змін немає. */
export function diffCatalogGoodSnapshots(
  before: CatalogGoodAuditSnapshot | null,
  after: CatalogGoodAuditSnapshot | null,
): CatalogGoodAuditPayload | null {
  const empty: CatalogGoodAuditSnapshot = { id: '', fields: {}, components: [], prices: {}, barcodes: [], images: [] };
  const a = before ?? empty;
  const b = after ?? empty;
  const changes = [...diffScalars(a.fields, b.fields), ...diffPrices(a.prices, b.prices)];
  const components = diffComponents(a.components, b.components);
  const barcodes = diffBarcodes(a.barcodes, b.barcodes);
  const images = diffImages(a.images, b.images);
  if (changes.length === 0 && !components && !barcodes && !images) return null;
  return {
    ...(changes.length ? { changes } : {}),
    ...(components ? { components } : {}),
    ...(barcodes ? { barcodes } : {}),
    ...(images ? { images } : {}),
  };
}

/** Чи зачіпає різниця специфікацію (склад або specQty). */
export function catalogAuditTouchesSpec(payload: CatalogGoodAuditPayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload.components) || Boolean(payload.changes?.some((c) => c.field === 'specQty'));
}
