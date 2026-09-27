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
  'nutrition',
  'storage',
  'heating',
  'netWeight',
  'grossWeight',
  'kitComponents',
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

export interface StorefrontSettingsDto {
  defaultPresetId: string | null;
  metaKeys: StorefrontMetaKeyConfig[];
  /** Phase 2 stub */
  wooCommerce: {
    enabled: false;
    siteUrl: string;
    consumerKey: string;
    consumerSecret: string;
  };
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

/** Live resolved values for storefrontBlock nodes in the editor */
export interface StorefrontBoundBlockValues {
  ingredients: string;
  nutrition: string;
  netWeight: string;
  grossWeight: string;
  storage: string;
  heating: string;
  salt: string;
  kitComponents: string;
}
