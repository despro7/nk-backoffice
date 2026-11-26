/* global structuredClone */
import type {
  LabelFieldApplyAction,
  LabelFieldApplyPart,
  LabelPdfmeTemplate,
} from '../types/labelTemplate.js';

type SchemaField = Record<string, unknown>;

export const ESTIMATED_SIGN_FIELD_NAME = 'estimated_svg';

export const LABEL_FIELD_PART_KEYS: Record<Exclude<LabelFieldApplyPart, 'all'>, readonly string[]> = {
  geometry: ['position', 'width', 'height', 'rotate'],
  font: [
    'fontName',
    'fontSize',
    'dynamicFontSize',
    'lineHeight',
    'characterSpacing',
    'alignment',
    'verticalAlignment',
    'fontColor',
    'backgroundColor',
    'overflow',
    'padding',
    'borderWidth',
    'borderColor',
    'underline',
    'strikethrough',
    'opacity',
  ],
  content: ['content', 'text', 'variables'],
};

export interface ApplyLabelFieldOptions {
  parts: readonly LabelFieldApplyPart[];
  removeEstimatedSign?: boolean;
}

export interface ApplyLabelFieldResult {
  template: LabelPdfmeTemplate;
  action: LabelFieldApplyAction;
  removedEstimatedSign: boolean;
}

function fieldType(field: SchemaField): string {
  return typeof field.type === 'string' ? field.type : 'text';
}

function mergeField(
  target: SchemaField,
  source: SchemaField,
  parts: readonly LabelFieldApplyPart[],
): SchemaField {
  if (parts.includes('all')) {
    const next = structuredClone(source);
    // `id` належить цільовому макету, а не джерелу.
    delete next.id;
    if (target.id !== undefined) next.id = target.id;
    return next;
  }

  if (parts.includes('content') && fieldType(target) !== fieldType(source)) {
    // content multiVariableText (JSON) і text несумісні.
    throw new Error(
      `Тип поля «${String(source.name)}» відрізняється (${fieldType(target)} / ${fieldType(source)}): вміст можна перенести лише разом з усім полем`,
    );
  }

  const next: SchemaField = { ...target };
  for (const part of parts) {
    if (part === 'all') continue;
    for (const key of LABEL_FIELD_PART_KEYS[part]) {
      // Немає в джерелі (напр. вимкнений dynamicFontSize) – прибираємо і в цілі.
      if (source[key] === undefined) delete next[key];
      else next[key] = structuredClone(source[key]);
    }
  }
  return next;
}

/**
 * Переносить одне поле макету в інший шаблон: оновлює однойменні поля на будь-якій сторінці
 * або додає все поле на першу сторінку. Інші поля не змінює (крім видалення знака ℮ за запитом).
 */
export function applyLabelFieldToTemplate(
  template: LabelPdfmeTemplate,
  field: SchemaField,
  { parts, removeEstimatedSign = false }: ApplyLabelFieldOptions,
): ApplyLabelFieldResult {
  const name = typeof field.name === 'string' ? field.name : '';
  if (!name.trim()) throw new Error('Поле без імені перенести не можна');
  if (parts.length === 0) throw new Error('Не обрано, що копіювати');
  if (removeEstimatedSign && name === ESTIMATED_SIGN_FIELD_NAME) {
    throw new Error(`Не можна одночасно копіювати й видаляти ${ESTIMATED_SIGN_FIELD_NAME}`);
  }

  let replaced = false;
  let removedEstimatedSign = false;

  const schemas = (template.schemas ?? []).map((page) => {
    const nextPage: SchemaField[] = [];
    for (const current of page) {
      if (removeEstimatedSign && current.name === ESTIMATED_SIGN_FIELD_NAME) {
        removedEstimatedSign = true;
        continue;
      }
      if (current.name === name) {
        replaced = true;
        nextPage.push(mergeField(current, field, parts));
        continue;
      }
      nextPage.push(current);
    }
    return nextPage;
  });

  if (!replaced) {
    const added = structuredClone(field);
    delete added.id;
    if (schemas.length === 0) schemas.push([]);
    schemas[0] = [...schemas[0], added];
  }

  return {
    template: { ...template, schemas },
    action: replaced ? 'replaced' : 'added',
    removedEstimatedSign,
  };
}
