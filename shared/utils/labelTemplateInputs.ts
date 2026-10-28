import { LABEL_INPUT_KEY_SET, type LabelInputKey, LabelInputMap } from '../constants/labelInputKeys.js';
import { PORTION_LABEL_STATIC } from '../constants/productLabelPortionStatic.js';
import { LABEL_MVT_VARIABLE_SET } from '../constants/labelMvtVariables.js';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { isStoredLabelSvgContentMissing } from '../pdfme/labelTemplateSvgAssets.js';
import { unknownTemplateSchemaNames } from '../pdfme/validateTemplateSchemaNames.js';
import { emptyLabelInputs } from './labelInputs.js';
import {
  buildLabelMvtVariableMapFromInputs,
  fieldPlaceholderTemplate,
  parseMvtVariableNames,
  pickMvtVariablePayload,
  stripLabelTextPrefix,
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

function fieldStaticText(field: SchemaField): string {
  const content = typeof field.content === 'string' ? field.content.trim() : '';
  if (content && !content.includes('{')) return content;
  const text = typeof field.text === 'string' ? field.text.trim() : '';
  if (text && !text.includes('{')) return text;
  return '';
}

/** Поле з фіксованим текстом у Designer (не readOnly, але не з довідника inputs). */
function isStaticDesignerField(field: SchemaField): boolean {
  if (field.readOnly === true) return true;
  const name = typeof field.name === 'string' ? field.name.trim() : '';
  if (!name || !LABEL_INPUT_KEY_SET.has(name)) return true;
  const placeholder = fieldPlaceholderTemplate(field);
  if (placeholder && isKnownPlaceholderTemplate(placeholder)) return false;
  if (schemaType(field) === 'multiVariableText') return false;
  return false;
}

function valueForCatalogTextField(
  field: SchemaField,
  key: LabelInputKey,
  merged: LabelInputMap,
): string {
  const raw = merged[key] ?? '';
  const staticText = fieldStaticText(field).toLowerCase();

  if (key === 'expires_at') {
    return stripLabelTextPrefix(raw, PORTION_LABEL_STATIC.expiryLabel);
  }
  if (key === 'batch_number') {
    return stripLabelTextPrefix(raw, PORTION_LABEL_STATIC.batchLabel);
  }
  if (key === 'ingredients' && staticText.includes('склад')) {
    return stripLabelTextPrefix(raw, 'Склад:');
  }
  return raw;
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

      if (schemaType(field) === 'svg' || schemaType(field) === 'image') {
        const content = typeof field.content === 'string' ? field.content.trim() : '';
        if (content && !isStoredLabelSvgContentMissing(content)) {
          pdfmeInputs[name] = content;
        }
        continue;
      }

      const placeholderTemplate = fieldPlaceholderTemplate(field);
      if (schemaType(field) === 'text' && isKnownPlaceholderTemplate(placeholderTemplate)) {
        pdfmeInputs[name] = substituteMvtTemplate(placeholderTemplate, variables);
        continue;
      }

      if (isStaticDesignerField(field)) {
        continue;
      }

      pdfmeInputs[name] = valueForCatalogTextField(field, name as LabelInputKey, merged);
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

/** Невідомі імена, які очікують дані з картки (не статичний текст Designer). */
export function unknownDynamicSchemaNames(template: LabelPdfmeTemplate): string[] {
  const unknown = new Set(unknownTemplateSchemaNames(template));
  const dynamic: string[] = [];
  for (const page of template.schemas ?? []) {
    for (const raw of page) {
      const field = raw as SchemaField;
      const name = typeof field.name === 'string' ? field.name.trim() : '';
      if (!name || !unknown.has(name)) continue;
      if (isStaticDesignerField(field)) continue;
      dynamic.push(name);
    }
  }
  return dynamic;
}
