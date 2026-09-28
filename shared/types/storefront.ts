/**
 * WooCommerce storefront sync — shared contract (Phase 1: BO-only, Phase 2: WC meta).
 */

/** Default WC meta key strings (seed only) */
export const STOREFRONT_WC_META = {
  ingredients: '_nk_ingredients',
  nutrition: '_nk_nutrition',
  storage: '_nk_storage',
  grossWeight: '_nk_gross_weight',
} as const;

/** Built-in block ids for default preset seed */
export const STOREFRONT_BLOCK_IDS = [
  'natural',
  'salt',
  'ingredients',
  'kitComponents',
  'nutrition',
  'storage',
  'heating',
  'netWeight',
  'grossWeight',
] as const;

export type StorefrontBlockId = (typeof STOREFRONT_BLOCK_IDS)[number];

/** Resolvers bound to structured product fields — read-only in TipTap editor */
export const STOREFRONT_PROTECTED_BOUND_RESOLVERS = [
  'ingredients',
  'nutrition',
  'netWeight',
  'grossWeight',
] as const;

export type StorefrontProtectedBoundResolver = (typeof STOREFRONT_PROTECTED_BOUND_RESOLVERS)[number];

/** How block content is resolved when assembling description */
export type StorefrontBlockResolver =
  | 'template'
  | 'ingredients'
  | 'nutrition'
  | 'storage'
  | 'heating'
  | 'salt'
  | 'netWeight'
  | 'grossWeight'
  | 'kitComponents';

/** Editable registry of WooCommerce meta keys */
export interface StorefrontMetaKeyConfig {
  id: string;
  /** Display name in UI */
  label: string;
  /** WooCommerce meta key, e.g. _nk_ingredients */
  key: string;
}

/** Категорія компонента комплекту (назва батьківської папки в каталозі) */
export interface StorefrontKitComponentCategoryConfig {
  id: string;
  /** Назва батьківської папки в каталозі, напр. «Перші страви» */
  label: string;
  /** Відмінок для заголовка групи, напр. «перших страв» */
  genitive: string;
  /** Дефолтна вага порції (кг), якщо у компонента не задано */
  defaultWeightKg: number;
  /** Верхня межа ваги порції (кг) для діапазону, напр. 0.45 → «400-450г» */
  defaultWeightMaxKg?: number | null;
  /** Порядок групи у виводі (визначається позицією в списку) */
  order: number;
}

export interface StorefrontKitComponentSettings {
  categories: StorefrontKitComponentCategoryConfig[];
  fallbackGenitive: string;
  fallbackDefaultWeightKg: number;
  /** Верхня межа fallback-ваги (кг) для діапазону */
  fallbackDefaultWeightMaxKg?: number | null;
  fallbackOrder: number;
}

export interface StorefrontBlockConfig {
  id: string;
  label: string;
  enabled: boolean;
  resolver: StorefrontBlockResolver;
  template: string;
  /** Reference to StorefrontMetaKeyConfig.id */
  metaKeyId: string | null;
}

/** Canonical nutrition JSON on catalog_goods.productNutritionJson */
export interface ProductNutritionJson {
  proteins: string;
  fats: string;
  carbs: string;
  energy: string;
  salt?: string;
  /** true when energy was set manually (disables Atwater auto-calc) */
  energyManual?: boolean;
}

/** TipTap storefront block node attrs inside storefrontDescriptionDoc */
export interface StorefrontBlockNodeAttrs {
  blockId: string;
  resolver: StorefrontBlockResolver;
  template: string;
  /** Plain/HTML override for overridable blocks only */
  overrideContent?: string | null;
}

export interface StorefrontDescriptionInlineNode {
  type: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface StorefrontDescriptionNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: StorefrontDescriptionNode[] | StorefrontDescriptionInlineNode[];
}

