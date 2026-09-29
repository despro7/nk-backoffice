import { PORTION_LABEL_STATIC } from './productLabelPortionStatic.js';
import type {
  StorefrontBlockConfig,
  StorefrontBlockId,
  StorefrontBlockResolver,
  StorefrontKitComponentCategoryConfig,
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
} from '../types/storefront.js';
import { STOREFRONT_BLOCK_IDS, STOREFRONT_WC_META } from '../types/storefront.js';

/** Default preset name (seeded on migration) */
export const STOREFRONT_DEFAULT_PRESET_NAME = 'Стандарт';

const HEATING_TEMPLATE_HTML = `<p>Способи розігріву:</p>
<ol>
<li>Розігріти у мікрохвильовій печі 2 хвилини при потужності 800 Вт (не розігрівати у пакеті).</li>
<li>Розігріти на сковорідці на середньому вогні 5–7 хвилин, періодично помішуючи.</li>
<li>Розігріти на паровій бані 10–15 хвилин до повного прогрівання.</li>
</ol>`;

const DEFAULT_TEMPLATES = {
  salt: 'Містить сіль. Рекомендована добова норма споживання солі для дорослої людини — не більше 5 г.',
  storage: PORTION_LABEL_STATIC.storageText,
  heating: HEATING_TEMPLATE_HTML,
  natural: 'Приготований з натуральних інгредієнтів без штучних барвників та консервантів.',
  netWeight: 'Маса нетто: {{netWeight}}',
  mainProductWeight: 'Маса осн. продукту: {{mainProductWeight}}',
  grossWeight: 'Маса брутто: {{grossWeight}}',
  ingredients: 'Склад: {{ingredients}}',
  nutrition: `<p>Енергетична цінність:</p>
<ul>
<li>Білки {{proteins}} г</li>
<li>Жири {{fats}} г</li>
<li>Вуглеводи {{carbs}} г</li>
<li>Калорійність {{energy}} ккал</li>
</ul>`,
  kitComponents: `{{#kitGroups}}
{{#if groupTotalQty > 1 || groupItemCount > 1}}
<h4>{{groupTotalQty}} {{groupTotalQtyLabel}} {{groupLabelGenitive}}{{groupWeightSuffix}}:</h4>
{{/if}}
<ul>
{{#kitItems}}
<li>{{name}} – {{qty}} {{qtyLabel}} {{#if qty > 1 }}по {{/if}}{{itemWeight}}</li>
{{/kitItems}}
</ul>
{{/kitGroups}}`,
} as const;

/** Дефолтні категорії компонентів комплекту (seed) */
export const STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS: StorefrontKitComponentSettings = {
  categories: [
    {
      id: 'kit-cat-first',
      label: 'Перші страви',
      genitive: 'перших страв',
      defaultWeightKg: 0.4,
      order: 1,
    },
    {
      id: 'kit-cat-second',
      label: 'Другі страви',
      genitive: 'других страв',
      defaultWeightKg: 0.3,
      order: 2,
    },
  ],
  fallbackGenitive: 'з інших категорій',
  fallbackDefaultWeightKg: 0.3,
  fallbackOrder: 100,
};

/** Default meta key registry (seed) */
export const STOREFRONT_DEFAULT_META_KEYS: StorefrontMetaKeyConfig[] = [
  { id: 'meta-ingredients', label: 'Склад', key: STOREFRONT_WC_META.ingredients },
  { id: 'meta-nutrition', label: 'КБЖВ', key: STOREFRONT_WC_META.nutrition },
  { id: 'meta-storage', label: 'Зберігання', key: STOREFRONT_WC_META.storage },
  { id: 'meta-gross-weight', label: 'Маса брутто', key: STOREFRONT_WC_META.grossWeight },
  {
    id: 'meta-main-product-weight',
    label: 'Маса осн. продукту',
    key: STOREFRONT_WC_META.mainProductWeight,
  },
];

type BuiltinDefaults = {
  label: string;
  resolver: StorefrontBlockResolver;
  template?: string;
  metaKeyId?: string | null;
};

