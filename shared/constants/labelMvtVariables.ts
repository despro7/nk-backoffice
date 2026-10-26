/**
 * Змінні для полів `multiVariableText` у pdfme Designer.
 * У шаблоні: `Білки {proteins} г`, `Номер партії: {batch}` тощо.
 */
export const LABEL_MVT_VARIABLE_KEYS = [
  'kcal',
  'proteins',
  'fats',
  'carbs',
  'salt',
  'batch',
  'expires',
  'ingredients',
  'net_weight',
  'net_weight_label',
  'main_product_weight',
  'portions_per_box',
  'nutrition_header',
  'storage',
  'manufacturer',
  'address',
  'warning',
] as const;

export type LabelMvtVariable = (typeof LABEL_MVT_VARIABLE_KEYS)[number];

export const LABEL_MVT_VARIABLE_SET = new Set<string>(LABEL_MVT_VARIABLE_KEYS);

/** Підказки для адмінів у Designer / Docs. */
export const LABEL_MVT_VARIABLE_LABELS: Record<LabelMvtVariable, string> = {
  kcal: 'Енергія (ккал, число)',
  proteins: 'Білки (число, без «г»)',
  fats: 'Жири (число)',
  carbs: 'Вуглеводи (число)',
  salt: 'Сіль (число)',
  batch: 'Номер партії',
  expires: 'Термін придатності (напр. 09.2027)',
  ingredients: 'Склад (без префікса «Склад:»)',
  net_weight: 'Маса нетто (напр. 380 г)',
  net_weight_label: 'Підпис «Маса нетто:»',
  main_product_weight: 'Маса основного продукту',
  portions_per_box: 'Кількість порцій у коробці (число)',
  nutrition_header: 'Заголовок блоку поживності',
  storage: 'Умови зберігання',
  manufacturer: 'Блок виробника',
  address: 'Адреса виробництва',
  warning: 'Попередження',
};
