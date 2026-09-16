/** Стартовий шаблон блоку «Поживна цінність» для нової наліпки. */
export const PRODUCT_LABEL_NUTRITION_TEMPLATE = `Білки __г
Жири __г
Вуглеводи __г
Енергетична цінність __ ккал`;

export interface NutritionValues {
  proteins: string;
  fats: string;
  carbs: string;
  energy: string;
}

const EMPTY_NUTRITION: NutritionValues = {
  proteins: '',
  fats: '',
  carbs: '',
  energy: '',
};

const NUTRITION_LABELS: Array<{ key: keyof NutritionValues; label: string; unit: string }> = [
  { key: 'proteins', label: 'Білки', unit: 'г' },
  { key: 'fats', label: 'Жири', unit: 'г' },
  { key: 'carbs', label: 'Вуглеводи', unit: 'г' },
  { key: 'energy', label: 'Енергетична цінність', unit: 'ккал' },
];

function hasNumericValue(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && !trimmed.includes('_') && /[\d]/.test(trimmed);
}

export function parseNutritionNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed || trimmed.includes('_')) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNutritionNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const normalized = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return normalized.replace('.', ',');
}

/** Енергетична цінність (ккал) за Atwater: білки×4 + жири×9 + вуглеводи×4. */
export function calculateEnergyKcal(
  values: Pick<NutritionValues, 'proteins' | 'fats' | 'carbs'>,
): string | null {
  const proteins = parseNutritionNumber(values.proteins);
  const fats = parseNutritionNumber(values.fats);
  const carbs = parseNutritionNumber(values.carbs);
  if (proteins === null || fats === null || carbs === null) return null;
  return formatNutritionNumber(proteins * 4 + fats * 9 + carbs * 4);
}

export function parseNutritionValues(text: string | null | undefined): NutritionValues {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return { ...EMPTY_NUTRITION };

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const values: NutritionValues = { ...EMPTY_NUTRITION };

  for (const rule of NUTRITION_LABELS) {
    const line = lines.find((entry) => entry.toLowerCase().startsWith(rule.label.toLowerCase()));
    if (!line) continue;

    const match = line.match(/([\d,.]+)/);
    values[rule.key] = match?.[1]?.trim() ?? '';
  }

  return values;
}

export function formatNutritionText(values: NutritionValues): string {
  const proteins = values.proteins.trim() || '__';
  const fats = values.fats.trim() || '__';
  const carbs = values.carbs.trim() || '__';
  const energy = values.energy.trim() || '__';

  return `Білки ${proteins}г
Жири ${fats}г
Вуглеводи ${carbs}г
Енергетична цінність ${energy} ккал`;
}

export function ensureNutritionText(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return PRODUCT_LABEL_NUTRITION_TEMPLATE;
  return text ?? PRODUCT_LABEL_NUTRITION_TEMPLATE;
}

export function isNutritionTextPlaceholder(text: string): boolean {
  const values = parseNutritionValues(text);
  return !hasNumericValue(values.proteins)
    && !hasNumericValue(values.fats)
    && !hasNumericValue(values.carbs)
    && !hasNumericValue(values.energy);
}

export function getNutritionValidationErrors(text: string): string[] {
  const values = parseNutritionValues(text);
  const errors: string[] = [];

  for (const rule of NUTRITION_LABELS) {
    const value = values[rule.key];
    if (!hasNumericValue(value)) {
      errors.push(`Заповніть «${rule.label}» (наприклад: ${rule.label} 4,4${rule.unit})`);
    }
  }

  return errors;
}

export function isNutritionTextComplete(text: string): boolean {
  return getNutritionValidationErrors(text).length === 0;
}

export function patchNutritionValue(
  text: string,
  key: keyof NutritionValues,
  nextValue: string,
): string {
  const values = parseNutritionValues(text);
  values[key] = nextValue;
  return formatNutritionText(values);
}

export function patchNutritionWithAutoEnergy(
  text: string,
  key: keyof NutritionValues,
  nextValue: string,
  energyManual: boolean,
): { text: string; energyManual: boolean } {
  let nextText = patchNutritionValue(text, key, nextValue);
  let nextManual = energyManual;

  if (key === 'energy') {
    nextManual = nextValue.trim().length > 0;
    return { text: nextText, energyManual: nextManual };
  }

  if (!nextManual) {
    const values = parseNutritionValues(nextText);
    const autoEnergy = calculateEnergyKcal(values);
    if (autoEnergy) {
      nextText = patchNutritionValue(nextText, 'energy', autoEnergy);
    }
  }

  return { text: nextText, energyManual: nextManual };
}

export const NUTRITION_FIELD_ROWS = NUTRITION_LABELS;