export const STOREFRONT_BUILTIN_DEFAULTS: Record<StorefrontBlockId, BuiltinDefaults> = {
  natural: { label: 'Натуральність', resolver: 'template', template: DEFAULT_TEMPLATES.natural },
  salt: { label: 'Сіль', resolver: 'salt', template: DEFAULT_TEMPLATES.salt },
  ingredients: {
    label: 'Склад',
    resolver: 'ingredients',
    template: DEFAULT_TEMPLATES.ingredients,
    metaKeyId: 'meta-ingredients',
  },
  nutrition: {
    label: 'КБЖВ',
    resolver: 'nutrition',
    template: DEFAULT_TEMPLATES.nutrition,
    metaKeyId: 'meta-nutrition',
  },
  storage: {
    label: 'Зберігання',
    resolver: 'storage',
    template: DEFAULT_TEMPLATES.storage,
    metaKeyId: 'meta-storage',
  },
  heating: { label: 'Розігрів', resolver: 'heating', template: DEFAULT_TEMPLATES.heating },
  netWeight: { label: 'Маса нетто', resolver: 'netWeight', template: DEFAULT_TEMPLATES.netWeight },
  mainProductWeight: {
    label: 'Маса осн. продукту',
    resolver: 'mainProductWeight',
    template: DEFAULT_TEMPLATES.mainProductWeight,
    metaKeyId: 'meta-main-product-weight',
  },
  grossWeight: {
    label: 'Маса брутто',
    resolver: 'grossWeight',
    template: DEFAULT_TEMPLATES.grossWeight,
    metaKeyId: 'meta-gross-weight',
  },
  kitComponents: {
    label: 'Склад комплекту (kits)',
    resolver: 'kitComponents',
    template: DEFAULT_TEMPLATES.kitComponents,
  },
};

function buildBuiltinBlock(id: StorefrontBlockId, enabled: boolean): StorefrontBlockConfig {
  const defaults = STOREFRONT_BUILTIN_DEFAULTS[id];
  return {
    id,
    label: defaults.label,
    enabled,
    resolver: defaults.resolver,
    template: defaults.template ?? '',
    metaKeyId: defaults.metaKeyId ?? null,
  };
}

/** Default block order for new presets */
export const STOREFRONT_DEFAULT_BLOCKS: StorefrontBlockConfig[] = STOREFRONT_BLOCK_IDS.map((id) =>
  buildBuiltinBlock(id, id !== 'kitComponents' && id !== 'grossWeight'),
);

export const STOREFRONT_RESOLVER_HINTS: Record<StorefrontBlockResolver, string> = {
  template: 'Вільний текст; доступні {{netWeight}}, {{mainProductWeight}} та {{grossWeight}}',
  ingredients:
    'Плейсхолдер {{ingredients}} або {{_nk_ingredients}} — теги складу на вкладці «Контент»',
  nutrition:
    'Плейсхолдери {{proteins}}, {{fats}}, {{carbs}}, {{energy}}, {{nutritionSalt}}; {{nutrition}} — повний блок; {{_nk_nutrition}} — meta',
  storage: 'Шаблон нижче; можна override у редакторі опису',
  heating: 'Шаблон нижче; можна override у редакторі опису',
  salt: 'Шаблон нижче; можна override у редакторі опису',
  netWeight: 'Плейсхолдер {{netWeight}} — маса нетто з блоку «Упаковка»',
  mainProductWeight: 'Плейсхолдер {{mainProductWeight}} — маса осн. продукту з блоку «Упаковка»',
  grossWeight: 'Плейсхолдер {{grossWeight}} — маса брутто (legacy, auto з BOM)',
  kitComponents:
    'Шаблон з циклами та плейсхолдерами для групування компонентів комплекту за категоріями BOM',
};

export function storefrontBlockUsesTemplate(_resolver: StorefrontBlockResolver): boolean {
  return true;
}

const STOREFRONT_PROTECTED_BLOCK_IDS = new Set<StorefrontBlockId>([
  'ingredients',
  'nutrition',
  'kitComponents',
]);

/** Blocks tied to product/BOM data in preset settings — disable via switch, do not delete */
export function isStorefrontProtectedBlockId(id: string): id is StorefrontBlockId {
  return STOREFRONT_PROTECTED_BLOCK_IDS.has(id as StorefrontBlockId);
}

export function createCustomStorefrontBlock(label = 'Новий блок'): StorefrontBlockConfig {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    label,
    enabled: true,
    resolver: 'template',
    template: '',
    metaKeyId: null,
  };
}

