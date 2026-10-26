/** Lucide icon names for label template visual identity (DynamicIcon). */
export const LABEL_TEMPLATE_ICON_KEYS = [
  'tags',
  'scan-line',
  'sticker',
  'layout-template',
  'package',
  'box',
  'utensils',
  'layers',
  'star',
  'circle-dot',
  'sparkles',
  'badge',
] as const;

export type LabelTemplateIconKey = (typeof LABEL_TEMPLATE_ICON_KEYS)[number];

export const DEFAULT_LABEL_TEMPLATE_ICON: LabelTemplateIconKey = 'tags';

export const LABEL_TEMPLATE_ICON_LABELS: Record<LabelTemplateIconKey, string> = {
  tags: 'Теги',
  'scan-line': 'Штрихкод',
  sticker: 'Наліпка',
  'layout-template': 'Макет',
  package: 'Упаковка',
  box: 'Коробка',
  utensils: 'Порція',
  layers: 'Шари',
  star: 'Зірка',
  'circle-dot': 'Крапка',
  sparkles: 'Акцент',
  badge: 'Бейдж',
};

export function isLabelTemplateIconKey(value: string | null | undefined): value is LabelTemplateIconKey {
  if (!value) return false;
  return (LABEL_TEMPLATE_ICON_KEYS as readonly string[]).includes(value);
}

export function resolveLabelTemplateIconKey(value: string | null | undefined): LabelTemplateIconKey {
  return isLabelTemplateIconKey(value) ? value : DEFAULT_LABEL_TEMPLATE_ICON;
}