/** TipTap JSON root for catalog_goods.storefrontDescriptionDoc */
export interface StorefrontDescriptionDoc {
  type: 'doc';
  content: StorefrontDescriptionNode[];
}

export type StorefrontPublishStatus = 'publish' | 'draft';

export type StorefrontBlockSource = 'template' | 'product' | 'bom' | 'computed';

export interface StorefrontResolvedBlock {
  id: string;
  label: string;
  html: string;
  source: StorefrontBlockSource;
  metaKeyId: string | null;
  wcMetaKey: string | null;
}

export interface StorefrontPreviewResult {
  html: string;
  blocks: StorefrontResolvedBlock[];
}

/** Phase 2 stub — payload that would be sent to WC REST */
export interface StorefrontDryRunPushPayload {
  goodId: string;
  status: StorefrontPublishStatus;
  shortDescription: string | null;
  descriptionHtml: string;
  weight: number | null;
  grossWeightKg: number | null;
  meta: Record<string, string>;
}

export interface StorefrontPresetDto {
  id: string;
  name: string;
  isDefault: boolean;
  blocks: StorefrontBlockConfig[];
  createdAt: string;
  updatedAt: string;
}

export type StorefrontWooConnectionStatus = 'unconfigured' | 'ok' | 'error';

export interface StorefrontWooCommerceSettingsDto {
  enabled: boolean;
  siteUrl: string;
  /** Публічна URL backoffice для sideload зображень у WC (/uploads/catalog/…) */
  mediaPublicBaseUrl: string;
  consumerKey: string;
  /** Masked after save: cs_***last4 */
  consumerSecret: string;
  hasConsumerSecret: boolean;
  connectionStatus?: StorefrontWooConnectionStatus;
}

export interface StorefrontSettingsDto {
  defaultPresetId: string | null;
  metaKeys: StorefrontMetaKeyConfig[];
  kitComponentSettings: StorefrontKitComponentSettings;
  wooCommerce: StorefrontWooCommerceSettingsDto;
}

export interface StorefrontWooSettingsInput {
  enabled?: boolean;
  siteUrl?: string;
  mediaPublicBaseUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
}

export interface WooCommerceMetaData {
  id?: number;
  key: string;
  value: string | Record<string, unknown>;
}

export interface WooCommerceProduct {
  id: number;
  name: string;
  sku: string;
  description: string;
  short_description: string;
  regular_price: string;
  /** Актуальна ціна (може бути заповнена, коли regular_price порожній) */
  price?: string;
  weight: string;
  stock_quantity: number | null;
  status: string;
  meta_data: WooCommerceMetaData[];
  images?: Array<{ id: number; src: string; name: string; alt?: string }>;
}

export interface WooConnectionTestResult {
  ok: boolean;
  wcVersion?: string;
  productCount?: number;
  error?: string;
}

export interface WooInspectSummary {
  id: number;
  sku: string;
  name: string;
  descriptionLength: number;
  descriptionPreview: string;
  shortDescription: string;
  regularPrice: string;
  weight: string;
  stockQuantity: number | null;
  nkMeta: Record<string, string>;
  unknownMeta: Array<{ key: string; value: string }>;
}

export interface WooInspectResult {
  summary: WooInspectSummary;
  raw: WooCommerceProduct;
}

export interface StorefrontPullParseResult {
  storefrontDescriptionDoc: StorefrontDescriptionDoc;
  productIngredientsJson: string[];
  productNutritionJson: ProductNutritionJson | null;
  parseWarnings: string[];
  unparsedHtmlChunks: string[];
}

export interface WooPullConflict {
  field: string;
  localValue: string | null;
  remoteValue: string | null;
}

export interface WooPullLocalSnapshot {
  weight: number | null;
  regularPrice: string | null;
  doNotPublish: boolean;
  imageCount: number;
  storefrontDescriptionDoc: string | null;
  productIngredientsJson: string | null;
  productNutritionJson: string | null;
}

