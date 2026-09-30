import { buildIngredientsTextFromBom, formatNetWeightLabel } from './productLabel.js';
import type { BomIngredientRow } from './productLabel.js';
import {
  calculateEnergyKcal,
  formatNutritionText,
  parseNutritionNumber,
  parseNutritionValues,
} from './productLabelNutrition.js';
import type {
  ProductNutritionJson,
  StorefrontBlockConfig,
  StorefrontBlockNodeAttrs,
  StorefrontBlockResolver,
  StorefrontBoundBlockValues,
  StorefrontDescriptionDoc,
  StorefrontDescriptionNode,
  StorefrontGrossResolveInput,
  StorefrontGrossResolveResult,
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
  StorefrontProtectedBoundResolver,
  StorefrontPublishStatus,
  StorefrontResolvedBlock,
} from '../types/storefront.js';
import {
  STOREFRONT_PROTECTED_BOUND_RESOLVERS,
  STOREFRONT_WC_META,
} from '../types/storefront.js';
import { STOREFRONT_BUILTIN_DEFAULTS } from '../constants/storefrontDefaults.js';
import {
  buildKitComponentsLegacyHtml,
  renderKitComponentsTemplate,
  resolveKitComponentsBlockTemplate,
  type KitComponentRow,
} from './kitComponentsTemplate.js';

export {
  renderKitComponentsTemplate,
  groupKitComponents,
  hasKitComponentLoops,
  resolveKitComponentsBlockTemplate,
} from './kitComponentsTemplate.js';
export type { KitComponentRow } from './kitComponentsTemplate.js';

export type StorefrontRenderOptions = {
  isKit?: boolean;
  kitComponentRows?: KitComponentRow[];
  kitComponentSettings?: StorefrontKitComponentSettings;
  /** Якщо задано — рендеряться лише блоки з цього набору (enabled у preset). */
  enabledBlockIds?: ReadonlySet<string>;
};

export type StorefrontPlaceholderValues = {
  netWeight?: string;
  mainProductWeight?: string;
  grossWeight?: string;
  ingredients?: string;
  /** Повний КБЖВ-блок (legacy {{nutrition}}) */
  nutrition?: string;
  proteins?: string;
  fats?: string;
  carbs?: string;
  energy?: string;
  nutritionSalt?: string;
  storage?: string;
  heating?: string;
  salt?: string;
  kitComponents?: string;
};

const STOREFRONT_SEMANTIC_PLACEHOLDERS: Array<keyof StorefrontPlaceholderValues> = [
  'netWeight',
  'mainProductWeight',
  'grossWeight',
  'ingredients',
  'nutrition',
  'proteins',
  'fats',
  'carbs',
  'energy',
  'nutritionSalt',
  'storage',
  'heating',
  'salt',
  'kitComponents',
];

const STOREFRONT_META_KEY_TO_PLACEHOLDER: Partial<Record<string, keyof StorefrontPlaceholderValues>> = {
  [STOREFRONT_WC_META.ingredients]: 'ingredients',
  [STOREFRONT_WC_META.nutrition]: 'nutrition',
  [STOREFRONT_WC_META.storage]: 'storage',
};

const EMPTY_BOUND_VALUES: StorefrontBoundBlockValues = {
  ingredients: '',
  nutrition: '',
  proteins: '',
  fats: '',
  carbs: '',
  energy: '',
  nutritionSalt: '',
  netWeight: '',
  mainProductWeight: '',
  grossWeight: '',
  storage: '',
  heating: '',
  salt: '',
  kitComponents: '',
};

export function buildNutritionPlaceholderValues(
  nutrition: ProductNutritionJson | null | undefined,
): Pick<
  StorefrontPlaceholderValues,
  'nutrition' | 'proteins' | 'fats' | 'carbs' | 'energy' | 'nutritionSalt'
> {
  if (!nutrition) {
    return {
      nutrition: '',
      proteins: '',
      fats: '',
      carbs: '',
      energy: '',
      nutritionSalt: '',
    };
  }

  return {
    proteins: nutrition.proteins?.trim() || '',
    fats: nutrition.fats?.trim() || '',
    carbs: nutrition.carbs?.trim() || '',
    energy: nutrition.energy?.trim() || '',
    nutritionSalt: nutrition.salt?.trim() || '',
    nutrition: formatProductNutritionHtml(nutrition),
  };
}

export function hasNutritionPlaceholderValues(values: StorefrontPlaceholderValues): boolean {
  return Boolean(
    values.nutrition?.trim() ||
      values.proteins?.trim() ||
      values.fats?.trim() ||
      values.carbs?.trim() ||
      values.energy?.trim() ||
      values.nutritionSalt?.trim(),
  );
}

/** Папка архіву Dilovod: «Архів – {parentName}». */
export function isArchiveFolderName(name: string): boolean {
  return /^Архів\s*[–-]/i.test(String(name || '').trim());
}

export function resolveStorefrontPublishStatus(input: {
  doNotPublish?: boolean;
  parentFolderName?: string | null;
}): StorefrontPublishStatus {
  if (input.doNotPublish) return 'draft';
  if (input.parentFolderName && isArchiveFolderName(input.parentFolderName)) return 'draft';
  return 'publish';
}

export function substitutePlaceholders(
  template: string,
  values: { netWeight?: string; grossWeight?: string },
): string {
  return substituteStorefrontPlaceholders(template, values);
}

