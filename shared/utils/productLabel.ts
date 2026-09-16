import type { ProductLabelPayload } from '../types/productLabel.js';
import { PORTION_LABEL_STATIC } from '../constants/productLabelPortionStatic.js';
import { isMissingDilovodDate } from './dilovodBatchId.js';
import { ensureNutritionText } from './productLabelNutrition.js';
import { splitProductTitle } from './splitProductTitle.js';
import { typographProductLabelPayload, typographUk } from './typograph.js';

export function ensureStorageText(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? '';
  const base = trimmed || PORTION_LABEL_STATIC.storageText;
  return typographUk(base);
}

/** Готує payload наліпки для превʼю та PDF (типографіка текстових полів). */
export function prepareProductLabelForRender(payload: ProductLabelPayload): ProductLabelPayload {
  return typographProductLabelPayload(payload);
}

/** Форматує дату придатності для етикетки (MM.YYYY). */
export function formatLabelExpiryDate(raw?: string | null): string {
  if (!raw?.trim() || isMissingDilovodDate(raw)) return '';
  const s = raw.trim();

  if (/^\d{2}\.\d{4}$/.test(s)) return s;

  const dotted = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) return `${dotted[2]}.${dotted[3]}`;

  const dashed = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) return `${dashed[2]}.${dashed[1]}`;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${mm}.${parsed.getFullYear()}`;
  }

  return s;
}

/** Підставляє дату з партії, якщо в payload ще порожньо. */
export function resolveLabelExpiryDate(
  expiresAt: string | null | undefined,
  batchExpiration?: string | null,
): string {
  if (expiresAt?.trim()) return expiresAt.trim();
  return formatLabelExpiryDate(batchExpiration);
}

export function formatNetWeightLabel(weightKg: number | null | undefined): string {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return '';
  const grams = Math.round(weightKg * 1000);
  if (grams >= 1000 && grams % 1000 === 0) {
    return `${grams / 1000}кг`;
  }
  return `${grams}г`;
}

export type BomIngredientRow = {
  componentName: string;
  qty?: number;
};

/** Складає текст інгредієнтів з BOM (назви через кому). */
export function buildIngredientsTextFromBom(components: BomIngredientRow[]): string {
  if (!components.length) return '';
  return components
    .map((row) => row.componentName.trim())
    .filter(Boolean)
    .join(', ');
}

export function isProductLabelKind(value: string): value is ProductLabelPayload['labelKind'] {
  return value === 'portion' || value === 'box';
}

export function parseProductLabelPayload(raw: unknown): ProductLabelPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<ProductLabelPayload>;
  if (!isProductLabelKind(String(p.labelKind || ''))) return null;
  if (!p.batchId || !p.batchNumber || !p.title) return null;
  return {
    labelKind: p.labelKind,
    batchId: String(p.batchId),
    batchNumber: String(p.batchNumber),
    barcode: String(p.barcode),
    title: {
      line1: String(p.title.line1 || ''),
      line2: String(p.title.line2 || ''),
      line1FontSize: Number(p.title.line1FontSize) || 14,
      line2FontSize: Number(p.title.line2FontSize) || 11,
      align:
        p.title.align === 'left' || p.title.align === 'right' || p.title.align === 'center'
          ? p.title.align
          : 'center',
    },
    ingredientsText: String(p.ingredientsText || ''),
    nutritionText: String(p.nutritionText || ''),
    nutritionEnergyManual: Boolean(p.nutritionEnergyManual),
    storageText: ensureStorageText(p.storageText),
    expiresAt: String(p.expiresAt || ''),
    netWeightLabel: String(p.netWeightLabel || ''),
  };
}

export function buildSeedLabelPayload(input: {
  labelKind: ProductLabelPayload['labelKind'];
  batchId: string;
  batchNumber: string;
  barcode: string;
  name: string;
  printName?: string | null;
  weightKg?: number | null;
  ingredients: BomIngredientRow[];
  expiration?: string | null;
  nutritionText?: string;
}): ProductLabelPayload {
  return {
    labelKind: input.labelKind,
    batchId: input.batchId,
    batchNumber: input.batchNumber,
    barcode: input.barcode,
    title: splitProductTitle(input.name, input.printName),
    ingredientsText: buildIngredientsTextFromBom(input.ingredients),
    nutritionText: ensureNutritionText(input.nutritionText),
    nutritionEnergyManual: false,
    storageText: ensureStorageText(null),
    expiresAt: formatLabelExpiryDate(input.expiration),
    netWeightLabel: formatNetWeightLabel(input.weightKg),
  };
}
