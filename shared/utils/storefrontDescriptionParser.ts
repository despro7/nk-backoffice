import { STOREFRONT_BUILTIN_DEFAULTS } from '../constants/storefrontDefaults.js';
import type {
  ProductNutritionJson,
  StorefrontBlockConfig,
  StorefrontDescriptionDoc,
  StorefrontMetaKeyConfig,
  StorefrontPullParseResult,
  WooCommerceProduct,
} from '../types/storefront.js';
import { STOREFRONT_WC_META } from '../types/storefront.js';
import { parseNutritionValues } from './productLabelNutrition.js';
import {
  buildStorefrontDescriptionDocFromPreset,
  normalizeIngredientTag,
  normalizeStorefrontBlockHtml,
} from './storefrontDescription.js';

function metaValueToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractNkMeta(product: WooCommerceProduct): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of product.meta_data || []) {
    if (!row.key.startsWith('_nk_')) continue;
    result[row.key] = metaValueToString(row.value);
  }
  return result;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Порожній рядок або HTML без видимого тексту (`<p></p>`, `<p><br></p>`). */
export function isEffectivelyEmptyHtml(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return !stripHtml(value).trim();
}

function splitIngredientsText(text: string): string[] {
  return text
    .split(/[,;•·]/)
    .map((part) => normalizeIngredientTag(part))
    .filter(Boolean);
}

