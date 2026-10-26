import { PORTION_LABEL_STATIC } from '../constants/productLabelPortionStatic.js';
import {
  LABEL_INPUT_KEYS,
  LABEL_INPUTS_SCHEMA_VERSION,
  type LabelInputKey,
  type LabelInputMap,
} from '../constants/labelInputKeys.js';
import type { ProductLabelPayloadV2 } from '../types/labelTemplate.js';
import type { ProductLabelPayload } from '../types/productLabel.js';
import { ensureStorageText, formatNetWeightLabel } from './productLabel.js';
import {
  calculateEnergyKcal,
  formatNutritionText,
  getNutritionValidationErrors,
  parseNutritionValues,
} from './productLabelNutrition.js';
import { splitProductTitle } from './splitProductTitle.js';

export interface LabelInputSource {
  name: string;
  printName?: string | null;
  ingredientsText: string;
  nutrition: {
    proteins?: string | null;
    fats?: string | null;
    carbs?: string | null;
    energy?: string | null;
    salt?: string | null;
  } | null;
  weightKg?: number | null;
  mainProductWeightKg?: number | null;
  barcode: string;
  batchNumber: string;
  expiresAt: string;
  /** Порцій у коробці (`catalog_goods.packageRatio`). */
  portionsPerBox?: number | null;
  /** Умови зберігання з блоку опису вітрини (override), інакше статичний текст. */
  storageText?: string | null;
  qrUrl?: string;
}

export function formatPortionsPerBox(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const n = Math.round(Number(value));
  return n > 0 ? String(n) : '';
}

export function emptyLabelInputs(): LabelInputMap {
  const inputs = {} as LabelInputMap;
  for (const key of LABEL_INPUT_KEYS) inputs[key] = '';
  return inputs;
}

export function buildLabelInputs(source: LabelInputSource): LabelInputMap {
  const title = splitProductTitle(source.name, source.printName);
  const nutrition = source.nutrition;
  const energy =
    nutrition?.energy?.trim() ||
    calculateEnergyKcal({
      proteins: nutrition?.proteins || '',
      fats: nutrition?.fats || '',
      carbs: nutrition?.carbs || '',
    }) ||
    '';
  const manufacturer = [
    PORTION_LABEL_STATIC.manufacturer.title,
    PORTION_LABEL_STATIC.manufacturer.name,
    PORTION_LABEL_STATIC.manufacturer.emailLabel,
    PORTION_LABEL_STATIC.manufacturer.email,
    `${PORTION_LABEL_STATIC.manufacturer.siteLabel} ${PORTION_LABEL_STATIC.manufacturer.site}`,
  ].join('\n');
  const address = [
    ...PORTION_LABEL_STATIC.address.title,
    PORTION_LABEL_STATIC.address.line,
  ].join('\n');

  return {
    title_line1: title.line1,
    title_line2: title.line2,
    ingredients: source.ingredientsText.trim().toLowerCase().startsWith('склад')
      ? source.ingredientsText
      : source.ingredientsText
        ? `Склад: ${source.ingredientsText}`
        : '',
    nutrition_header: PORTION_LABEL_STATIC.nutritionHeader,
    nutrition_proteins: nutrition?.proteins?.trim() ? `Білки ${nutrition.proteins.trim()}г` : '',
    nutrition_fats: nutrition?.fats?.trim() ? `Жири ${nutrition.fats.trim()}г` : '',
    nutrition_carbs: nutrition?.carbs?.trim() ? `Вуглеводи ${nutrition.carbs.trim()}г` : '',
    nutrition_energy: energy ? `Енергетична цінність ${energy} ккал` : '',
    nutrition_salt: nutrition?.salt?.trim() ? `Сіль ${nutrition.salt.trim()}г` : '',
    storage: ensureStorageText(source.storageText ?? null),
    batch_number: source.batchNumber
      ? `${PORTION_LABEL_STATIC.batchLabel} ${source.batchNumber}`
      : '',
    expires_at: source.expiresAt ? `${PORTION_LABEL_STATIC.expiryLabel} ${source.expiresAt}` : '',
    net_weight: formatNetWeightLabel(source.weightKg),
    net_weight_label: PORTION_LABEL_STATIC.netWeightLabel,
    main_product_weight: formatNetWeightLabel(source.mainProductWeightKg),
    portions_per_box: formatPortionsPerBox(source.portionsPerBox),
    barcode: source.barcode,
    manufacturer,
    address,
    warning: PORTION_LABEL_STATIC.warning.toUpperCase(),
    qr_url: '',
    logo_svg: '',
    instruction_svg: '',
    estimated_svg: '',
    warning_icon: '',
  };
}