export function substituteStorefrontPlaceholders(
  template: string,
  values: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[] = [],
): string {
  let result = template;
  for (const key of STOREFRONT_SEMANTIC_PLACEHOLDERS) {
    const value = values[key];
    if (value === undefined) continue;
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  for (const row of metaKeys) {
    const semanticKey = STOREFRONT_META_KEY_TO_PLACEHOLDER[row.key];
    if (!semanticKey) continue;
    const value = values[semanticKey];
    if (value === undefined) continue;
    const escapedKey = row.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
  }
  return result;
}

export function resolveStorefrontTemplate(
  template: string,
  primaryPlaceholder: keyof StorefrontPlaceholderValues,
  primaryValue: string,
  values: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[] = [],
): string {
  const normalizedTemplate = template.trim() || `{{${primaryPlaceholder}}}`;
  return substituteStorefrontPlaceholders(
    normalizedTemplate,
    { ...values, [primaryPlaceholder]: primaryValue },
    metaKeys,
  );
}

export function getStorefrontResolverPrimaryPlaceholder(
  resolver: StorefrontBlockResolver,
): string | null {
  const map: Partial<Record<StorefrontBlockResolver, keyof StorefrontPlaceholderValues>> = {
    ingredients: 'ingredients',
    netWeight: 'netWeight',
    mainProductWeight: 'mainProductWeight',
    grossWeight: 'grossWeight',
    kitComponents: 'kitComponents',
    salt: 'salt',
    storage: 'storage',
    heating: 'heating',
  };
  const key = map[resolver];
  return key ? `{{${key}}}` : null;
}

export function isStorefrontProtectedBoundResolver(
  resolver: string,
): resolver is StorefrontProtectedBoundResolver {
  return (STOREFRONT_PROTECTED_BOUND_RESOLVERS as readonly string[]).includes(resolver);
}

/** Bound blocks whose frame uses {{placeholder}} template editing in product drawer. */
export function isStorefrontTemplateBoundBlock(resolver: string): boolean {
  return isStorefrontProtectedBoundResolver(resolver) || resolver === 'kitComponents';
}

/** WYSIWYG mini-editor in product drawer — not for loop-based kitComponents templates. */
export function isStorefrontDrawerTemplateEditable(resolver: string): boolean {
  return isStorefrontTemplateBoundBlock(resolver) && resolver !== 'kitComponents';
}

const STOREFRONT_BOUND_EMPTY_LABELS: Partial<Record<StorefrontBlockResolver, string>> = {
  ingredients: 'складу',
  nutrition: 'КБЖВ',
  netWeight: 'маси нетто',
  mainProductWeight: 'маси осн. продукту',
  grossWeight: 'маси брутто',
  kitComponents: 'складу комплекту',
};

export function getStorefrontBoundBlockEmptyMessage(resolver: StorefrontBlockResolver): string {
  const label = STOREFRONT_BOUND_EMPTY_LABELS[resolver];
  if (label) return `Дані ${label} ще не заповнені у полях товару`;
  return 'Дані ще не заповнені у полях товару';
}

const STOREFRONT_TEMPLATE_PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;
const STOREFRONT_EDITOR_PLACEHOLDER_SPAN_RE =
  /<span[^>]*data-storefront-placeholder="(\w+)"[^>]*>[\s\S]*?<\/span>/gi;

/** TipTap inline atom markup for protected {{placeholders}} in bound-block template editor. */
export function templateHtmlForStorefrontEditor(template: string): string {
  return template.replace(
    STOREFRONT_TEMPLATE_PLACEHOLDER_RE,
    (_, key: string) => `<span data-storefront-placeholder="${key}">{{${key}}}</span>`,
  );
}

/** Plain-text display for a live placeholder value inside the template mini-editor. */
export function resolveStorefrontPlaceholderLiveDisplay(
  key: string,
  boundValues: StorefrontBoundBlockValues,
): string {
  const raw = boundValues[key as keyof StorefrontBoundBlockValues] ?? '';
  if (!raw.trim()) return '';
  if (/<[a-z][\s\S]*>/i.test(raw)) return stripHtmlToText(raw);
  return raw.trim();
}

/** Bound-block template editor HTML with read-only live placeholder values. */
export function templateHtmlForStorefrontEditorLive(
  template: string,
  boundValues: StorefrontBoundBlockValues,
): string {
  return template.replace(STOREFRONT_TEMPLATE_PLACEHOLDER_RE, (_, key: string) => {
    const live = resolveStorefrontPlaceholderLiveDisplay(key, boundValues);
    const inner = live ? escapeHtml(live) : 'немає даних';
    return `<span data-storefront-placeholder="${key}">${inner}</span>`;
  });
}

/** Serialize bound-block TipTap HTML back to template with {{placeholders}}. */
export function templateFromStorefrontEditorHtml(html: string): string {
  return normalizeStorefrontBlockHtml(
    html.replace(
      STOREFRONT_EDITOR_PLACEHOLDER_SPAN_RE,
      (_, key: string) => `{{${key}}}`,
    ),
  );
}

const STOREFRONT_TRAILING_EMPTY_P_RE =
  /<p(?:\s[^>]*)?>(?:\s|<br\s*\/?>|<br[^>]*>|&nbsp;)*<\/p>\s*$/i;

const STOREFRONT_LIST_ITEM_RE = /<li(\s[^>]*)?>([\s\S]*?)<\/li>/gi;

const STOREFRONT_EMPTY_INLINE_P_RE =
  /<p(\s[^>]*)?>(?:\s|<br\s*\/?>|<br[^>]*>|&nbsp;)*<\/p>/gi;

const STOREFRONT_INLINE_P_RE = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi;

function unwrapParagraphMarkup(inner: string): string {
  let result = inner.replace(STOREFRONT_EMPTY_INLINE_P_RE, '');
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(STOREFRONT_INLINE_P_RE, '$2');
  }
  return result;
}

