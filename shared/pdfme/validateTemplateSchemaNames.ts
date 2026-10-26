import { LABEL_INPUT_KEY_SET } from '../constants/labelInputKeys.js';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { unknownMvtVariableNames } from '../utils/labelTemplateInputs.js';

export function collectTemplateSchemaNames(template: LabelPdfmeTemplate): string[] {
  const names: string[] = [];
  for (const page of template.schemas ?? []) {
    for (const schema of page) {
      const name = schema.name;
      if (typeof name === 'string' && name.trim()) names.push(name);
    }
  }
  return names;
}

/** Повертає імена полів, яких немає в канонічному реєстрі. */
export function unknownTemplateSchemaNames(template: LabelPdfmeTemplate): string[] {
  return collectTemplateSchemaNames(template).filter((name) => !LABEL_INPUT_KEY_SET.has(name));
}

export function assertTemplateSchemaNames(template: LabelPdfmeTemplate): void {
  const unknownMvt = unknownMvtVariableNames(template);
  if (unknownMvt.length > 0) {
    throw new Error(
      `Невідомі змінні multiVariableText: ${unknownMvt.join(', ')}. Див. labelMvtVariables.`,
    );
  }
  // Імена на кшталт field10 (pdfme Designer) дозволені — макет зберігається в templateJson;
  // привʼязка до картки товару лише для ключів з labelInputKeys (див. unknownTemplateSchemaNames).
}
