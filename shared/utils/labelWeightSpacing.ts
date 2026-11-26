import type {
  LabelSpaceWidth,
  LabelWeightSpacing,
  LabelWeightSpacingOverride,
  LabelWeightSpacingSettings,
  LabelWeightSpacingSlot,
} from '../types/labelWeightSpacing.js';

/**
 * Символи пробілів. Усі є в OpenSansCondensed і Arial (у DaysOne немає U+200A).
 * Вузького нерозривного U+202F в OpenSansCondensed немає, тому вузькі пробіли формально розривні;
 * поле маси однорядкове, тож перенос не виникає.
 */
export const LABEL_SPACE_CHARS: Record<LabelSpaceWidth, string> = {
  none: '',
  hair: ' ',
  thin: ' ',
  normal: ' ',
  wide: ' ',
};

export const LABEL_SPACE_LABELS: Record<LabelSpaceWidth, string> = {
  none: 'Без',
  hair: 'Волосяний',
  thin: 'Тонкий',
  normal: 'Звичайний',
  wide: 'Широкий',
};

/** Ширина в частках висоти шрифту (OpenSansCondensed), для підказок. */
export const LABEL_SPACE_EM: Record<LabelSpaceWidth, string> = {
  none: '0',
  hair: '0,10',
  thin: '0,20',
  normal: '0,26',
  wide: '0,50',
};

const BASE_WIDTHS: LabelSpaceWidth[] = ['none', 'hair', 'thin', 'normal'];

/** Доступні варіанти для кожного місця: «Широкий» лише між масою та ℮ / ±. */
export const LABEL_WEIGHT_SPACING_OPTIONS: Record<LabelWeightSpacingSlot, LabelSpaceWidth[]> = {
  unit: BASE_WIDTHS,
  suffix: [...BASE_WIDTHS, 'wide'],
  tolerance: BASE_WIDTHS,
};

export const LABEL_WEIGHT_SPACING_SLOT_LABELS: Record<LabelWeightSpacingSlot, string> = {
  unit: 'Вага – одиниця',
  suffix: 'Вага – ℮ / ±',
  tolerance: '± – похибка',
};

export const LABEL_WEIGHT_SPACING_SLOTS: LabelWeightSpacingSlot[] = ['unit', 'suffix', 'tolerance'];

/** Поточний вигляд до появи налаштування: «380 г ± 8%». */
export const DEFAULT_LABEL_WEIGHT_SPACING: LabelWeightSpacing = {
  unit: 'hair',
  suffix: 'normal',
  tolerance: 'hair',
};

function isAllowed(slot: LabelWeightSpacingSlot, value: unknown): value is LabelSpaceWidth {
  return typeof value === 'string' && LABEL_WEIGHT_SPACING_OPTIONS[slot].includes(value as LabelSpaceWidth);
}

/** Лише валідні місця з перевизначення; null, якщо нічого не лишилось. */
export function sanitizeLabelWeightSpacingOverride(raw: unknown): LabelWeightSpacingOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: LabelWeightSpacingOverride = {};
  for (const slot of LABEL_WEIGHT_SPACING_SLOTS) {
    const value = (raw as Record<string, unknown>)[slot];
    if (isAllowed(slot, value)) out[slot] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Повний набір: невідомі / відсутні місця беруться з дефолту. */
export function sanitizeLabelWeightSpacing(raw: unknown): LabelWeightSpacing {
  return { ...DEFAULT_LABEL_WEIGHT_SPACING, ...(sanitizeLabelWeightSpacingOverride(raw) ?? {}) };
}

export function parseLabelWeightSpacingSettings(raw: unknown): LabelWeightSpacingSettings {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const overrides: Record<string, LabelWeightSpacingOverride> = {};
  const rawOverrides = source.overrides;
  if (rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)) {
    for (const [templateId, value] of Object.entries(rawOverrides)) {
      const clean = sanitizeLabelWeightSpacingOverride(value);
      if (clean) overrides[templateId] = clean;
    }
  }
  return { defaults: sanitizeLabelWeightSpacing(source.defaults), overrides };
}

/** Фінальні пробіли шаблону: спільні значення + його перевизначення. */
export function resolveLabelWeightSpacing(
  defaults: LabelWeightSpacing,
  override: LabelWeightSpacingOverride | null | undefined,
): LabelWeightSpacing {
  return { ...defaults, ...(override ?? {}) };
}
