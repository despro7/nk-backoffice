/** Канонічні ключі полів pdfme-шаблону наліпки. `name` у schema має збігатися з ключем. */
export const LABEL_INPUT_KEYS = [
  'title_line1',
  'title_line2',
  'ingredients',
  'nutrition_header',
  'nutrition_proteins',
  'nutrition_fats',
  'nutrition_carbs',
  'nutrition_energy',
  'nutrition_salt',
  'storage',
  'batch_number',
  'expires_at',
  'net_weight',
  'net_weight_label',
  'main_product_weight',
  'portions_per_box',
  'barcode',
  'manufacturer',
  'address',
  'warning',
  'qr_url',
  'logo_svg',
  'instruction_svg',
  'estimated_svg',
  'warning_icon',
] as const;

export type LabelInputKey = (typeof LABEL_INPUT_KEYS)[number];

export type LabelInputMap = Record<LabelInputKey, string>;

export const LABEL_INPUT_KEY_SET = new Set<string>(LABEL_INPUT_KEYS);

/** Ручне редагування лише для переносу заголовка; решта — з картки + MVT у Designer. */
export const LABEL_EDITABLE_KEYS: LabelInputKey[] = ['title_line1', 'title_line2'];

export const LABEL_INPUT_LABELS: Record<LabelInputKey, string> = {
  title_line1: 'Заголовок, рядок 1',
  title_line2: 'Заголовок, рядок 2',
  ingredients: 'Склад',
  nutrition_header: 'Заголовок поживної цінності',
  nutrition_proteins: 'Білки',
  nutrition_fats: 'Жири',
  nutrition_carbs: 'Вуглеводи',
  nutrition_energy: 'Енергетична цінність',
  nutrition_salt: 'Сіль',
  storage: 'Умови зберігання',
  batch_number: 'Номер партії',
  expires_at: 'Вжити до',
  net_weight: 'Маса нетто',
  net_weight_label: 'Підпис маси нетто',
  main_product_weight: 'Маса основного продукту',
  portions_per_box: 'Кількість порцій у коробці',
  barcode: 'Штрихкод',
  manufacturer: 'Виробник',
  address: 'Адреса виробництва',
  warning: 'Попередження',
  qr_url: 'URL QR-коду',
  logo_svg: 'Логотип (SVG)',
  instruction_svg: 'Інструкція (SVG)',
  estimated_svg: 'Знак ℮ (SVG)',
  warning_icon: 'Іконка попередження (SVG)',
};

export const LABEL_INPUTS_SCHEMA_VERSION = 2;
