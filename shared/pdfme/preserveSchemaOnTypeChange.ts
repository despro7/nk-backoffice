import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';

type SchemaField = Record<string, unknown>;

const STYLE_KEYS = [
  'position',
  'width',
  'height',
  'rotate',
  'opacity',
  'fontSize',
  'fontName',
  'fontColor',
  'alignment',
  'verticalAlignment',
  'lineHeight',
  'characterSpacing',
  'backgroundColor',
  'padding',
  'borderWidth',
  'borderColor',
  'underline',
  'strikethrough',
  'readOnly',
  'required',
] as const;

function fieldKey(field: SchemaField): string {
  const id = typeof field.id === 'string' ? field.id.trim() : '';
  if (id) return `id:${id}`;
  const name = typeof field.name === 'string' ? field.name.trim() : '';
  return name ? `name:${name}` : '';
}

function fieldType(field: SchemaField): string {
  return typeof field.type === 'string' ? field.type : '';
}

/** Витягує видимий текст до зміни типу (text / MVT / barcode). */
function extractVisibleText(field: SchemaField): string {
  const textProp = typeof field.text === 'string' ? field.text.trim() : '';
  const content = typeof field.content === 'string' ? field.content.trim() : '';
  if (fieldType(field) === 'multiVariableText') {
    if (textProp) return textProp;
    if (content.startsWith('{')) {
      try {
        const parsed = JSON.parse(content) as Record<string, string>;
        return Object.values(parsed).filter(Boolean).join(' ').trim();
      } catch {
        return content;
      }
    }
    return content;
  }
  if (content) return content;
  return textProp;
}

function applyContentForType(targetType: string, visibleText: string, prior: SchemaField): Partial<SchemaField> {
  if (!visibleText) return {};
  if (targetType === 'multiVariableText') {
    const out: Partial<SchemaField> = { text: visibleText };
    if (typeof prior.content === 'string' && prior.content.trim().startsWith('{')) {
      out.content = prior.content;
    } else if (/\{[a-zA-Z0-9_]+\}/.test(visibleText)) {
      out.content = JSON.stringify({});
    }
    return out;
  }
  if (targetType === 'text' || targetType === 'barcode' || targetType === 'svg') {
    return { content: visibleText };
  }
  return { content: visibleText };
}

function mergeFieldOnTypeChange(prior: SchemaField, next: SchemaField): SchemaField {
  const merged: SchemaField = { ...next };
  for (const key of STYLE_KEYS) {
    if (prior[key] !== undefined && prior[key] !== null) {
      merged[key] = prior[key];
    }
  }
  const visible = extractVisibleText(prior);
  Object.assign(merged, applyContentForType(fieldType(next), visible, prior));
  if (fieldType(next) === 'multiVariableText' && Array.isArray(prior.variables)) {
    merged.variables = prior.variables;
  }
  return merged;
}

function indexFields(template: LabelPdfmeTemplate): Map<string, SchemaField> {
  const map = new Map<string, SchemaField>();
  for (const page of template.schemas ?? []) {
    for (const raw of page) {
      const key = fieldKey(raw as SchemaField);
      if (key) map.set(key, raw as SchemaField);
    }
  }
  return map;
}

/**
 * Після зміни type у pdfme Designer поле підміняється defaultSchema нового типу.
 * Повертає шаблон із збереженими геометрією, шрифтами та текстом (де можливо).
 */
export function preserveSchemaOnTypeChange(
  previous: LabelPdfmeTemplate | null,
  next: LabelPdfmeTemplate,
): { template: LabelPdfmeTemplate; changed: boolean } {
  if (!previous) return { template: next, changed: false };

  const prevByKey = indexFields(previous);
  let changed = false;

  const schemas = (next.schemas ?? []).map((page) =>
    page.map((raw) => {
      const field = raw as SchemaField;
      const key = fieldKey(field);
      const prior = key ? prevByKey.get(key) : undefined;
      if (!prior || fieldType(prior) === fieldType(field)) return field;
      changed = true;
      return mergeFieldOnTypeChange(prior, field);
    }),
  );

  return {
    template: { ...next, schemas },
    changed,
  };
}
