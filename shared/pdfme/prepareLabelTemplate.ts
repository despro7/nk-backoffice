import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';

type SchemaField = Record<string, unknown>;

const TEXT_LIKE = new Set(['text', 'multiVariableText']);

/**
 * Стабілізує шаблон перед Viewer/generate: фіксована 100×100 — без expand (він ламає сусідні absolute-поля).
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
        return field;
      }),
    ),
  };
}