export interface WooPullPreviewResult {
  goodId: string;
  sku: string;
  wooProductId: number;
  wcRaw: WooCommerceProduct;
  local: WooPullLocalSnapshot;
  proposed: {
    fullDescription: string | null;
    shortDescription: string | null;
    weight: number | null;
    regularPrice: string | null;
    doNotPublish: boolean;
    imageCount: number;
    meta: Record<string, string>;
    parsed: StorefrontPullParseResult;
  };
  conflicts: WooPullConflict[];
}

export interface WooPullApplyInput {
  goodId: string;
  apply: {
    fullDescription?: boolean;
    shortDescription?: boolean;
    storefrontDescriptionDoc?: boolean;
    productIngredientsJson?: boolean;
    productNutritionJson?: boolean;
    weight?: boolean;
    regularPrice?: boolean;
    doNotPublish?: boolean;
    images?: boolean;
    replaceImages?: boolean;
    wooProductId?: boolean;
  };
}

export interface WooPullApplyResult {
  goodId: string;
  wooProductId: number;
  wooLastSyncedAt: string;
  appliedFields: string[];
}

export interface WooPushPreviewResult {
  goodId: string;
  sku: string;
  wooProductId: number | null;
  payload: StorefrontDryRunPushPayload;
  isCreate: boolean;
}

export interface WooPushApplyResult {
  goodId: string;
  wooProductId: number;
  wooLastSyncedAt: string;
  created: boolean;
  imagesUploaded?: number;
  imageErrors?: string[];
}

export interface WooPushBulkResult {
  results: Array<{
    goodId: string;
    sku: string;
    ok: boolean;
    error?: string;
    wooProductId?: number;
    created?: boolean;
  }>;
}

export interface WooMediaUploadResult {
  goodId: string;
  uploaded: Array<{ imageId: number; wooMediaId: number }>;
  errors: string[];
}

export interface WooMediaPullResult {
  goodId: string;
  imported: number;
  replaced: boolean;
  errors: string[];
}

export interface WooOrphanMediaItem {
  wooMediaId: number;
  src: string;
  name: string;
  linkedGoodId: string | null;
  linkedSku: string | null;
}

export interface WooOrphanAuditResult {
  orphans: WooOrphanMediaItem[];
  totalWcImages: number;
}

export interface StorefrontPresetInput {
  name: string;
  isDefault?: boolean;
  blocks: StorefrontBlockConfig[];
}

export interface StorefrontGrossResolveInput {
  grossWeight: number | null;
  weight: number | null;
  specQty: number | null;
  isKit: boolean;
  components: Array<{
    componentName: string;
    qty: number;
    unitId: string;
    componentWeight: number | null;
    cookingLossPercent?: number | null;
  }>;
  units: Array<{ id: string; name: string; code?: string | null }>;
}

export interface StorefrontGrossResolveResult {
  /** Resolved gross weight, kg */
  kg: number | null;
  /** Manual override on good */
  source: 'override' | 'computed' | 'none';
}

/** Окремі плейсхолдери КБЖВ у шаблоні блоку nutrition */
export const STOREFRONT_NUTRITION_PLACEHOLDER_KEYS = [
  'proteins',
  'fats',
  'carbs',
  'energy',
  'nutritionSalt',
] as const;

export type StorefrontNutritionPlaceholderKey = (typeof STOREFRONT_NUTRITION_PLACEHOLDER_KEYS)[number];

/** Live resolved values for storefrontBlock nodes in the editor */
export interface StorefrontBoundBlockValues {
  ingredients: string;
  /** Повний КБЖВ-блок (legacy {{nutrition}}) */
  nutrition: string;
  proteins: string;
  fats: string;
  carbs: string;
  energy: string;
  /** Сіль з productNutritionJson, г/100г */
  nutritionSalt: string;
  netWeight: string;
  grossWeight: string;
  storage: string;
  heating: string;
  salt: string;
  kitComponents: string;
}
