import { PORTION_LABEL_STATIC } from '../constants/productLabelPortionStatic.js';
import type { LabelInputKey, LabelInputMap } from '../constants/labelInputKeys.js';
import {
  LABEL_MVT_VARIABLE_KEYS,
  type LabelMvtVariable,
} from '../constants/labelMvtVariables.js';
import type { LabelInputSource } from './labelInputs.js';
import { formatPortionsPerBox } from './labelInputs.js';
import { ensureStorageText, formatNetWeightLabel } from './productLabel.js';
import { calculateEnergyKcal } from './productLabelNutrition.js';

/** Зразкові значення змінних для Designer / preview (як «Печеня зі свининою»). */
export const LABEL_MVT_DESIGNER_SAMPLE: Record<LabelMvtVariable, string> = {
  kcal: '123',
  proteins: '6',
  fats: '7',
  carbs: '9',
  salt: '',
  batch: '61007',
  expires: '09.2027',
  ingredients:
    'картопля свіжа, м’ясо свинини, цибуля ріпчаста свіжа, олія соняшникова, морква свіжа, сіль кухонна харчова, перець чорний мелений, паприка мелена, кріп сушений, коріандр, чебрець, часникова есенція',
  net_weight: '380 г',
  net_weight_label: PORTION_LABEL_STATIC.netWeightLabel,
  main_product_weight: '',
  portions_per_box: '24',
  nutrition_header: PORTION_LABEL_STATIC.nutritionHeader,
  storage: PORTION_LABEL_STATIC.storageText,
  manufacturer:
    'Виробник:\nТОВ «Нова Кухня»\nЕлектронна адреса:\ninfo@nk-food.shop\nСайт: nk-food.shop',
  address: 'Адреса потужностей\nвиробництва:\n07101, Київська обл,\nм. Славутич, пр-т\nЕнтузіастів, 8',
  warning: PORTION_LABEL_STATIC.warning.toUpperCase(),
};

export type LabelMvtVariableMap = Record<LabelMvtVariable, string>;

export function emptyLabelMvtVariableMap(): LabelMvtVariableMap {
  const map = {} as LabelMvtVariableMap;
  for (const key of LABEL_MVT_VARIABLE_KEYS) map[key] = '';
  return map;
}

/** Імена змінних у `{name}` у тексті шаблону MVT. */
export function parseMvtVariableNames(text: string): string[] {
  const names: string[] = [];
  const re = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name) names.push(name);
  }
  return names;
}

function nutritionToken(value: string | undefined): string {
  return value?.match(/[\d]+(?:[.,]\d+)?/)?.[0]?.trim() ?? '';
}

export function stripLabelTextPrefix(value: string, prefix: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

/** Канонічні значення змінних з картки товару / партії (до форматування рядків text-полів). */
export function buildLabelMvtVariableMap(source: LabelInputSource): LabelMvtVariableMap {
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
  const address = [...PORTION_LABEL_STATIC.address.title, PORTION_LABEL_STATIC.address.line].join('\n');
  const ingredientsRaw = source.ingredientsText.trim();

  return {
    kcal: nutritionToken(energy) || energy.trim(),
    proteins: nutrition?.proteins?.trim() ?? '',
    fats: nutrition?.fats?.trim() ?? '',
    carbs: nutrition?.carbs?.trim() ?? '',
    salt: nutrition?.salt?.trim() ?? '',
    batch: source.batchNumber.trim(),
    expires: source.expiresAt.trim(),
    ingredients: ingredientsRaw.toLowerCase().startsWith('склад')
      ? stripLabelTextPrefix(ingredientsRaw, 'Склад:')
      : ingredientsRaw,
    net_weight: formatNetWeightLabel(source.weightKg),
    net_weight_label: PORTION_LABEL_STATIC.netWeightLabel,
    main_product_weight: formatNetWeightLabel(source.mainProductWeightKg),
    portions_per_box: formatPortionsPerBox(source.portionsPerBox),
    nutrition_header: PORTION_LABEL_STATIC.nutritionHeader,
    storage: ensureStorageText(null),
    manufacturer,
    address,
    warning: PORTION_LABEL_STATIC.warning.toUpperCase(),
  };
}

/**
 * Відновлює карту змінних із злитих `LabelInputMap` (для preview / регенерації зі збереженого payload).
 */
export function buildLabelMvtVariableMapFromInputs(
  inputs: Partial<Record<LabelInputKey, string>>,
): LabelMvtVariableMap {
  const proteins = nutritionToken(inputs.nutrition_proteins);
  const fats = nutritionToken(inputs.nutrition_fats);
  const carbs = nutritionToken(inputs.nutrition_carbs);
  const salt = nutritionToken(inputs.nutrition_salt);
  const kcal = nutritionToken(inputs.nutrition_energy);

  return {
    kcal,
    proteins: proteins || stripLabelTextPrefix(inputs.nutrition_proteins ?? '', 'Білки').replace(/г$/i, '').trim(),
    fats: fats || stripLabelTextPrefix(inputs.nutrition_fats ?? '', 'Жири').replace(/г$/i, '').trim(),
    carbs: carbs || stripLabelTextPrefix(inputs.nutrition_carbs ?? '', 'Вуглеводи').replace(/г$/i, '').trim(),
    salt: salt || stripLabelTextPrefix(inputs.nutrition_salt ?? '', 'Сіль').replace(/г$/i, '').trim(),
    batch: stripLabelTextPrefix(inputs.batch_number ?? '', PORTION_LABEL_STATIC.batchLabel),
    expires: stripLabelTextPrefix(inputs.expires_at ?? '', PORTION_LABEL_STATIC.expiryLabel),
    ingredients: stripLabelTextPrefix(inputs.ingredients ?? '', 'Склад:'),
    net_weight: inputs.net_weight?.trim() ?? '',
    net_weight_label: inputs.net_weight_label?.trim() ?? PORTION_LABEL_STATIC.netWeightLabel,
    main_product_weight: inputs.main_product_weight?.trim() ?? '',
    portions_per_box: inputs.portions_per_box?.trim() ?? '',
    nutrition_header: inputs.nutrition_header?.trim() ?? PORTION_LABEL_STATIC.nutritionHeader,
    storage: inputs.storage?.trim() ?? '',
    manufacturer: inputs.manufacturer?.trim() ?? '',
    address: inputs.address?.trim() ?? '',
    warning: inputs.warning?.trim() ?? '',
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Підставляє `{змінні}` у рядок шаблону (Designer `content` / MVT `text`). */
export function substituteMvtTemplate(
  template: string,
  map: LabelMvtVariableMap,
): string {
  let out = template;
  for (const name of parseMvtVariableNames(template)) {
    const val = name in map ? map[name as LabelMvtVariable] : '';
    out = out.replace(new RegExp(`\\{${escapeRegExp(name)}\\}`, 'g'), val);
  }
  return out;
}

/** Шаблон з плейсхолдерами у полі text або content (pdfme Designer часто лишає type=text). */
export function fieldPlaceholderTemplate(field: Record<string, unknown>): string {
  const text = typeof field.text === 'string' ? field.text.trim() : '';
  if (text.includes('{')) return text;
  const content = typeof field.content === 'string' ? field.content.trim() : '';
  if (content.includes('{')) return content;
  return '';
}

export function pickMvtVariablePayload(
  variableNames: string[],
  map: LabelMvtVariableMap,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of variableNames) {
    if (name in map) out[name] = map[name as LabelMvtVariable];
    else out[name] = '';
  }
  return out;
}
