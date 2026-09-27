import type {
  CatalogCreateGoodInput,
  CatalogGoodComponentDto,
  CatalogGoodDetailDto,
  CatalogUpdateGoodInput,
} from '../types/catalog.js';
import type { ProductNutritionJson } from '../types/storefront.js';

type ComponentInput = {
  componentGoodId: string;
  qty: number;
  rowNum?: number;
  unitId?: string | null;
  note?: string | null;
  cookingLossPercent?: number | null;
};

function normalizeCookingLossPercent(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function normalizeComponent(row: ComponentInput, fallbackUnitId?: string | null): string {
  return JSON.stringify({
    componentGoodId: row.componentGoodId,
    qty: Number(row.qty),
    rowNum: row.rowNum ?? 0,
    unitId: row.unitId ?? fallbackUnitId ?? null,
    note: (row.note ?? '').trim() || null,
    cookingLossPercent: normalizeCookingLossPercent(row.cookingLossPercent),
  });
}

function normalizeComponentDto(row: CatalogGoodComponentDto, fallbackUnitId?: string | null): string {
  return normalizeComponent(
    {
      componentGoodId: row.componentGoodId,
      qty: row.qty,
      rowNum: row.rowNum,
      unitId: row.unitId,
      note: row.note,
      cookingLossPercent: row.cookingLossPercent,
    },
    fallbackUnitId,
  );
}

function sortedComponentSignatures(
  rows: ComponentInput[] | CatalogGoodComponentDto[],
  fallbackUnitId?: string | null,
): string[] {
  return rows
    .map((row) =>
      'componentGoodId' in row && 'componentName' in row
        ? normalizeComponentDto(row as CatalogGoodComponentDto, fallbackUnitId)
        : normalizeComponent(row as ComponentInput, fallbackUnitId),
    )
    .sort();
}

function nutritionHasValue(value: ProductNutritionJson | null | undefined): boolean {
  if (!value) return false;
  return Object.values(value).some((part) => String(part ?? '').trim() !== '');
}

function ingredientsSignature(value: string[] | null | undefined): string {
  return JSON.stringify((value ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean).sort());
}

function descriptionDocSignature(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Чи змінились поля специфікації (BOM / specQty) відносно збереженого товару. */
export function hasSpecFieldsChanged(
  input: CatalogUpdateGoodInput,
  existing: CatalogGoodDetailDto,
): boolean {
  if (input.specQty !== undefined) {
    const next =
      input.specQty != null && Number.isFinite(Number(input.specQty)) && Number(input.specQty) > 0
        ? Number(input.specQty)
        : 1;
    const prev =
      existing.specQty != null && Number(existing.specQty) > 0 ? Number(existing.specQty) : 1;
    if (next !== prev) return true;
  }

  if (input.components === undefined) return false;

  const next = sortedComponentSignatures(input.components, input.mainUnitId ?? existing.mainUnitId);
  const prev = sortedComponentSignatures(existing.components, existing.mainUnitId);
  return JSON.stringify(next) !== JSON.stringify(prev);
}

/** Чи є spec-дані при створенні (не дефолтний порожній BOM). */
export function hasSpecFieldsOnCreate(input: CatalogCreateGoodInput): boolean {
  if ((input.components?.length ?? 0) > 0) return true;
  if (input.specQty == null) return false;
  const qty = Number(input.specQty);
  return Number.isFinite(qty) && qty > 0 && qty !== 1;
}

/** Чи змінились поля контенту вітрини (без grossWeight — він у блоці «Упаковка»). */
export function hasStorefrontFieldsChanged(
  input: CatalogUpdateGoodInput,
  existing: CatalogGoodDetailDto,
): boolean {
  if (input.doNotPublish !== undefined && Boolean(input.doNotPublish) !== Boolean(existing.doNotPublish)) {
    return true;
  }

  if (input.storefrontPresetId !== undefined) {
    const next = input.storefrontPresetId?.trim() || null;
    const prev = existing.storefrontPresetId?.trim() || null;
    if (next !== prev) return true;
  }

  if (input.productIngredientsJson !== undefined) {
    if (
      ingredientsSignature(input.productIngredientsJson) !==
      ingredientsSignature(existing.productIngredientsJson ?? null)
    ) {
      return true;
    }
  }

  if (input.productNutritionJson !== undefined) {
    const next = input.productNutritionJson as ProductNutritionJson | null;
    const prev = existing.productNutritionJson ?? null;
    if (JSON.stringify(next ?? null) !== JSON.stringify(prev ?? null)) return true;
  }

  if (input.storefrontDescriptionDoc !== undefined) {
    if (
      descriptionDocSignature(input.storefrontDescriptionDoc) !==
      descriptionDocSignature(existing.storefrontDescriptionDoc ?? null)
    ) {
      return true;
    }
  }

  if (input.description !== undefined) {
    const next = (input.description ?? '').trim();
    const prev = (existing.description ?? '').trim();
    if (next !== prev) return true;
  }

  return false;
}

/** Чи передано контент вітрини при створенні (не порожні дефолти). */
export function hasStorefrontFieldsOnCreate(input: CatalogCreateGoodInput): boolean {
  if (input.doNotPublish) return true;
  if (input.storefrontPresetId?.trim()) return true;
  if ((input.productIngredientsJson?.length ?? 0) > 0) return true;
  if (nutritionHasValue(input.productNutritionJson as ProductNutritionJson | null | undefined)) return true;
  if (descriptionDocSignature(input.storefrontDescriptionDoc).length > 0) return true;
  if ((input.description ?? '').trim()) return true;
  return false;
}