function parseIngredientsFromHtml(html: string): string | null {
  const paragraphMatches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (paragraphMatches) {
    for (const paragraph of paragraphMatches) {
      if (!/Склад:/i.test(paragraph)) continue;
      const inner = paragraph
        .replace(/^<p[^>]*>/i, '')
        .replace(/<\/p>$/i, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const afterLabel = inner.match(/Склад:\s*(.+)/i);
      if (afterLabel?.[1]?.trim()) return afterLabel[1].trim();
    }
  }

  const plain = stripHtml(html);
  const match = plain.match(
    /Склад:\s*(.+?)(?=(?:Умови зберігання|Способи розігріву|Маса нетто|Маса брутто|Білки|Жири|Вуглеводи|Енергетична|$))/i,
  );
  return match?.[1]?.trim() || null;
}

function extractSection(html: string, keywords: string[]): string | null {
  const plain = stripHtml(html);
  for (const keyword of keywords) {
    const re = new RegExp(
      `${keyword}[:\\s]*(.+?)(?=(?:Умови зберігання|Способи розігріву|Маса нетто|Маса брутто|Склад:|Білки|Жири|Вуглеводи|Енергетична|$))`,
      'i',
    );
    const match = plain.match(re);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  const htmlRe = new RegExp(`<p[^>]*>[^<]*(?:${keywords.join('|')})[:\\s]*([^<]+)`, 'i');
  const htmlMatch = html.match(htmlRe);
  return htmlMatch?.[1]?.trim() || null;
}

function extractHeatingHtml(html: string): string | null {
  const idx = html.search(/Способи розігріву/i);
  if (idx < 0) return null;
  const slice = html.slice(idx);
  const endIdx = slice.search(/<p[^>]*>[^<]*Маса (?:нетто|брутто)/i);
  const chunk = endIdx > 0 ? slice.slice(0, endIdx) : slice;
  if (!chunk.trim()) return null;
  return chunk.trim();
}

export function extractMarketingPlainFromHtml(html: string): string | null {
  const chunk = extractMarketingHtml(html);
  const text = stripHtml(chunk);
  return text || null;
}

function extractMarketingHtml(html: string): string {
  const classMatch = html.match(/<p[^>]*class="[^"]*storefront-marketing[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (classMatch?.[1]) return classMatch[1].trim();

  const beforeIngredients = html.split(/<p[^>]*>[^<]*Склад:/i)[0] || '';
  const firstP = beforeIngredients.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (firstP?.[1]) return firstP[1].trim();

  const plain = stripHtml(html);
  const line = plain.split(/Склад:/i)[0]?.trim();
  return line || '';
}

function parseWeightFromHtml(html: string, label: 'нетто' | 'брутто'): string | null {
  const re = new RegExp(`Маса ${label}:\\s*([\\d,.]+)\\s*(?:кг|г)?`, 'i');
  const match = stripHtml(html).match(re);
  return match?.[1]?.trim() || null;
}

function nutritionFromMeta(meta: Record<string, string>): ProductNutritionJson | null {
  const raw = meta[STOREFRONT_WC_META.nutrition];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProductNutritionJson;
    if (parsed.proteins || parsed.fats || parsed.carbs || parsed.energy) return parsed;
  } catch {
    // fall through to text parse
  }
  const values = parseNutritionValues(raw);
  if (!values.proteins && !values.fats && !values.carbs && !values.energy) return null;
  return {
    proteins: values.proteins,
    fats: values.fats,
    carbs: values.carbs,
    energy: values.energy,
  };
}

function nutritionFromHtml(html: string): ProductNutritionJson | null {
  const nutritionLines: string[] = [];
  const paragraphMatches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (paragraphMatches) {
    for (const paragraph of paragraphMatches) {
      const text = stripHtml(paragraph);
      if (/^(Білки|Жири|Вуглеводи|Енергетична|Калорійність)/i.test(text)) {
        nutritionLines.push(text);
      }
    }
  }

  const nutritionChunk =
    nutritionLines.length > 0
      ? nutritionLines.join('\n')
      : stripHtml(html).match(
          /(Білки[\s\S]*?)(?=Умови зберігання|Способи розігріву|Маса нетто|Маса брутто|$)/i,
        )?.[1];

  if (!nutritionChunk) return null;
  const values = parseNutritionValues(nutritionChunk);
  if (!values.proteins && !values.fats && !values.carbs && !values.energy) return null;
  return {
    proteins: values.proteins,
    fats: values.fats,
    carbs: values.carbs,
    energy: values.energy,
  };
}

function setBlockOverride(
  doc: StorefrontDescriptionDoc,
  blockId: string,
  overrideContent: string | null,
): void {
  for (const node of doc.content) {
    if (node.type !== 'storefrontBlock') continue;
    const attrs = node.attrs as { blockId?: string; overrideContent?: string | null } | undefined;
    if (attrs?.blockId !== blockId) continue;
    attrs.overrideContent =
      overrideContent != null ? normalizeStorefrontBlockHtml(overrideContent) : null;
  }
}

function setMarketingParagraph(doc: StorefrontDescriptionDoc, html: string): void {
  const text = stripHtml(html);
  if (!text) return;
  const paragraph = doc.content.find(
    (node) =>
      node.type === 'paragraph' &&
      (node.attrs as { class?: string } | undefined)?.class === 'storefront-marketing',
  );
  if (paragraph) {
    paragraph.content = [{ type: 'text', text }];
    return;
  }
  doc.content.unshift({
    type: 'paragraph',
    attrs: { class: 'storefront-marketing' },
    content: [{ type: 'text', text }],
  });
}

export interface ParseWcDescriptionInput {
  product: WooCommerceProduct;
  presetBlocks: StorefrontBlockConfig[];
  metaKeys: StorefrontMetaKeyConfig[];
  isKit?: boolean;
}

export function parseWcDescription(input: ParseWcDescriptionInput): StorefrontPullParseResult {
  const warnings: string[] = [];
  const unparsed: string[] = [];
  const html = input.product.description || '';
  const nkMeta = extractNkMeta(input.product);

  const doc = buildStorefrontDescriptionDocFromPreset(input.presetBlocks, {
    isKit: input.isKit,
  });

  const marketing = extractMarketingHtml(html);
  if (marketing) {
    setMarketingParagraph(doc, marketing);
  } else if (html.trim()) {
    warnings.push('Маркетинговий абзац не розпізнано');
  }

  let ingredientsText = nkMeta[STOREFRONT_WC_META.ingredients] || '';
  if (!ingredientsText) {
    ingredientsText = parseIngredientsFromHtml(html) || '';
    if (!ingredientsText && html.includes('Склад')) {
      warnings.push('Склад не розпізнано з HTML');
    }
  }

  let nutrition = nutritionFromMeta(nkMeta);
  if (!nutrition) {
    nutrition = nutritionFromHtml(html);
    if (!nutrition && /Білки|Жири|Вуглеводи|Енергетична|Калорійність/i.test(html)) {
      warnings.push('КБЖВ не розпізнано');
    }
  }

  const storageText =
    nkMeta[STOREFRONT_WC_META.storage] ||
    extractSection(html, ['Умови зберігання', 'Зберігання']) ||
    '';
  if (storageText) {
    setBlockOverride(doc, 'storage', storageText);
  }

  const heatingHtml = extractHeatingHtml(html);
  if (heatingHtml) {
    setBlockOverride(doc, 'heating', heatingHtml);
  }

  const grossFromMeta = nkMeta[STOREFRONT_WC_META.grossWeight];
  const grossFromHtml = parseWeightFromHtml(html, 'брутто');
  if (grossFromMeta || grossFromHtml) {
    const label = grossFromMeta || grossFromHtml || '';
    setBlockOverride(
      doc,
      'grossWeight',
      STOREFRONT_BUILTIN_DEFAULTS.grossWeight.template.replace('{{grossWeight}}', label),
    );
  }

  const netFromHtml = parseWeightFromHtml(html, 'нетто');
  if (netFromHtml) {
    setBlockOverride(
      doc,
      'netWeight',
      STOREFRONT_BUILTIN_DEFAULTS.netWeight.template.replace('{{netWeight}}', netFromHtml),
    );
  }

  const ingredientTags = ingredientsText ? splitIngredientsText(ingredientsText) : [];

  if (!ingredientsText && !nutrition && !storageText && !heatingHtml && html.trim()) {
    unparsed.push(html.slice(0, 500));
  }

  return {
    storefrontDescriptionDoc: doc,
    productIngredientsJson: ingredientTags,
    productNutritionJson: nutrition,
    parseWarnings: warnings,
    unparsedHtmlChunks: unparsed,
  };
}

export function summarizeWcProduct(product: WooCommerceProduct): {
  nkMeta: Record<string, string>;
  unknownMeta: Array<{ key: string; value: string }>;
} {
  const nkMeta = extractNkMeta(product);
  const unknownMeta: Array<{ key: string; value: string }> = [];
  for (const row of product.meta_data || []) {
    if (row.key.startsWith('_') && !row.key.startsWith('_nk_')) continue;
    if (row.key.startsWith('_nk_')) continue;
    const value = metaValueToString(row.value);
    if (!value) continue;
    unknownMeta.push({ key: row.key, value: value.slice(0, 200) });
  }
  return { nkMeta, unknownMeta };
}
