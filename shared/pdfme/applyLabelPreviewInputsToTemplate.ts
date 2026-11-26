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

/** `content` за іменем поля: лише ті, що відрізняються між `before` та `after` (значення з `before`). */
export function extractOverwrittenLabelContents(
  before: LabelPdfmeTemplate,
  after: LabelPdfmeTemplate,
): Record<string, string> {
  const nextByName = new Map<string, unknown>();
  for (const page of after.schemas ?? []) {
    for (const field of page) nextByName.set(String(field.name ?? ''), field.content);
  }

  const out: Record<string, string> = {};
  for (const page of before.schemas ?? []) {
    for (const field of page) {
      const name = String(field.name ?? '');
      if (!name || !nextByName.has(name) || nextByName.get(name) === field.content) continue;
      out[name] = typeof field.content === 'string' ? field.content : '';
    }
  }
  return out;
}

/** Повертає збережені `content` полям з відповідними іменами. Геометрію та інші поля не чіпає. */
export function restoreLabelTemplateContents(
  template: LabelPdfmeTemplate,
  contents: Record<string, string>,
): LabelPdfmeTemplate {
  return {
    ...template,
    schemas: (template.schemas ?? []).map((page) =>
      page.map((field) => {
        const name = String(field.name ?? '');
        return Object.prototype.hasOwnProperty.call(contents, name)
          ? { ...field, content: contents[name] }
          : field;
      }),
    ),
  };
}
