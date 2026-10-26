import type { LabelTemplateAudience, LabelTemplateDefaults, LabelTemplateDto } from '../types/labelTemplate.js';
import type { ProductLabelKind } from '../types/productLabel.js';

const AUDIENCES: LabelTemplateAudience[] = ['good', 'kit'];

/** У комплектів немає окремих коробкових наліпок — лише порція. */
export function labelTemplateKindsForAudience(audience: LabelTemplateAudience): ProductLabelKind[] {
  if (audience === 'kit') return ['portion'];
  return ['portion', 'box'];
}

export function isLabelTemplateSlotEnabled(
  audience: LabelTemplateAudience,
  labelKind: ProductLabelKind,
): boolean {
  return labelTemplateKindsForAudience(audience).includes(labelKind);
}

export function labelTemplateDefaultSlots(): Array<{
  audience: LabelTemplateAudience;
  labelKind: ProductLabelKind;
}> {
  return AUDIENCES.flatMap((audience) =>
    labelTemplateKindsForAudience(audience).map((labelKind) => ({ audience, labelKind })),
  );
}

/** Прибирає templateId, що не відповідають аудиторії/слоту комірки (після зміни метаданих шаблону). */
export function sanitizeLabelTemplateDefaults(
  matrix: LabelTemplateDefaults,
  templates: LabelTemplateDto[],
): LabelTemplateDefaults {
  const byId = new Map(templates.map((row) => [row.id, row]));
  const next: LabelTemplateDefaults = {
    good: { portion: matrix.good.portion, box: matrix.good.box },
    kit: { portion: matrix.kit.portion, box: null },
  };

  for (const { audience, labelKind } of labelTemplateDefaultSlots()) {
    const templateId = next[audience][labelKind];
    if (!templateId) continue;
    const template = byId.get(templateId);
    if (!template || template.audience !== audience || template.labelKind !== labelKind) {
      next[audience][labelKind] = null;
    }
  }

  return next;
}

export function isLabelTemplateDefaultSlotMatch(
  template: Pick<LabelTemplateDto, 'id' | 'audience' | 'labelKind'>,
  audience: LabelTemplateAudience,
  labelKind: ProductLabelKind,
): boolean {
  return template.audience === audience && template.labelKind === labelKind;
}