/** Unwrap paragraph wrappers inside list items: <li><p>text</p></li> → <li>text</li>. */
export function unwrapListItemParagraphs(html: string): string {
  if (!/<li[\s>]/i.test(html)) return html;
  let result = html;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(STOREFRONT_LIST_ITEM_RE, (match, liAttrs = '', inner: string) => {
      const unwrapped = unwrapParagraphMarkup(inner);
      return unwrapped === inner ? match : `<li${liAttrs}>${unwrapped}</li>`;
    });
  }
  return result;
}

/** Replace em dash (—) with en dash (–) in WooCommerce imported text. */
export function normalizeWcTypography(text: string): string {
  return text.replace(/\u2014/g, '\u2013');
}

/** Normalize typography in HTML strings (block overrides, short description). */
export function normalizeWcTypographyInHtml(html: string): string {
  return normalizeWcTypography(html);
}

function normalizeWcTypographyInDescriptionNode(
  node: StorefrontDescriptionNode,
): StorefrontDescriptionNode {
  if (node.type === 'text' && 'text' in node && typeof node.text === 'string') {
    const text = normalizeWcTypography(node.text);
    return text === node.text ? node : { ...node, text };
  }

  const attrs = node.attrs as
    | {
        overrideContent?: string | null;
        template?: string;
      }
    | undefined;
  let nextAttrs = node.attrs;
  if (attrs?.overrideContent) {
    const overrideContent = normalizeWcTypographyInHtml(attrs.overrideContent);
    if (overrideContent !== attrs.overrideContent) {
      nextAttrs = { ...attrs, overrideContent };
    }
  }
  if (attrs?.template) {
    const template = normalizeWcTypographyInHtml(attrs.template);
    if (template !== attrs.template) {
      nextAttrs = { ...(nextAttrs ?? attrs), template };
    }
  }

  const content = node.content;
  if (!content?.length) {
    return nextAttrs === node.attrs ? node : { ...node, attrs: nextAttrs };
  }

  const nextContent = content.map(normalizeWcTypographyInDescriptionNode);
  const contentChanged = nextContent.some((child, idx) => child !== content[idx]);
  if (!contentChanged && nextAttrs === node.attrs) return node;
  return { ...node, attrs: nextAttrs, content: nextContent };
}

/** Normalize typography in TipTap storefront description doc (marketing text, block overrides). */
export function normalizeWcTypographyInStorefrontDoc(
  doc: StorefrontDescriptionDoc,
): StorefrontDescriptionDoc {
  const content = (doc.content || []).map(normalizeWcTypographyInDescriptionNode);
  const changed = content.some((node, idx) => node !== (doc.content || [])[idx]);
  return changed ? { ...doc, content } : doc;
}

/** Strip TipTap trailing empty paragraphs from block HTML before save/preview. */
export function normalizeStorefrontBlockHtml(html: string): string {
  let result = unwrapListItemParagraphs(html.trim());
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(STOREFRONT_TRAILING_EMPTY_P_RE, '').trimEnd();
  }
  return result;
}

function isEmptyTipTapParagraphNode(node: StorefrontDescriptionNode): boolean {
  if (node.type !== 'paragraph') return false;
  const content = node.content || [];
  if (content.length === 0) return true;
  return content.every((child) => {
    if (child.type === 'hardBreak') return true;
    if (child.type === 'text' && 'text' in child) {
      return !String(child.text ?? '').trim();
    }
    return false;
  });
}

/** Remove trailing empty paragraphs and normalize block override HTML in a doc. */
export function normalizeStorefrontDescriptionDoc(
  doc: StorefrontDescriptionDoc,
): StorefrontDescriptionDoc {
  const content = (doc.content || []).map((node) => {
    const attrs = getBlockNodeAttrs(node);
    if (!attrs) return node;
    const overrideContent =
      attrs.overrideContent != null
        ? normalizeStorefrontBlockHtml(attrs.overrideContent)
        : null;
    const template = normalizeStorefrontBlockHtml(attrs.template);
    if (overrideContent === attrs.overrideContent && template === attrs.template) return node;
    return {
      ...node,
      attrs: {
        ...node.attrs,
        template,
        overrideContent: overrideContent || null,
      },
    };
  });

  while (content.length > 0) {
    const last = content[content.length - 1];
    if (!isEmptyTipTapParagraphNode(last)) break;
    if (last.attrs?.class === 'storefront-marketing' && content.length === 1) break;
    content.pop();
  }

  return { ...doc, content };
}

export function formatGrossWeightLabel(weightKg: number | null | undefined): string {
  return formatNetWeightLabel(weightKg);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text → <p>; HTML-ish templates pass through. */
export function toHtmlBlock(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
}

export function buildKitComponentsHtml(
  components: Array<{ componentName: string; qty: number }>,
): string {
  return buildKitComponentsLegacyHtml(components);
}

export function normalizeIngredientTag(text: string): string {
  return text.trim().replace(/[.,;]+$/g, '').toLowerCase();
}

export function formatIngredientsList(items: string[]): string {
  return items.map(normalizeIngredientTag).filter(Boolean).join(', ');
}

export function buildIngredientsJsonFromBom(components: BomIngredientRow[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of components) {
    const tag = normalizeIngredientTag(row.componentName);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function parseProductIngredientsJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeIngredientTag(String(item))).filter(Boolean);
  } catch {
    return [];
  }
}

export function stringifyProductIngredientsJson(items: string[] | null | undefined): string | null {
  if (!items?.length) return null;
  const normalized = items.map(normalizeIngredientTag).filter(Boolean);
  return normalized.length ? JSON.stringify(normalized) : null;
}

export function ingredientsListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
}

