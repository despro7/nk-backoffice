import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_MILITARY_DISCOUNT_PER_PORTION,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
  type CatalogMissingRequired,
} from '../types/catalog.js';
import type { ProductNutritionJson } from '../types/storefront.js';
import {
  catalogMissingNameLabels,
  getMissingRequiredCatalogFields,
  type CatalogRequiredFieldsInput,
} from './catalogRequiredFields.js';
import { isEffectivelyEmptyHtml } from './storefrontDescriptionParser.js';

export type CatalogCardAttentionInput = CatalogRequiredFieldsInput & {
  doNotPublish?: boolean;
  isKit?: boolean;
  imageCount?: number;
  description?: string | null;
  productIngredientsJson?: string[] | null;
  productNutritionJson?: ProductNutritionJson | null;
  kitPortionCount?: number | null;
  specQty?: number | null;
  specQtySuspicious?: boolean;
};

function nutritionHasValue(value: ProductNutritionJson | null | undefined): boolean {
  if (!value) return false;
  return Object.values(value).some((part) => String(part ?? '').trim() !== '');
}

function pricesAlmostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function catalogMainPrice(prices: Array<{ priceType: string; price: number }>): number | null {
  const retail = prices.find((p) => p.priceType === CATALOG_PRICE_TYPE_RETAIL_ID);
  if (retail) return retail.price;
  const regular = prices.find((p) => p.priceType === CATALOG_PRICE_TYPE_REGULAR_ID);
  if (regular) return regular.price;
  return null;
}

function expectedMilitaryPrice(mainPrice: number, isKit: boolean, kitPortionCount: number): number {
  const portions = isKit ? kitPortionCount : 1;
  const next = mainPrice - portions * CATALOG_MILITARY_DISCOUNT_PER_PORTION;
  return Math.round(Math.max(0, next) * 100) / 100;
}

function isMilitaryPriceMismatch(input: CatalogCardAttentionInput): boolean {
  if (input.isGroup || !input.prices?.length) return false;
  const isKit = input.isKit ?? input.accPolicyId === CATALOG_ACC_POLICY_KIT;
  const isGood = !input.accPolicyId || input.accPolicyId === CATALOG_ACC_POLICY_GOOD;
  if (!isGood && !isKit) return false;

  const main = catalogMainPrice(input.prices);
  if (main == null || !Number.isFinite(main)) return false;
  const militaryRow = input.prices.find((p) => p.priceType === CATALOG_PRICE_TYPE_MILITARY_ID);
  if (!militaryRow || militaryRow.price <= 0) return false;

  const portions = isKit ? Math.max(1, input.kitPortionCount ?? 1) : 1;
  const expected = expectedMilitaryPrice(main, isKit, portions);
  return !pricesAlmostEqual(militaryRow.price, expected);
}

function missingStorefrontContentLabels(input: CatalogCardAttentionInput): string[] {
  if (input.isGroup || input.doNotPublish) return [];
  const isKit = input.isKit ?? input.accPolicyId === CATALOG_ACC_POLICY_KIT;
  const labels: string[] = [];
  if ((input.imageCount ?? 0) <= 0) labels.push('Зображення');
  if (isEffectivelyEmptyHtml(input.description)) labels.push('Короткий опис');
  if (!isKit) {
    if (!nutritionHasValue(input.productNutritionJson)) labels.push('КБЖУ');
    if ((input.productIngredientsJson?.length ?? 0) === 0) labels.push('Склад');
  }
  return labels;
}

function resolveSpecQty(raw: number | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/** Підказки для іконки уваги в каталозі (як у картці товару). */
export function getCatalogCardAttentionLabels(input: CatalogCardAttentionInput): string[] {
  const missing: CatalogMissingRequired = getMissingRequiredCatalogFields(input);
  const labels = [...catalogMissingNameLabels(missing)];

  if (missing.weight) labels.push('Вага');
  if (isMilitaryPriceMismatch(input)) labels.push('Ціни → Військові (некоректно)');
  labels.push(...missingStorefrontContentLabels(input));

  const isGood = !input.isGroup && (!input.accPolicyId || input.accPolicyId === CATALOG_ACC_POLICY_GOOD);
  if (isGood && input.specQtySuspicious) {
    labels.push(`Розрахунок на (${resolveSpecQty(input.specQty)})`);
  }

  return labels;
}