export function createCustomStorefrontMetaKey(label = 'Новий meta-ключ'): StorefrontMetaKeyConfig {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `meta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, label, key: '' };
}

export function createCustomKitComponentCategory(
  label = 'Нова категорія',
  order = 100,
): StorefrontKitComponentCategoryConfig {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `kit-cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    label: label.trim(),
    genitive: label.trim() ? label.trim().toLowerCase() : '',
    defaultWeightKg: 0.3,
    order,
  };
}

function normalizeWeightMaxKg(
  minKg: number,
  maxKg: number | null | undefined,
): number | null {
  if (maxKg == null || !Number.isFinite(maxKg) || maxKg <= minKg) return null;
  return maxKg;
}

function isKitComponentCategoryConfig(row: unknown): row is StorefrontKitComponentCategoryConfig {
  if (!row || typeof row !== 'object') return false;
  const r = row as Partial<StorefrontKitComponentCategoryConfig>;
  return (
    typeof r.id === 'string' &&
    typeof r.label === 'string' &&
    typeof r.genitive === 'string' &&
    typeof r.defaultWeightKg === 'number' &&
    typeof r.order === 'number' &&
    (r.defaultWeightMaxKg === undefined ||
      r.defaultWeightMaxKg === null ||
      typeof r.defaultWeightMaxKg === 'number')
  );
}

export function normalizeStorefrontKitComponentSettings(
  input: unknown,
): StorefrontKitComponentSettings {
  if (!input || typeof input !== 'object') {
    return { ...STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS, categories: [...STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS.categories] };
  }

  const raw = input as Partial<StorefrontKitComponentSettings>;
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const categories: StorefrontKitComponentCategoryConfig[] = [];

  if (Array.isArray(raw.categories)) {
    for (const row of raw.categories) {
      if (!isKitComponentCategoryConfig(row)) continue;
      const label = row.label.trim();
      const genitive = row.genitive.trim();
      const id = row.id.trim();
      if (!id || !label || !genitive || seenIds.has(id) || seenLabels.has(label)) continue;
      const defaultWeightKg = Number.isFinite(row.defaultWeightKg) && row.defaultWeightKg > 0
        ? row.defaultWeightKg
        : 0.3;
      const defaultWeightMaxKg = normalizeWeightMaxKg(defaultWeightKg, row.defaultWeightMaxKg);
      const order = Number.isFinite(row.order) ? row.order : 100;
      seenIds.add(id);
      seenLabels.add(label);
      categories.push({ id, label, genitive, defaultWeightKg, defaultWeightMaxKg, order });
    }
  }

  const fallbackGenitive =
    typeof raw.fallbackGenitive === 'string' && raw.fallbackGenitive.trim()
      ? raw.fallbackGenitive.trim()
      : STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS.fallbackGenitive;
  const fallbackDefaultWeightKg =
    Number.isFinite(raw.fallbackDefaultWeightKg) && raw.fallbackDefaultWeightKg > 0
      ? raw.fallbackDefaultWeightKg
      : STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS.fallbackDefaultWeightKg;
  const fallbackDefaultWeightMaxKg = normalizeWeightMaxKg(
    fallbackDefaultWeightKg,
    raw.fallbackDefaultWeightMaxKg,
  );
  const fallbackOrder =
    Number.isFinite(raw.fallbackOrder)
      ? raw.fallbackOrder
      : STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS.fallbackOrder;

  categories.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'uk'));
  const normalizedCategories = categories.map((row, index) => ({
    ...row,
    order: index + 1,
  }));

  return {
    categories:
      normalizedCategories.length > 0
        ? normalizedCategories
        : [...STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS.categories],
    fallbackGenitive,
    fallbackDefaultWeightKg,
    fallbackDefaultWeightMaxKg,
    fallbackOrder,
  };
}

function isStorefrontBlockConfig(row: unknown): row is StorefrontBlockConfig {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Partial<StorefrontBlockConfig>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.resolver === 'string' &&
    typeof candidate.template === 'string' &&
    (candidate.metaKeyId === null || typeof candidate.metaKeyId === 'string')
  );
}

