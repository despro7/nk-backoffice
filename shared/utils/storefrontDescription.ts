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

export type StorefrontPlaceholderValues = {
  netWeight?: string;
  grossWeight?: string;
  ingredients?: string;
  nutrition?: string;
  storage?: string;
  heating?: string;
  salt?: string;
  kitComponents?: string;
};

const STOREFRONT_SEMANTIC_PLACEHOLDERS: Array<keyof StorefrontPlaceholderValues> = [
  'netWeight',
  'grossWeight',
  'ingredients',
  'nutrition',
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
  netWeight: '',
  grossWeight: '',
  storage: '',
  heating: '',
  salt: '',
  kitComponents: '',
};

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
    nutrition: 'nutrition',
    netWeight: 'netWeight',
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

const STOREFRONT_BOUND_EMPTY_LABELS: Partial<Record<StorefrontBlockResolver, string>> = {
  ingredients: 'складу',
  nutrition: 'КБЖВ',
  netWeight: 'маси нетто',
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

/** Strip TipTap trailing empty paragraphs from block HTML before save/preview. */
export function normalizeStorefrontBlockHtml(html: string): string {
  let result = html.trim();
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
  if (!components.length) return '';
  const items = components
    .map((c) => {
      const name = escapeHtml(c.componentName.trim());
      const qty = Number(c.qty);
      const qtyText = Number.isFinite(qty) ? String(qty) : '1';
      return `<li>${name} × ${qtyText}</li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

export function normalizeIngredientTag(text: string): string {
  return text.trim().toLowerCase();
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
    weight: number | null;
  };
  nutrition: ProductNutritionJson | null;
  ingredientRows: Array<{ componentName: string; qty: number }>;
  grossLabel: string;
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

function blockNodeFromPreset(block: StorefrontBlockConfig): StorefrontDescriptionNode {
  const defaults = STOREFRONT_BUILTIN_DEFAULTS[block.id as keyof typeof STOREFRONT_BUILTIN_DEFAULTS];
  const template = block.template || defaults?.template || '';
  return {
    type: 'storefrontBlock',
    attrs: {
      blockId: block.id,
      resolver: block.resolver,
      template,
      overrideContent: null,
    },
  };
}

/** Build initial TipTap doc from preset blocks (marketing = freeform paragraphs in editor). */
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
    if (!block.enabled) continue;
    if (block.resolver === 'kitComponents' && !opts?.isKit) continue;
    content.push(blockNodeFromPreset(block));
  }

  return { type: 'doc', content };
}

export function ensureStorefrontDescriptionDoc(
  raw: string | null | undefined,
  presetBlocks: StorefrontBlockConfig[],
  opts?: { isKit?: boolean },
): StorefrontDescriptionDoc {
  const parsed = parseStorefrontDescriptionDoc(raw);
  if (parsed) return parsed;
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
  };
}

function resolveBlockNodeHtml(
  attrs: StorefrontBlockNodeAttrs,
  placeholders: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[],
): string | null {
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
): string {
  if (node.type === 'storefrontBlock') {
    const attrs = getBlockNodeAttrs(node);
    if (!attrs) return '';
    return resolveBlockNodeHtml(attrs, placeholders, metaKeys) || '';
  }

  if (node.type === 'paragraph') {
    const inner = renderInlineContent(node.content);
    if (!inner) return '';
    const cls = node.attrs?.class === 'storefront-marketing' ? ' class="storefront-marketing"' : '';
    return `<p${cls}>${inner}</p>`;
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const tag = node.type === 'bulletList' ? 'ul' : 'ol';
    const items = (node.content || [])
      .map((child) => renderTipTapNodeToHtml(child as StorefrontDescriptionNode, placeholders, metaKeys))
      .filter(Boolean)
      .join('');
    return items ? `<${tag}>${items}</${tag}>` : '';
  }

  if (node.type === 'listItem') {
    const inner = (node.content || [])
      .map((child) => renderTipTapNodeToHtml(child as StorefrontDescriptionNode, placeholders, metaKeys))
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
  grossLabel: string;
  storageTemplate: string;
  heatingTemplate: string;
  saltTemplate: string;
  kitComponentsHtml: string;
}): StorefrontBoundBlockValues {
  const ingredients = formatIngredientsList(input.ingredientsJson);
  const nutrition = input.nutrition ? stripHtmlToText(formatProductNutritionHtml(input.nutrition)) : '';
  const saltFromNutrition = input.nutrition?.salt?.trim()
    ? `Містить сіль. Сіль ${input.nutrition.salt.trim()}г на 100г продукту.`
    : input.saltTemplate;

  return {
    ingredients,
    nutrition,
    netWeight: input.netLabel,
    grossWeight: input.grossLabel,
    storage: input.storageTemplate,
    heating: input.heatingTemplate,
    salt: saltFromNutrition,
    kitComponents: input.kitComponentsHtml,
  };
}

export function resolveStorefrontDescriptionDocHtml(
  doc: StorefrontDescriptionDoc,
  placeholders: StorefrontPlaceholderValues,
  metaKeys: StorefrontMetaKeyConfig[] = [],
): string {
  return (doc.content || [])
    .map((node) => renderTipTapNodeToHtml(node, placeholders, metaKeys))
    .filter(Boolean)
    .join('\n');
}

export function resolveStorefrontBlockPreviewText(
  attrs: StorefrontBlockNodeAttrs,
  boundValues: StorefrontBoundBlockValues,
): string {
  const placeholders: StorefrontPlaceholderValues = { ...boundValues };
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
): string {
  const placeholders: StorefrontPlaceholderValues = { ...boundValues };
  const html = resolveBlockNodeHtml(attrs, placeholders, metaKeys);
  if (html) return html;

  if (isStorefrontProtectedBoundResolver(attrs.resolver)) {
    return '';
  }

  const raw = attrs.overrideContent?.trim() || attrs.template;
  const substituted = substituteStorefrontPlaceholders(raw, placeholders, metaKeys);
  if (!substituted.trim()) return '';
  return toHtmlBlock(substituted);
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
