import type { LabelInputKey, LabelInputMap } from '../constants/labelInputKeys.js';
import { LABEL_MVT_VARIABLE_SET } from '../constants/labelMvtVariables.js';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { emptyLabelInputs } from './labelInputs.js';
import {
  buildLabelMvtVariableMapFromInputs,
  fieldPlaceholderTemplate,
  parseMvtVariableNames,
  pickMvtVariablePayload,
  substituteMvtTemplate,
} from './labelMvtVariables.js';

type SchemaField = Record<string, unknown>;

function schemaType(field: SchemaField): string {
  return typeof field.type === 'string' ? field.type : 'text';
}

/** Усі плейсхолдери з `{…}` + масив `variables` (pdfme вимагає ключ для кожного). */
function mvtVariableNames(field: SchemaField): string[] {
  const fromText = parseMvtVariableNames(typeof field.text === 'string' ? field.text : '');
  const fromContent = parseMvtVariableNames(
    typeof field.content === 'string' ? field.content : '',
  );
  const fromSchema = Array.isArray(field.variables)
    ? field.variables.map((v) => String(v)).filter(Boolean)
    : [];
  return [...new Set([...fromSchema, ...fromText, ...fromContent])];
}

function isKnownPlaceholderTemplate(template: string): boolean {
  const names = parseMvtVariableNames(template);
  return names.length > 0 && names.every((n) => LABEL_MVT_VARIABLE_SET.has(n));
}

/**
 * Перетворює логічні inputs наліпки (ключ = канонічне поле) у запис для pdfme `generate`.
 * Поля `text` / barcode / svg — рядок як раніше; `multiVariableText` — JSON зі змінними.
 */
export function resolvePdfmeInputs(
  template: LabelPdfmeTemplate,
  logical: Partial<LabelInputMap>,
): Record<string, string> {
  const merged = { ...emptyLabelInputs(), ...logical };
  const variables = buildLabelMvtVariableMapFromInputs(merged);
  const pdfmeInputs: Record<string, string> = {};

  for (const page of template.schemas ?? []) {
    for (const raw of page) {
      const field = raw as SchemaField;
      const name = typeof field.name === 'string' ? field.name.trim() : '';
      if (!name) continue;

      if (schemaType(field) === 'multiVariableText') {
        const names = mvtVariableNames(field);
        const payload = pickMvtVariablePayload(names, variables);
        // pdfme validateVariables() пропускає рендер, якщо бракує ключа — порожній рядок допустимий.
        for (const key of names) {
          if (!Object.prototype.hasOwnProperty.call(payload, key)) payload[key] = '';
        }
        pdfmeInputs[name] = JSON.stringify(payload);
        continue;
      }

      const placeholderTemplate = fieldPlaceholderTemplate(field);
      if (schemaType(field) === 'text' && isKnownPlaceholderTemplate(placeholderTemplate)) {
        pdfmeInputs[name] = substituteMvtTemplate(placeholderTemplate, variables);
        continue;
      }

      pdfmeInputs[name] = merged[name as LabelInputKey] ?? '';
    }
  }

  return pdfmeInputs;
}

/** Невідомі `{змінні}` у MVT-полях шаблону. */
export function unknownMvtVariableNames(template: LabelPdfmeTemplate): string[] {
  const unknown = new Set<string>();
  for (const page of template.schemas ?? []) {
    for (const raw of page) {
      const field = raw as SchemaField;
      const type = schemaType(field);
      if (type !== 'multiVariableText' && type !== 'text') continue;
      const template =
        type === 'multiVariableText'
          ? fieldPlaceholderTemplate(field) || (typeof field.text === 'string' ? field.text : '')
          : fieldPlaceholderTemplate(field);
      if (!template.includes('{')) continue;
      for (const name of parseMvtVariableNames(template)) {
        if (!LABEL_MVT_VARIABLE_SET.has(name)) unknown.add(name);
      }
    }
  }
  return [...unknown];
}
