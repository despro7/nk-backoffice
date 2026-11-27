import { LABEL_WEIGHT_TOLERANCE_KEYS } from '../constants/labelInputKeys.js';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import type { LabelWeightSpacing } from '../types/labelWeightSpacing.js';
import { formatNetWeightForLabel, formatNetWeightWithSuffix } from '../utils/productLabel.js';

/** Що показувати після маси в макеті Designer: знак ℮ або похибку. */
export type LabelMockNetWeightMode = 'estimated' | 'tolerance';

/** Зразок маси для макету шаблону: зберігається в `template.sampledata[0]` разом з іншими mock-даними. */
export interface LabelMockNetWeight {
  mode: LabelMockNetWeightMode;
  /** Похибка для зразка: «5%» / «20г». Лишається й у режимі ℮, щоб не вводити знову. */
  tolerance: string;
}

export const DEFAULT_LABEL_MOCK_NET_WEIGHT: LabelMockNetWeight = { mode: 'estimated', tolerance: '5%' };

const MODE_KEY = 'net_weight_suffix_mode';
const TOLERANCE_KEY = 'net_weight_tolerance';

/** Поля маси, яким макет показує суфікс (спільний перемикач і зразок похибки). */
export const LABEL_MOCK_WEIGHT_FIELDS: string[] = Object.keys(LABEL_WEIGHT_TOLERANCE_KEYS);

export function readLabelMockNetWeight(template: LabelPdfmeTemplate | null | undefined): LabelMockNetWeight {
  const sample = template?.sampledata?.[0] ?? {};
  const mode = sample[MODE_KEY] === 'tolerance' ? 'tolerance' : 'estimated';
  const tolerance =
    typeof sample[TOLERANCE_KEY] === 'string' && sample[TOLERANCE_KEY].trim()
      ? sample[TOLERANCE_KEY].trim()
      : DEFAULT_LABEL_MOCK_NET_WEIGHT.tolerance;
  return { mode, tolerance };
}

export function writeLabelMockNetWeight(
  template: LabelPdfmeTemplate,
  value: LabelMockNetWeight,
): LabelPdfmeTemplate {
  const [first, ...rest] = template.sampledata ?? [];
  return {
    ...template,
    sampledata: [{ ...(first ?? {}), [MODE_KEY]: value.mode, [TOLERANCE_KEY]: value.tolerance }, ...rest],
  };
}

/** Похибка, яку треба показати в макеті (порожньо – знак ℮). */
export function mockToleranceSpec(value: LabelMockNetWeight): string {
  return value.mode === 'tolerance' ? value.tolerance : '';
}

function isWeightTextField(field: Record<string, unknown>): boolean {
  return LABEL_MOCK_WEIGHT_FIELDS.includes(String(field.name)) && (field.type ?? 'text') === 'text';
}

/** Mock-текст поля маси з шаблону, або null, якщо поля немає. */
export function readNetWeightContent(
  template: LabelPdfmeTemplate,
  fieldName = 'net_weight',
): string | null {
  for (const page of template.schemas ?? []) {
    for (const field of page) {
      if (field.name === fieldName && isWeightTextField(field)) return typeof field.content === 'string' ? field.content : '';
    }
  }
  return null;
}

/**
 * Маси (нетто та основного продукту) в макеті показує так, як на живій наліпці: «380 г ℮» / «380 г ± 8%» з пробілами шаблону.
 * Змінює лише `content` полів маси; mock без суфікса треба зберегти окремо.
 */
export function applyNetWeightSuffixPreview(
  template: LabelPdfmeTemplate,
  toleranceSpec: string,
  spacing: LabelWeightSpacing,
): LabelPdfmeTemplate {
  return {
    ...template,
    schemas: (template.schemas ?? []).map((page) =>
      page.map((field) => {
        if (!isWeightTextField(field)) return field;
        const mock = typeof field.content === 'string' ? field.content : '';
        if (!mock.trim()) return field;
        return { ...field, content: formatNetWeightWithSuffix(mock, toleranceSpec, spacing) };
      }),
    ),
  };
}

/**
 * Користувач змінив текст маси в Designer, поки показано суфікс: повертає новий mock без суфікса.
 * Якщо суфікс стерли чи змінили – весь текст вважається новим mock.
 */
export function stripNetWeightSuffixPreview(
  edited: string,
  previousMock: string,
  toleranceSpec: string,
  spacing: LabelWeightSpacing,
): string {
  const previousDisplay = formatNetWeightWithSuffix(previousMock, toleranceSpec, spacing);
  const tail = previousDisplay.slice(formatNetWeightForLabel(previousMock, spacing).length);
  return tail && edited.endsWith(tail) ? edited.slice(0, edited.length - tail.length) : edited;
}
