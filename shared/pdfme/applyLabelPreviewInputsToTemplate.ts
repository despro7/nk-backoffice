import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import {
  isStoredLabelSvgContentMissing,
  LABEL_TEMPLATE_SVG_FIELD_NAMES,
} from './labelTemplateSvgAssets.js';

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

        if (LABEL_TEMPLATE_SVG_FIELD_NAMES.has(name) && assets[name]) {
          const existing =
            typeof next.content === 'string' ? next.content.trim() : '';
          if (isStoredLabelSvgContentMissing(existing)) {
            next.content = assets[name];
            next.type = 'svg';
          }
          return next;
        }

        const value = pdfmeInputs[name];
        if (value !== undefined && value !== '') {
          next.content = value;
        }
        return next;
      }),
    ),
  };
}
