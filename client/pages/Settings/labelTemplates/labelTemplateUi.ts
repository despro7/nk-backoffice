import type { LabelTemplateAudience } from '@shared/types/labelTemplate';
import type { ProductLabelKind } from '@shared/types/productLabel';

export const LABEL_TEMPLATE_AUDIENCE_LABEL: Record<LabelTemplateAudience, string> = {
  good: 'Продукція',
  kit: 'Комплекти',
};

export const LABEL_TEMPLATE_KIND_LABEL: Record<ProductLabelKind, string> = {
  portion: 'Порція',
  box: 'Коробка',
};