export function mergeLabelOverrides(
  base: Partial<Record<LabelInputKey, string>>,
  overrides: Partial<Record<LabelInputKey, string>> | null | undefined,
): LabelInputMap {
  const merged = emptyLabelInputs();
  for (const key of LABEL_INPUT_KEYS) {
    const override = overrides?.[key];
    if (override != null) merged[key] = override;
    else if (base[key] != null) merged[key] = base[key] as string;
  }
  return merged;
}

export function diffLabelOverrides(
  base: Partial<Record<LabelInputKey, string>>,
  current: Partial<Record<LabelInputKey, string>>,
): Partial<Record<LabelInputKey, string>> {
  const overrides: Partial<Record<LabelInputKey, string>> = {};
  for (const key of LABEL_INPUT_KEYS) {
    const next = current[key] ?? '';
    const origin = base[key] ?? '';
    if (next !== origin) overrides[key] = next;
  }
  return overrides;
}

function nutritionToken(value: string | undefined): string {
  return value?.match(/[\d]+(?:[.,]\d+)?/)?.[0] ?? '';
}

export function nutritionTextFromInputs(
  inputs: Partial<Record<LabelInputKey, string>>,
): string {
  return formatNutritionText({
    proteins: nutritionToken(inputs.nutrition_proteins),
    fats: nutritionToken(inputs.nutrition_fats),
    carbs: nutritionToken(inputs.nutrition_carbs),
    energy: nutritionToken(inputs.nutrition_energy),
  });
}

export function getLabelNutritionErrors(
  inputs: Partial<Record<LabelInputKey, string>>,
): string[] {
  return getNutritionValidationErrors(nutritionTextFromInputs(inputs));
}

export function withAutoEnergy(
  inputs: LabelInputMap,
  energyManual: boolean,
): LabelInputMap {
  if (energyManual) return inputs;
  const auto = calculateEnergyKcal({
    proteins: inputs.nutrition_proteins,
    fats: inputs.nutrition_fats,
    carbs: inputs.nutrition_carbs,
  });
  if (!auto) return inputs;
  return { ...inputs, nutrition_energy: auto };
}

export function v1PayloadToInputs(payload: ProductLabelPayload): LabelInputMap {
  const nutrition = parseNutritionValues(payload.nutritionText);
  const base = buildLabelInputs({
    name: payload.title.line1,
    printName: payload.title.line2 ? `${payload.title.line1}\n${payload.title.line2}` : payload.title.line1,
    ingredientsText: payload.ingredientsText,
    nutrition,
    weightKg: null,
    barcode: payload.barcode,
    batchNumber: payload.batchNumber,
    expiresAt: payload.expiresAt,
  });
  return {
    ...base,
    title_line1: payload.title.line1,
    title_line2: payload.title.line2,
    storage: payload.storageText,
    net_weight: payload.netWeightLabel,
  };
}

export function isPayloadV2(raw: unknown): raw is ProductLabelPayloadV2 {
  if (!raw || typeof raw !== 'object') return false;
  const row = raw as Partial<ProductLabelPayloadV2>;
  return row.version === LABEL_INPUTS_SCHEMA_VERSION && !!row.inputs && typeof row.inputs === 'object';
}

export function parseStoredLabelPayload(raw: unknown): {
  payload: ProductLabelPayloadV2;
  legacy: boolean;
} | null {
  if (isPayloadV2(raw)) {
    return {
      legacy: false,
      payload: {
        version: LABEL_INPUTS_SCHEMA_VERSION,
        templateId: raw.templateId ?? null,
        inputs: raw.inputs,
        overrides: raw.overrides ?? {},
        nutritionEnergyManual: Boolean(raw.nutritionEnergyManual),
      },
    };
  }
  // v1 shape is parsed by caller via parseProductLabelPayload to avoid a circular import here.
  return null;
}