export function parseProductNutritionJson(raw: string | null | undefined): ProductNutritionJson | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ProductNutritionJson>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      proteins: String(parsed.proteins ?? ''),
      fats: String(parsed.fats ?? ''),
      carbs: String(parsed.carbs ?? ''),
      energy: String(parsed.energy ?? ''),
      salt: parsed.salt != null ? String(parsed.salt) : undefined,
      energyManual: Boolean(parsed.energyManual),
    };
  } catch {
    return null;
  }
}

export function stringifyProductNutritionJson(values: ProductNutritionJson | null | undefined): string | null {
  if (!values) return null;
  const payload: ProductNutritionJson = {
    proteins: values.proteins ?? '',
    fats: values.fats ?? '',
    carbs: values.carbs ?? '',
    energy: values.energy ?? '',
  };
  if (values.salt?.trim()) payload.salt = values.salt.trim();
  if (values.energyManual) payload.energyManual = true;
  return JSON.stringify(payload);
}

export function patchProductNutritionWithAutoEnergy(
  current: ProductNutritionJson,
  key: keyof ProductNutritionJson,
  nextValue: string,
): ProductNutritionJson {
  const next: ProductNutritionJson = { ...current, [key]: nextValue };
  if (key === 'energy') {
    return { ...next, energyManual: nextValue.trim().length > 0 };
  }
  if (!current.energyManual) {
    const autoEnergy = calculateEnergyKcal({
      proteins: next.proteins,
      fats: next.fats,
      carbs: next.carbs,
    });
    if (autoEnergy) {
      next.energy = autoEnergy;
    }
  }
  return next;
}

export function formatProductNutritionHtml(values: ProductNutritionJson | null | undefined): string {
  if (!values) return '';
  const base = formatNutritionText({
    proteins: values.proteins,
    fats: values.fats,
    carbs: values.carbs,
    energy: values.energy,
  });
  const lines = base.split('\n').map((line) => escapeHtml(line));
  if (values.salt?.trim()) {
    lines.push(escapeHtml(`Сіль ${values.salt.trim()}г`));
  }
  return lines.map((line) => `<p>${line}</p>`).join('');
}

function massUnitToKgFactor(
  unit: { name: string; code?: string | null } | undefined,
): number | null {
  if (!unit) return null;
  const name = unit.name.trim().toLowerCase().replace(/\./g, '');
  const code = (unit.code || '').trim().toLowerCase().replace(/\./g, '');
  const token = `${name} ${code}`;
  if (/^(кг|kg|кілограм)/.test(name) || /^(кг|kg)$/.test(code)) return 1;
  if (/(^| )(л|l|літр|литр|lt|liter)/.test(token) && !/(мл|ml|мілілітр|миллилитр)/.test(token)) {
    return 1;
  }
  if (/^(г|гр|грам|g)/.test(name) && !/кілограм/.test(name)) return 0.001;
  if (/^(мл|ml|мілілітр|миллилитр)/.test(name) || /^(мл|ml)$/.test(code)) return 0.001;
  return null;
}

