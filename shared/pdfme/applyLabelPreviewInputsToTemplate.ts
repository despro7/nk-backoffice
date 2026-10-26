import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';

const SVG_CONTENT_FIELDS = new Set([
  'logo_svg',
  'instruction_svg',
  'estimated_svg',
  'warning_icon',
  'qr_url',
]);

/**
 * Оновлює лише `content` полів макету для попереднього перегляду в Designer.
 * Геометрію (position, width, rotation…) не змінює.
 */
export function applyLabelPreviewInputsToTemplate(
  template: LabelPdfmeTemplate,
  pdfmeInputs: Record<string, string>,
  assets: Partial<Record<string, string>> = {},
): LabelPdfmeTemplate {
  return {
    ...template,
    schemas: (template.schemas ?? []).map((page) =>
      page.map((field) => {
        const name = String(field.name ?? '');
        const next = { ...field };

        if (SVG_CONTENT_FIELDS.has(name) && assets[name]) {
          next.content = assets[name];
          next.type = 'svg';
          return next;
        }

        const value = pdfmeInputs[name];
        if (value !== undefined) {
          next.content = value;
        }
        return next;
      }),
    ),
  };
}
