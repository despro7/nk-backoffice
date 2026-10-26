import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { LABEL_MVT_VARIABLE_SET } from '../constants/labelMvtVariables.js';
import {
  fieldPlaceholderTemplate,
  parseMvtVariableNames,
  pickMvtVariablePayload,
  LABEL_MVT_DESIGNER_SAMPLE,
} from '../utils/labelMvtVariables.js';

type SchemaField = Record<string, unknown>;

function isKnownPlaceholderTemplate(template: string): boolean {
  const names = parseMvtVariableNames(template);
  return names.length > 0 && names.every((n) => LABEL_MVT_VARIABLE_SET.has(n));
}

/**
 * Поля type=text з `{змінні}` у content/text → multiVariableText (коректний тип для pdfme).
 */
export function upgradeLabelTemplatePlaceholders(template: LabelPdfmeTemplate): LabelPdfmeTemplate {
  return {
    ...template,
    schemas: (template.schemas ?? []).map((page) =>
      page.map((raw) => {
        const field: SchemaField = { ...raw };
        if (field.type !== 'text') return field;
        const templateText = fieldPlaceholderTemplate(field);
        if (!isKnownPlaceholderTemplate(templateText)) return field;

        const varNames = parseMvtVariableNames(templateText);
        const sample = pickMvtVariablePayload(varNames, LABEL_MVT_DESIGNER_SAMPLE);
        return {
          ...field,
          type: 'multiVariableText',
          text: templateText,
          variables: varNames,
          content: JSON.stringify(sample),
        };
      }),
    ),
  };
}