function clampCookingLossPercent(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function bomRowNetKg(
  row: { qty: number; unitId: string; componentWeight: number | null },
  unitById: Map<string, { id: string; name: string; code?: string | null }>,
): number | null {
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const massFactor = massUnitToKgFactor(unitById.get(row.unitId));
  if (massFactor != null) return qty * massFactor;
  const w = row.componentWeight;
  if (w != null && Number.isFinite(w) && w > 0) return qty * w;
  return null;
}

function computeBomGrossKg(input: StorefrontGrossResolveInput): number | null {
  const { components, units, specQty, isKit } = input;
  if (!components.length) return null;

  const unitById = new Map(units.map((u) => [u.id, u]));
  const safeSpecQty = Number.isFinite(specQty) && specQty != null && specQty > 0 ? specQty : 1;
  const scale = 1 / safeSpecQty;

  let totalGross = 0;
  let hasMass = false;

  for (const c of components) {
    const netRecipe = bomRowNetKg(c, unitById);
    if (netRecipe == null) continue;
    const netTotal = netRecipe * scale;
    const loss = isKit ? 0 : clampCookingLossPercent(c.cookingLossPercent);
    const grossTotal = loss < 100 && !isKit ? netTotal / (1 - loss / 100) : netTotal;
    totalGross += grossTotal;
    hasMass = true;
  }

  if (!hasMass) return null;
  return Math.round(totalGross * 1000) / 1000;
}

export function resolveGrossWeightKg(input: StorefrontGrossResolveInput): StorefrontGrossResolveResult {
  if (input.grossWeight != null && Number.isFinite(input.grossWeight) && input.grossWeight > 0) {
    return { kg: input.grossWeight, source: 'override' };
  }
  const computed = computeBomGrossKg(input);
  if (computed != null) return { kg: computed, source: 'computed' };
  return { kg: null, source: 'none' };
}

export function resolveIngredientsText(
  ingredientsJson: string[] | null | undefined,
  components: Array<{ componentName: string; qty?: number }>,
): { text: string; source: 'product' | 'bom' } {
  const manual = formatIngredientsList(ingredientsJson || []);
  if (manual) return { text: manual, source: 'product' };
  const auto = buildIngredientsTextFromBom(components);
  if (auto) return { text: auto, source: 'bom' };
  return { text: '', source: 'bom' };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type BlockMetaContext = {
  good: {
    productIngredientsJson: string | null;
    productNutritionJson: string | null;
    grossWeight: number | null;
    mainProductWeight: number | null;
    weight: number | null;
  };
  nutrition: ProductNutritionJson | null;
  ingredientRows: Array<{ componentName: string; qty: number }>;
  grossLabel: string;
  mainProductLabel: string;
};

/** Value for WC meta field based on block resolver */
export function extractBlockMetaValue(
  block: StorefrontBlockConfig,
  resolved: StorefrontResolvedBlock,
  ctx: BlockMetaContext,
): string | null {
  if (!resolved.wcMetaKey) return null;

  if (resolved.wcMetaKey === STOREFRONT_WC_META.grossWeight) {
    return ctx.good.grossWeight != null ? String(ctx.good.grossWeight) : ctx.grossLabel || null;
  }

  if (resolved.wcMetaKey === STOREFRONT_WC_META.mainProductWeight) {
    return ctx.good.mainProductWeight != null
      ? String(ctx.good.mainProductWeight)
      : ctx.mainProductLabel || null;
  }

  switch (block.resolver) {
    case 'ingredients': {
      const ingredients = parseProductIngredientsJson(ctx.good.productIngredientsJson);
      const { text } = resolveIngredientsText(ingredients, ctx.ingredientRows);
      return text || null;
    }
    case 'nutrition':
      return ctx.nutrition ? JSON.stringify(ctx.nutrition) : null;
    default:
      return resolved.html.trim() ? stripHtmlToText(resolved.html) : null;
  }
}

export function nutritionJsonToText(values: ProductNutritionJson | null): string {
  if (!values) return '';
  const base = formatNutritionText(values);
  if (!values.salt?.trim()) return base;
  return `${base}\nСіль ${values.salt.trim()}г`;
}

export function nutritionTextToJson(text: string): ProductNutritionJson {
  const values = parseNutritionValues(text);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const saltLine = lines.find((l) => l.toLowerCase().startsWith('сіль'));
  const saltMatch = saltLine?.match(/([\d,.]+)/);
  return {
    proteins: values.proteins,
    fats: values.fats,
    carbs: values.carbs,
    energy: values.energy,
    salt: saltMatch?.[1]?.trim(),
  };
}

export function parseStorefrontDescriptionDoc(
  raw: string | null | undefined,
): StorefrontDescriptionDoc | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as StorefrontDescriptionDoc;
    if (!parsed || parsed.type !== 'doc' || !Array.isArray(parsed.content)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function stringifyStorefrontDescriptionDoc(doc: StorefrontDescriptionDoc): string {
  return JSON.stringify(doc);
}

/** Parse, normalize structure/typography — for form hydration without spurious dirty state. */
export function prepareStorefrontDescriptionDocForForm(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  const parsed = parseStorefrontDescriptionDoc(raw);
  if (!parsed) return raw;
  const prepared = normalizeStorefrontDescriptionDoc(normalizeWcTypographyInStorefrontDoc(parsed));
  return stringifyStorefrontDescriptionDoc(prepared);
}

export function createStorefrontBlockNodeAttrsFromPreset(
  block: StorefrontBlockConfig,
  opts?: { manualInclude?: boolean },
): StorefrontBlockNodeAttrs {
  const defaults = STOREFRONT_BUILTIN_DEFAULTS[block.id as keyof typeof STOREFRONT_BUILTIN_DEFAULTS];
  const rawTemplate = block.template || defaults?.template || '';
  const template =
    block.resolver === 'kitComponents'
      ? resolveKitComponentsBlockTemplate(rawTemplate)
      : rawTemplate;
  return {
    blockId: block.id,
    resolver: block.resolver,
    template,
    overrideContent: null,
    manualInclude: opts?.manualInclude ? true : null,
    manualExclude: null,
  };
}

/** Чи показувати блок у товарі: увімкнений у preset або явно доданий через пікер. */
export function isStorefrontBlockActiveInProduct(
  attrs: StorefrontBlockNodeAttrs,
  renderOptions?: StorefrontRenderOptions,
): boolean {
  const enabledIds = renderOptions?.enabledBlockIds;
  if (!enabledIds?.size) return true;
  if (enabledIds.has(attrs.blockId)) return true;
  return attrs.manualInclude === true;
}

export function createStorefrontBlockNodeFromPreset(
  block: StorefrontBlockConfig,
): StorefrontDescriptionNode {
  return {
    type: 'storefrontBlock',
    attrs: createStorefrontBlockNodeAttrsFromPreset(block),
  };
}

/** Preset blocks available in product drawer block picker (includes disabled). */
export function getStorefrontPickerPresetBlocks(
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): StorefrontBlockConfig[] {
  return presetBlocks.filter((block) => {
    if (opts?.isKit && block.resolver === 'ingredients') return false;
    if (!opts?.isKit && block.resolver === 'kitComponents') return false;
    return true;
  });
}

function blockNodeFromPreset(block: StorefrontBlockConfig): StorefrontDescriptionNode {
  return createStorefrontBlockNodeFromPreset(block);
}

/** Id блоків preset, які мають бути в doc (лише enabled). */
export function getStorefrontEnabledBlockIds(
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): Set<string> {
  const ids = new Set<string>();
  for (const block of presetBlocks) {
    if (opts?.isKit && block.resolver === 'ingredients') continue;
    if (!opts?.isKit && block.resolver === 'kitComponents') continue;
    const forceKitComponents = Boolean(opts?.isKit && block.resolver === 'kitComponents');
    if (!block.enabled && !forceKitComponents) continue;
    ids.add(block.id);
  }
  return ids;
}

function resolveStorefrontPresetBlockTemplate(block: StorefrontBlockConfig): string {
  if (block.resolver === 'kitComponents') {
    return resolveKitComponentsBlockTemplate(block.template);
  }
  return block.template ?? '';
}

function shouldSyncBlockTemplateFromPreset(resolver: StorefrontBlockResolver): boolean {
  return resolver === 'kitComponents';
}

function docBlockTemplateMatchesPreset(
  attrs: StorefrontBlockNodeAttrs,
  presetBlock: StorefrontBlockConfig,
): boolean {
  const presetTemplate = resolveStorefrontPresetBlockTemplate(presetBlock);
  if (attrs.resolver === 'kitComponents') {
    return resolveKitComponentsBlockTemplate(attrs.template) === presetTemplate;
  }
  return attrs.template === presetTemplate;
}

export function storefrontDescriptionNeedsPresetSync(
  doc: StorefrontDescriptionDoc,
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): boolean {
  const enabledIds = getStorefrontEnabledBlockIds(presetBlocks, opts);
  const renderOptions: StorefrontRenderOptions = { enabledBlockIds: enabledIds, isKit: opts?.isKit };
  const blocks = walkStorefrontDescriptionBlocks(doc);
  const presetById = new Map(presetBlocks.map((block) => [block.id, block]));

  for (const attrs of blocks) {
    if (!isStorefrontBlockActiveInProduct(attrs, renderOptions)) return true;
    const presetBlock = presetById.get(attrs.blockId);
    if (
      presetBlock &&
      shouldSyncBlockTemplateFromPreset(attrs.resolver) &&
      !docBlockTemplateMatchesPreset(attrs, presetBlock)
    ) {
      return true;
    }
  }

  const actualIds = new Set(blocks.map((block) => block.blockId));
  for (const id of enabledIds) {
    if (!actualIds.has(id)) return true;
  }
  return false;
}

/** Додає відсутні увімкнені блоки; прибирає вимкнені без manualInclude. */
export function syncStorefrontDescriptionDocWithPreset(
  doc: StorefrontDescriptionDoc,
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): StorefrontDescriptionDoc {
  const enabledIds = getStorefrontEnabledBlockIds(presetBlocks, opts);
  const renderOptions: StorefrontRenderOptions = { enabledBlockIds: enabledIds, isKit: opts?.isKit };
  const presetById = new Map(presetBlocks.map((block) => [block.id, block]));
  const filteredContent = (doc.content || [])
    .filter((node) => {
      const attrs = getBlockNodeAttrs(node);
      if (!attrs) return true;
      return isStorefrontBlockActiveInProduct(attrs, renderOptions);
    })
    .map((node) => {
      const attrs = getBlockNodeAttrs(node);
      if (!attrs) return node;
      const presetBlock = presetById.get(attrs.blockId);
      if (
        !presetBlock ||
        !shouldSyncBlockTemplateFromPreset(attrs.resolver) ||
        docBlockTemplateMatchesPreset(attrs, presetBlock)
      ) {
        return node;
      }
      const nextTemplate = resolveStorefrontPresetBlockTemplate(presetBlock);
      return {
        ...node,
        attrs: {
          ...node.attrs,
          template: nextTemplate,
        },
      };
    });

  const existingBlockIds = new Set(
    walkStorefrontDescriptionBlocks({ type: 'doc', content: filteredContent }).map(
      (block) => block.blockId,
    ),
  );
  const blocksToAdd: StorefrontDescriptionNode[] = [];

  for (const block of presetBlocks) {
    if (opts?.isKit && block.resolver === 'ingredients') continue;
    if (!opts?.isKit && block.resolver === 'kitComponents') continue;
    const forceKitComponents = Boolean(opts?.isKit && block.resolver === 'kitComponents');
    if (!block.enabled && !forceKitComponents) continue;
    if (existingBlockIds.has(block.id)) continue;
    blocksToAdd.push(blockNodeFromPreset(block));
  }

  const nextContent = blocksToAdd.length > 0
    ? [...filteredContent, ...blocksToAdd]
    : filteredContent;

  return normalizeStorefrontDescriptionDoc({
    type: 'doc',
    content: nextContent,
  });
}

function normalizeKitComponentsTemplatesInDoc(doc: StorefrontDescriptionDoc): StorefrontDescriptionDoc {
  let changed = false;
  const content = (doc.content || []).map((node) => {
    if (node.type !== 'storefrontBlock' || !node.attrs) return node;
    const attrs = node.attrs as Partial<StorefrontBlockNodeAttrs>;
    if (attrs.resolver !== 'kitComponents') return node;
    const nextTemplate = resolveKitComponentsBlockTemplate(String(attrs.template ?? ''));
    if (nextTemplate === String(attrs.template ?? '')) return node;
    changed = true;
    return {
      ...node,
      attrs: {
        ...attrs,
        template: nextTemplate,
      },
    };
  });
  if (!changed) return doc;
  return { ...doc, content };
}

export function buildStorefrontDescriptionDocFromPreset(
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): StorefrontDescriptionDoc {
  const content: StorefrontDescriptionNode[] = [
    {
      type: 'paragraph',
      attrs: { class: 'storefront-marketing' },
      content: [],
    },
  ];

  for (const block of presetBlocks) {
    if (opts?.isKit && block.resolver === 'ingredients') continue;
    if (!opts?.isKit && block.resolver === 'kitComponents') continue;
    const forceKitComponents = Boolean(opts?.isKit && block.resolver === 'kitComponents');
    if (!block.enabled && !forceKitComponents) continue;
    content.push(blockNodeFromPreset(block));
  }

  return normalizeKitComponentsTemplatesInDoc({ type: 'doc', content });
}

export function ensureStorefrontDescriptionDoc(
  raw: string | null | undefined,
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): StorefrontDescriptionDoc {
  const parsed = parseStorefrontDescriptionDoc(raw);
  if (parsed) {
    return normalizeKitComponentsTemplatesInDoc(
      syncStorefrontDescriptionDocWithPreset(parsed, presetBlocks, opts),
    );
  }
  return buildStorefrontDescriptionDocFromPreset(presetBlocks, opts);
}

function getBlockNodeAttrs(node: StorefrontDescriptionNode): StorefrontBlockNodeAttrs | null {
  if (node.type !== 'storefrontBlock' || !node.attrs) return null;
  const attrs = node.attrs as Partial<StorefrontBlockNodeAttrs>;
  if (!attrs.blockId || !attrs.resolver) return null;
  return {
    blockId: String(attrs.blockId),
    resolver: attrs.resolver as StorefrontBlockResolver,
    template: String(attrs.template ?? ''),
    overrideContent: attrs.overrideContent != null ? String(attrs.overrideContent) : null,
    manualInclude: attrs.manualInclude === true ? true : null,
    manualExclude: attrs.manualExclude === true ? true : null,
  };
}

function resolveBlockNodeHtml(
  attrs: StorefrontBlockNodeAttrs,
  placeholders: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[],
  renderOptions?: StorefrontRenderOptions,
): string | null {
  if (attrs.manualExclude) return null;
  if (!isStorefrontBlockActiveInProduct(attrs, renderOptions)) return null;
  if (renderOptions?.isKit && attrs.resolver === 'ingredients') return null;

  if (attrs.resolver === 'kitComponents') {
    const rows = renderOptions?.kitComponentRows ?? [];
    const html = renderKitComponentsTemplate(
      attrs.template,
      rows,
      renderOptions?.kitComponentSettings,
    );
    if (!html.trim()) return null;
    return normalizeStorefrontBlockHtml(html);
  }

  if (attrs.resolver === 'nutrition') {
    if (!hasNutritionPlaceholderValues(placeholders)) return null;
    const text = substituteStorefrontPlaceholders(attrs.template, placeholders, metaKeys);
    if (!text.trim()) return null;
    return toHtmlBlock(text);
  }

  const primaryKey = getStorefrontResolverPrimaryPlaceholder(attrs.resolver);
  const primaryValue =
    primaryKey?.replace(/^\{\{|\}\}$/g, '') as keyof StorefrontPlaceholderValues | undefined;
  const boundValue = primaryValue ? placeholders[primaryValue] ?? '' : '';

  if (isStorefrontProtectedBoundResolver(attrs.resolver)) {
    if (!boundValue.trim()) return null;
    const text = resolveStorefrontTemplate(
      attrs.template,
      primaryValue as keyof StorefrontPlaceholderValues,
      boundValue,
      placeholders,
      metaKeys,
    );
    return toHtmlBlock(text);
  }

  const raw = normalizeStorefrontBlockHtml(attrs.overrideContent?.trim() || attrs.template);
  const text = substituteStorefrontPlaceholders(raw, placeholders, metaKeys);
  if (!text.trim()) return null;
  return normalizeStorefrontBlockHtml(toHtmlBlock(text));
}

function renderTipTapNodeToHtml(
  node: StorefrontDescriptionNode,
  placeholders: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[],
  renderOptions?: StorefrontRenderOptions,
): string {
  if (node.type === 'storefrontBlock') {
    const attrs = getBlockNodeAttrs(node);
    if (!attrs) return '';
    return resolveBlockNodeHtml(attrs, placeholders, metaKeys, renderOptions) || '';
  }

  if (node.type === 'paragraph') {
    const inner = renderInlineContent(node.content);
    if (!inner) return '';
    const cls = node.attrs?.class === 'storefront-marketing' ? ' class="storefront-marketing"' : '';
    return `<p${cls}>${inner}</p>`;
  }

  if (node.type === 'heading') {
    const level = Number(node.attrs?.level);
    if (!Number.isInteger(level) || level < 1 || level > 6) return '';
    const inner = renderInlineContent(node.content);
    if (!inner) return '';
    return `<h${level}>${inner}</h${level}>`;
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const tag = node.type === 'bulletList' ? 'ul' : 'ol';
    const items = (node.content || [])
      .map((child) =>
        renderTipTapNodeToHtml(child as StorefrontDescriptionNode, placeholders, metaKeys, renderOptions),
      )
      .filter(Boolean)
      .join('');
    return items ? `<${tag}>${items}</${tag}>` : '';
  }

  if (node.type === 'listItem') {
    const children = node.content || [];
    const hasBlockChild = children.some(
      (child) => child.type !== 'text' && child.type !== 'hardBreak',
    );
    if (!hasBlockChild) {
      const inner = renderInlineContent(children);
      return inner ? `<li>${inner}</li>` : '';
    }
    if (children.length === 1 && children[0].type === 'paragraph') {
      const paragraph = children[0] as StorefrontDescriptionNode;
      const inner = renderInlineContent(paragraph.content);
      return inner ? `<li>${inner}</li>` : '';
    }
    const inner = children
      .map((child) =>
        renderTipTapNodeToHtml(child as StorefrontDescriptionNode, placeholders, metaKeys, renderOptions),
      )
      .join('');
    return inner ? `<li>${inner}</li>` : '';
  }

  if (node.type === 'hardBreak') return '<br>';

  return '';
}

function renderInlineContent(
  nodes: StorefrontDescriptionNode[] | StorefrontDescriptionInlineNode[] | undefined,
): string {
  if (!nodes?.length) return '';
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '<br>';
      if (node.type !== 'text' || !('text' in node)) return '';
      let text = escapeHtml(String(node.text));
      for (const mark of node.marks || []) {
        if (mark.type === 'bold') text = `<strong>${text}</strong>`;
        if (mark.type === 'italic') text = `<em>${text}</em>`;
        if (mark.type === 'strike') text = `<s>${text}</s>`;
        if (mark.type === 'link' && mark.attrs?.href) {
          text = `<a href="${escapeHtml(String(mark.attrs.href))}">${text}</a>`;
        }
      }
      return text;
    })
    .join('');
}

type StorefrontDescriptionInlineNode = {
  type: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

export function buildStorefrontBoundValues(input: {
  ingredientsJson: string[];
  nutrition: ProductNutritionJson | null;
  netLabel: string;
  mainProductLabel: string;
  grossLabel: string;
  storageTemplate: string;
  heatingTemplate: string;
  saltTemplate: string;
  kitComponentRows?: KitComponentRow[];
  kitComponentsTemplate?: string;
  kitComponentsHtml?: string;
  kitComponentSettings?: StorefrontKitComponentSettings;
}): StorefrontBoundBlockValues {
  const ingredients = formatIngredientsList(input.ingredientsJson);
  const nutritionParts = buildNutritionPlaceholderValues(input.nutrition);
  const nutrition = nutritionParts.nutrition
    ? stripHtmlToText(nutritionParts.nutrition)
    : '';
  const saltFromNutrition = input.nutrition?.salt?.trim()
    ? `Містить сіль. Сіль ${input.nutrition.salt.trim()}г на 100г продукту.`
    : input.saltTemplate;

  return {
    ingredients,
    nutrition,
    proteins: nutritionParts.proteins,
    fats: nutritionParts.fats,
    carbs: nutritionParts.carbs,
    energy: nutritionParts.energy,
    nutritionSalt: nutritionParts.nutritionSalt,
    netWeight: input.netLabel,
    mainProductWeight: input.mainProductLabel,
    grossWeight: input.grossLabel,
    storage: input.storageTemplate,
    heating: input.heatingTemplate,
    salt: saltFromNutrition,
    kitComponents:
      input.kitComponentsHtml ??
      (input.kitComponentRows?.length
        ? renderKitComponentsTemplate(
            input.kitComponentsTemplate || STOREFRONT_BUILTIN_DEFAULTS.kitComponents.template || '{{kitComponents}}',
            input.kitComponentRows,
            input.kitComponentSettings,
          )
        : ''),
  };
}

export function resolveStorefrontDescriptionDocHtml(
  doc: StorefrontDescriptionDoc,
  placeholders: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[] = [],
  renderOptions?: StorefrontRenderOptions,
): string {
  return (doc.content || [])
    .map((node) => renderTipTapNodeToHtml(node, placeholders, metaKeys, renderOptions))
    .filter(Boolean)
    .join('\n');
}

export function resolveStorefrontBlockPreviewText(
  attrs: StorefrontBlockNodeAttrs,
  boundValues: StorefrontBoundBlockValues,
): string {
  const placeholders: StorefrontPlaceholderValues = { ...boundValues };

  if (attrs.resolver === 'nutrition') {
    if (!hasNutritionPlaceholderValues(placeholders)) return attrs.template;
    return substituteStorefrontPlaceholders(attrs.template, placeholders);
  }

  const primaryKey = getStorefrontResolverPrimaryPlaceholder(attrs.resolver);
  const semanticKey = primaryKey?.replace(/^\{\{|\}\}$/g, '') as keyof StorefrontPlaceholderValues | undefined;

  if (isStorefrontProtectedBoundResolver(attrs.resolver) && semanticKey) {
    const value = placeholders[semanticKey] || '';
    if (!value.trim()) return attrs.template;
    return resolveStorefrontTemplate(attrs.template, semanticKey, value, placeholders);
  }

  const raw = attrs.overrideContent?.trim() || attrs.template;
  return substituteStorefrontPlaceholders(raw, placeholders);
}

/** HTML preview for a single storefront block (same pipeline as WC export). */
export function resolveStorefrontBlockPreviewHtml(
  attrs: StorefrontBlockNodeAttrs,
  boundValues: StorefrontBoundBlockValues,
  metaKeys: StorefrontMetaKeyConfig[] = [],
  renderOptions?: StorefrontRenderOptions,
): string {
  const placeholders: StorefrontPlaceholderValues = { ...boundValues };
  const html = resolveBlockNodeHtml(attrs, placeholders, metaKeys, renderOptions);
  if (html) return html;

  if (isStorefrontProtectedBoundResolver(attrs.resolver)) {
    return '';
  }

  const raw = normalizeStorefrontBlockHtml(attrs.overrideContent?.trim() || attrs.template);
  const substituted = substituteStorefrontPlaceholders(raw, placeholders, metaKeys);
  if (!substituted.trim()) return '';
  return normalizeStorefrontBlockHtml(toHtmlBlock(substituted));
}

export function walkStorefrontDescriptionBlocks(
  doc: StorefrontDescriptionDoc,
): StorefrontBlockNodeAttrs[] {
  const blocks: StorefrontBlockNodeAttrs[] = [];
  for (const node of doc.content || []) {
    const attrs = getBlockNodeAttrs(node);
    if (attrs) blocks.push(attrs);
  }
  return blocks;
}

export function patchStorefrontBlockOverride(
  doc: StorefrontDescriptionDoc,
  blockId: string,
  overrideContent: string | null,
): StorefrontDescriptionDoc {
  return {
    ...doc,
    content: (doc.content || []).map((node) => {
      const attrs = getBlockNodeAttrs(node);
      if (!attrs || attrs.blockId !== blockId) return node;
      if (isStorefrontProtectedBoundResolver(attrs.resolver)) return node;
      return {
        ...node,
        attrs: { ...node.attrs, overrideContent },
      };
    }),
  };
}
