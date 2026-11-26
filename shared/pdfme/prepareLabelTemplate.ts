import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';

type SchemaField = Record<string, unknown>;

const TEXT_LIKE = new Set(['text', 'multiVariableText']);

const ESTIMATED_FIELD = 'estimated_svg';

/** Чи є в шаблоні окреме поле знака ℮ (старі шаблони; у нових знак друкується в масі нетто). */
export function hasEstimatedSignField(template: LabelPdfmeTemplate): boolean {
  return (template.schemas ?? []).some((page) => page.some((field) => field.name === ESTIMATED_FIELD));
}

/**
 * Стабілізує шаблон перед Viewer/generate: фіксована 100×100 — без expand (він ламає сусідні absolute-поля).
 * Окреме поле знака ℮ приймає input, щоб `resolvePdfmeInputs` міг його сховати
 * (знак друкується текстом у масі нетто).
 */
export function prepareLabelTemplateForRender(template: LabelPdfmeTemplate): LabelPdfmeTemplate {
  return {
    ...template,
    schemas: (template.schemas ?? []).map((page) =>
      page.map((raw) => {
        const field: SchemaField = { ...raw };
        const type = typeof field.type === 'string' ? field.type : 'text';
        if (TEXT_LIKE.has(type) && field.overflow === 'expand') {
          field.overflow = 'visible';
        }
        if (field.name === ESTIMATED_FIELD && field.readOnly === true) {
          field.readOnly = false;
        }
        return field;
      }),
    ),
  };
}
