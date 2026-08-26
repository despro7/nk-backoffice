import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
  type CatalogMissingRequired,
} from '../types/catalog.js';

function isPositiveNumber(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

/** Основні типи цін картки: Роздріб, Звичайна, Військові — усі мають бути > 0. */
const REQUIRED_MAIN_PRICES: Array<{ id: string; label: string }> = [
  { id: CATALOG_PRICE_TYPE_RETAIL_ID, label: 'Роздріб' },
  { id: CATALOG_PRICE_TYPE_REGULAR_ID, label: 'Звичайна' },
  { id: CATALOG_PRICE_TYPE_MILITARY_ID, label: 'Військові' },
];

export const EMPTY_CATALOG_MISSING_REQUIRED: CatalogMissingRequired = {
  prices: [],
  weight: false,
  packageRatio: false,
};

/** Яких основних цін бракує або вони ≤ 0 грн (як `isInvalid` у картці). */
export function getMissingRequiredCatalogPrices(
  prices: Array<{ priceType: string; price: number }>
): string[] {
  const byType = new Map(prices.map((p) => [p.priceType, p.price]));
  return REQUIRED_MAIN_PRICES.filter(({ id }) => !isPositiveNumber(byType.get(id))).map(
    (item) => item.label
  );
}

/** Чи заповнені обовʼязкові ціни (Роздріб, Звичайна і Військові > 0). */
export function areRequiredCatalogPricesFilled(
  prices: Array<{ priceType: string; price: number }>
): boolean {
  return getMissingRequiredCatalogPrices(prices).length === 0;
}

export type CatalogRequiredFieldsInput = {
  isGroup: boolean;
  accPolicyId?: string | null;
  weight?: number | null;
  packageRatio?: number | null;
  /** Якщо не передано — перевірку цін пропускаємо. */
  prices?: Array<{ priceType: string; price: number }>;
};

/**
 * Обовʼязкові поля продукції / набору, яких бракує.
 * Папки та «інші» політики обліку — порожній результат.
 */
export function getMissingRequiredCatalogFields(
  input: CatalogRequiredFieldsInput
): CatalogMissingRequired {
  if (input.isGroup) return EMPTY_CATALOG_MISSING_REQUIRED;
  const isKit = input.accPolicyId === CATALOG_ACC_POLICY_KIT;
  const isGood = !input.accPolicyId || input.accPolicyId === CATALOG_ACC_POLICY_GOOD;
  if (!isGood && !isKit) return EMPTY_CATALOG_MISSING_REQUIRED;

  return {
    prices: input.prices != null ? getMissingRequiredCatalogPrices(input.prices) : [],
    weight: !isPositiveNumber(input.weight),
    packageRatio: isGood && !isPositiveNumber(input.packageRatio),
  };
}

export function catalogMissingNameLabels(missing: CatalogMissingRequired): string[] {
  const labels: string[] = [];
  if (missing.prices.length > 0) {
    labels.push(`Ціни -> ${missing.prices.join(', ')}`);
  }
  if (missing.packageRatio) labels.push('порцій у коробці');
  return labels;
}