function sanitizeBlock(row: StorefrontBlockConfig, validMetaKeyIds: Set<string>): StorefrontBlockConfig {
  const label = row.label.trim() || 'Блок';
  const resolver = row.resolver in STOREFRONT_RESOLVER_HINTS ? row.resolver : 'template';
  const metaKeyId =
    row.metaKeyId && validMetaKeyIds.has(row.metaKeyId) ? row.metaKeyId : null;
  return {
    id: row.id.trim(),
    label,
    enabled: Boolean(row.enabled),
    resolver,
    template: row.template ?? '',
    metaKeyId,
  };
}

export function normalizeStorefrontBlocks(
  blocks: unknown[],
  metaKeys: StorefrontMetaKeyConfig[] = STOREFRONT_DEFAULT_META_KEYS,
): StorefrontBlockConfig[] {
  const validMetaKeyIds = new Set(metaKeys.map((row) => row.id));
  const seen = new Set<string>();
  const normalized: StorefrontBlockConfig[] = [];

  for (const row of blocks) {
    if (!isStorefrontBlockConfig(row)) continue;
    const block = sanitizeBlock(row, validMetaKeyIds);
    if (!block.id || seen.has(block.id)) continue;
    seen.add(block.id);
    normalized.push(block);
  }

  return normalized;
}

function isStorefrontMetaKeyConfig(row: unknown): row is StorefrontMetaKeyConfig {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Partial<StorefrontMetaKeyConfig>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.key === 'string'
  );
}

export function normalizeStorefrontMetaKeys(rows: unknown[]): StorefrontMetaKeyConfig[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const normalized: StorefrontMetaKeyConfig[] = [];

  for (const row of rows) {
    if (!isStorefrontMetaKeyConfig(row)) continue;
    const id = row.id.trim();
    const label = row.label.trim();
    const key = row.key.trim();
    if (!id || !label || !key || seenIds.has(id) || seenKeys.has(key)) continue;
    seenIds.add(id);
    seenKeys.add(key);
    normalized.push({ id, label, key });
  }

  return normalized.length > 0 ? normalized : [...STOREFRONT_DEFAULT_META_KEYS];
}

export function resolveStorefrontMetaKey(
  metaKeyId: string | null | undefined,
  metaKeys: StorefrontMetaKeyConfig[],
): string | null {
  if (!metaKeyId) return null;
  return metaKeys.find((row) => row.id === metaKeyId)?.key ?? null;
}

export const STOREFRONT_SETTINGS_KEYS = {
  metaKeys: 'storefront.metaKeys',
  kitComponentSettings: 'storefront.kitComponentSettings',
  defaultPresetId: 'storefront.defaultPresetId',
  woo: {
    siteUrl: 'storefront.woo.siteUrl',
    consumerKey: 'storefront.woo.consumerKey',
    consumerSecret: 'storefront.woo.consumerSecret',
    enabled: 'storefront.woo.enabled',
    mediaPublicBaseUrl: 'storefront.woo.mediaPublicBaseUrl',
  },
  sync: {
    autoPushOnSave: 'storefront.sync.autoPushOnSave',
    stockViaWc: 'storefront.sync.stockViaWc',
  },
} as const;

export const STOREFRONT_DEFAULT_STOCK_VIA_WC = 'legacy' as const;

export function getStorefrontDefaultKitComponentsTemplate(): string {
  return STOREFRONT_BUILTIN_DEFAULTS.kitComponents.template ?? '{{kitComponents}}';
}

export function hasStorefrontDefaultBlockTemplate(
  block: Pick<StorefrontBlockConfig, 'id' | 'resolver'>,
): boolean {
  if (block.resolver === 'kitComponents') return true;
  return Object.prototype.hasOwnProperty.call(STOREFRONT_BUILTIN_DEFAULTS, block.id);
}

export function getStorefrontDefaultBlockTemplate(
  block: Pick<StorefrontBlockConfig, 'id' | 'resolver'>,
): string {
  if (block.resolver === 'kitComponents') {
    return getStorefrontDefaultKitComponentsTemplate();
  }
  const defaults = STOREFRONT_BUILTIN_DEFAULTS[block.id as StorefrontBlockId];
  return defaults?.template ?? '';
}

export function metaKeysEqual(a: StorefrontMetaKeyConfig[], b: StorefrontMetaKeyConfig[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function kitComponentSettingsEqual(
  a: StorefrontKitComponentSettings,
  b: StorefrontKitComponentSettings,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
