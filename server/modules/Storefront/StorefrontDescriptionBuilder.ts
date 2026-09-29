/**
 * Assembles WooCommerce product description HTML from storefrontDescriptionDoc + product fields.
 */

import { prisma } from '../../lib/utils.js';
import { CATALOG_ACC_POLICY_KIT } from '../../../shared/types/catalog.js';
import {
  STOREFRONT_BUILTIN_DEFAULTS,
  resolveStorefrontMetaKey,
} from '../../../shared/constants/storefrontDefaults.js';
import type {
  StorefrontBlockConfig,
  StorefrontDryRunPushPayload,
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
  StorefrontPreviewResult,
  StorefrontResolvedBlock,
} from '../../../shared/types/storefront.js';
import { STOREFRONT_WC_META } from '../../../shared/types/storefront.js';
import { formatNetWeightLabel } from '../../../shared/utils/productLabel.js';
import {
  ensureStorefrontDescriptionDoc,
  extractBlockMetaValue,
  formatGrossWeightLabel,
  buildNutritionPlaceholderValues,
  hasNutritionPlaceholderValues,
  parseProductIngredientsJson,
  parseProductNutritionJson,
  renderKitComponentsTemplate,
  resolveGrossWeightKg,
  resolveIngredientsText,
  resolveStorefrontDescriptionDocHtml,
  resolveStorefrontPublishStatus,
  resolveStorefrontTemplate,
  substituteStorefrontPlaceholders,
  toHtmlBlock,
  walkStorefrontDescriptionBlocks,
  type KitComponentRow,
  type StorefrontPlaceholderValues,
  type StorefrontRenderOptions,
} from '../../../shared/utils/storefrontDescription.js';
import { productsDilovodGateway } from '../Products/ProductsDilovodGateway.js';
import { storefrontService } from './StorefrontService.js';

type GoodRow = {
  id: string;
  name: string;
  description: string | null;
  weight: number | null;
  grossWeight: number | null;
  mainProductWeight: number | null;
  specQty: number | null;
  accPolicyId: string | null;
  parentId: string | null;
  doNotPublish: boolean;
  storefrontPresetId: string | null;
  productIngredientsJson: string | null;
  productNutritionJson: string | null;
  storefrontDescriptionDoc: string | null;
  components: Array<{
    componentGoodId: string;
    qty: number;
    unitId: string | null;
    cookingLossPercent: number | null;
    componentGood: { name: string; weight: number | null } | null;
  }>;
};

type ResolveCtx = {
  good: GoodRow;
  isKit: boolean;
  metaKeys: StorefrontMetaKeyConfig[];
  presetBlocks: StorefrontBlockConfig[];
  netLabel: string;
  mainProductLabel: string;
  grossLabel: string;
  nutrition: ReturnType<typeof parseProductNutritionJson>;
  ingredientRows: Array<{ componentName: string; qty: number }>;
  bomComponents: Array<{
    componentName: string;
    qty: number;
    unitId: string | null;
    componentWeight: number | null;
    cookingLossPercent: number | null;
    componentCategoryName: string | null;
  }>;
  kitComponentRows: KitComponentRow[];
  kitComponentSettings: StorefrontKitComponentSettings;
};

type LoadCtx = Awaited<ReturnType<StorefrontDescriptionBuilder['loadContext']>>;

export class StorefrontDescriptionBuilder {
  async previewHtml(goodId: string): Promise<StorefrontPreviewResult> {
    const loaded = await this.loadContext(goodId);
    const ctx = this.toResolveCtx(loaded);
    const blocks = this.assembleBlocks(ctx);
    const html = this.renderDocHtml(ctx);
    return { html, blocks };
  }

  async dryRunPush(goodId: string): Promise<StorefrontDryRunPushPayload> {
    const loaded = await this.loadContext(goodId);
    const ctx = this.toResolveCtx(loaded);
    const blocks = this.assembleBlocks(ctx);
    const html = this.renderDocHtml(ctx);
    const gross = resolveGrossWeightKg({
      grossWeight: ctx.good.grossWeight,
      weight: ctx.good.weight,
      specQty: ctx.good.specQty,
      isKit: ctx.isKit,
      components: loaded.bomComponents,
      units: loaded.units,
    });

    const resolveCtx = ctx;

    const meta: StorefrontDryRunPushPayload['meta'] = {};
    const grossMetaKey = resolveCtx.metaKeys.find((row) => row.key === STOREFRONT_WC_META.grossWeight)?.key;
    if (gross.kg != null && grossMetaKey) {
      meta[grossMetaKey] = String(gross.kg);
    }

    for (const blockConfig of resolveCtx.presetBlocks) {
      if (!blockConfig.enabled || !blockConfig.metaKeyId) continue;
      const wcMetaKey = resolveStorefrontMetaKey(blockConfig.metaKeyId, resolveCtx.metaKeys);
      if (!wcMetaKey || wcMetaKey === grossMetaKey) continue;
      const resolved = this.resolvePresetBlock(blockConfig, resolveCtx);
      if (!resolved) continue;
      const value = extractBlockMetaValue(blockConfig, resolved, resolveCtx);
      if (value) meta[wcMetaKey] = value;
    }

    return {
      goodId: loaded.good.id,
      name: loaded.good.name?.trim() || null,
      status: resolveStorefrontPublishStatus({
        doNotPublish: resolveCtx.good.doNotPublish,
        parentFolderName: loaded.parentFolderName,
      }),
      shortDescription: resolveCtx.good.description,
      descriptionHtml: html,
      weight: resolveCtx.good.weight,
      grossWeightKg: gross.kg,
      categoryName: loaded.parentFolderName,
      meta,
    };
  }

  private async loadContext(goodId: string) {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      include: {
        components: {
          orderBy: { rowNum: 'asc' },
          include: {
            componentGood: { select: { name: true, weight: true, parentId: true } },
          },
        },
      },
    });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');

    let parentFolderName: string | null = null;
    if (good.parentId) {
      const parent = await prisma.catalogGood.findUnique({
        where: { id: good.parentId },
        select: { name: true },
      });
      parentFolderName = parent?.name ?? null;
    }

    const settings = await storefrontService.getSettings();
    let preset = good.storefrontPresetId
      ? await storefrontService.getPreset(good.storefrontPresetId)
      : null;
    if (!preset) preset = await storefrontService.getDefaultPreset();

    const unitsList = await productsDilovodGateway.fetchCachedDict('units').catch(() => [
      { id: good.mainUnitId || '1103600000000001', name: 'шт.', code: 'pcs' },
    ]);

    const isKit = good.accPolicyId === CATALOG_ACC_POLICY_KIT;
    const componentParentIds = [
      ...new Set(
        good.components
          .map((c) => c.componentGood?.parentId)
          .filter((parentId): parentId is string => Boolean(parentId)),
      ),
    ];
    const componentParents =
      componentParentIds.length > 0
        ? await prisma.catalogGood.findMany({
            where: { id: { in: componentParentIds } },
            select: { id: true, name: true },
          })
        : [];
    const componentParentNameById = new Map(componentParents.map((row) => [row.id, row.name]));

    const bomComponents = good.components.map((c) => {
      const parentId = c.componentGood?.parentId;
      return {
        componentName: c.componentGood?.name || c.componentGoodId,
        qty: c.qty,
        unitId: c.unitId || good.mainUnitId || '1103600000000001',
        componentWeight: c.componentGood?.weight ?? null,
        cookingLossPercent: c.cookingLossPercent,
        componentCategoryName: parentId ? componentParentNameById.get(parentId) ?? null : null,
      };
    });

    const kitComponentRows: KitComponentRow[] = bomComponents.map((row) => ({
      componentName: row.componentName,
      qty: row.qty,
      componentWeight: row.componentWeight,
      componentCategoryName: row.componentCategoryName,
    }));

    const ingredientRows = bomComponents.map((c) => ({
      componentName: c.componentName,
      qty: c.qty,
    }));

    return {
      good: good as GoodRow,
      isKit,
      parentFolderName,
      presetBlocks: preset.blocks,
      metaKeys: settings.metaKeys,
      kitComponentSettings: settings.kitComponentSettings,
      bomComponents,
      kitComponentRows,
      ingredientRows,
      units: unitsList,
    };
  }

  private toResolveCtx(loaded: LoadCtx): ResolveCtx {
    const gross = resolveGrossWeightKg({
      grossWeight: loaded.good.grossWeight,
      weight: loaded.good.weight,
      specQty: loaded.good.specQty,
      isKit: loaded.isKit,
      components: loaded.bomComponents,
      units: loaded.units,
    });

    return {
      good: loaded.good,
      isKit: loaded.isKit,
      metaKeys: loaded.metaKeys,
      presetBlocks: loaded.presetBlocks,
      netLabel: formatNetWeightLabel(loaded.good.weight),
      mainProductLabel: formatGrossWeightLabel(loaded.good.mainProductWeight),
      grossLabel: formatGrossWeightLabel(gross.kg),
      nutrition: parseProductNutritionJson(loaded.good.productNutritionJson),
      ingredientRows: loaded.ingredientRows,
      bomComponents: loaded.bomComponents,
      kitComponentRows: loaded.kitComponentRows,
      kitComponentSettings: loaded.kitComponentSettings,
    };
  }

  private getRenderOptions(ctx: ResolveCtx): StorefrontRenderOptions {
    return {
      isKit: ctx.isKit,
      kitComponentRows: ctx.kitComponentRows,
      kitComponentSettings: ctx.kitComponentSettings,
    };
  }

  private buildPlaceholderValues(ctx: ResolveCtx): StorefrontPlaceholderValues {
    const ingredients = parseProductIngredientsJson(ctx.good.productIngredientsJson);
    const { text: ingredientsText } = resolveIngredientsText(ingredients, ctx.ingredientRows);
    return {
      netWeight: ctx.netLabel,
      mainProductWeight: ctx.mainProductLabel,
      grossWeight: ctx.grossLabel,
      ingredients: ingredientsText,
      ...buildNutritionPlaceholderValues(ctx.nutrition),
      storage: STOREFRONT_BUILTIN_DEFAULTS.storage.template,
      heating: STOREFRONT_BUILTIN_DEFAULTS.heating.template,
      salt: STOREFRONT_BUILTIN_DEFAULTS.salt.template,
      kitComponents: ctx.isKit
        ? renderKitComponentsTemplate(
            ctx.presetBlocks.find((block) => block.resolver === 'kitComponents')?.template ||
              '{{kitComponents}}',
            ctx.kitComponentRows,
            ctx.kitComponentSettings,
          )
        : '',
    };
  }

  private renderDocHtml(ctx: ResolveCtx): string {
    const doc = ensureStorefrontDescriptionDoc(ctx.good.storefrontDescriptionDoc, ctx.presetBlocks, {
      isKit: ctx.isKit,
    });
    const placeholders = this.buildPlaceholderValues(ctx);
    return resolveStorefrontDescriptionDocHtml(
      doc,
      placeholders,
      ctx.metaKeys,
      this.getRenderOptions(ctx),
    );
  }

  private assembleBlocks(ctx: ResolveCtx): StorefrontResolvedBlock[] {
    const doc = ensureStorefrontDescriptionDoc(ctx.good.storefrontDescriptionDoc, ctx.presetBlocks, {
      isKit: ctx.isKit,
    });
    const placeholders = this.buildPlaceholderValues(ctx);
    const blocks: StorefrontResolvedBlock[] = [];

    for (const attrs of walkStorefrontDescriptionBlocks(doc)) {
      const presetBlock = ctx.presetBlocks.find((b) => b.id === attrs.blockId);
      const label = presetBlock?.label || attrs.blockId;
      const wcMetaKey = resolveStorefrontMetaKey(presetBlock?.metaKeyId, ctx.metaKeys);

      const primaryKey = attrs.resolver;
      let html = '';
      let source: StorefrontResolvedBlock['source'] = 'template';

      if (primaryKey === 'ingredients') {
        if (ctx.isKit) continue;
        const text = placeholders.ingredients || '';
        if (!text) continue;
        html = toHtmlBlock(
          resolveStorefrontTemplate(attrs.template, 'ingredients', text, placeholders, ctx.metaKeys),
        );
        source = parseProductIngredientsJson(ctx.good.productIngredientsJson).length
          ? 'product'
          : 'bom';
      } else if (primaryKey === 'nutrition') {
        if (!hasNutritionPlaceholderValues(placeholders)) continue;
        html = toHtmlBlock(substituteStorefrontPlaceholders(attrs.template, placeholders, ctx.metaKeys));
        source = 'product';
      } else if (primaryKey === 'netWeight' || primaryKey === 'mainProductWeight' || primaryKey === 'grossWeight') {
        const value = placeholders[primaryKey] || '';
        if (!value) continue;
        html = toHtmlBlock(
          resolveStorefrontTemplate(attrs.template, primaryKey, value, placeholders, ctx.metaKeys),
        );
        source = 'computed';
      } else if (primaryKey === 'kitComponents') {
        if (!ctx.isKit) continue;
        const kitHtml = renderKitComponentsTemplate(
          attrs.template,
          ctx.kitComponentRows,
          ctx.kitComponentSettings,
        );
        if (!kitHtml.trim()) continue;
        html = kitHtml;
        source = 'bom';
      } else {
        const raw = attrs.overrideContent?.trim() || attrs.template;
        const text = substituteStorefrontPlaceholders(raw, placeholders, ctx.metaKeys);
        if (!text.trim()) continue;
        html = toHtmlBlock(text);
        source = attrs.overrideContent?.trim() ? 'product' : 'template';
      }

      blocks.push({
        id: attrs.blockId,
        label,
        html,
        source,
        metaKeyId: presetBlock?.metaKeyId ?? null,
        wcMetaKey,
      });
    }

    return blocks;
  }

  private resolvePresetBlock(
    block: StorefrontBlockConfig,
    ctx: ResolveCtx,
  ): StorefrontResolvedBlock | null {
    const placeholders = this.buildPlaceholderValues(ctx);
    const label = block.label.trim() || 'Блок';
    const wcMetaKey = resolveStorefrontMetaKey(block.metaKeyId, ctx.metaKeys);
    const base = {
      id: block.id,
      label,
      metaKeyId: block.metaKeyId,
      wcMetaKey,
    };

    switch (block.resolver) {
      case 'template': {
        const text = substituteStorefrontPlaceholders(block.template, placeholders, ctx.metaKeys);
        if (!text?.trim()) return null;
        return { ...base, html: toHtmlBlock(text), source: 'template' };
      }
      case 'ingredients': {
        if (ctx.isKit) return null;
        const text = placeholders.ingredients || '';
        if (!text) return null;
        return {
          ...base,
          html: toHtmlBlock(
            resolveStorefrontTemplate(block.template, 'ingredients', text, placeholders, ctx.metaKeys),
          ),
          source: 'product',
        };
      }
      case 'nutrition': {
        if (!hasNutritionPlaceholderValues(placeholders)) return null;
        return {
          ...base,
          html: toHtmlBlock(
            substituteStorefrontPlaceholders(block.template, placeholders, ctx.metaKeys),
          ),
          source: 'product',
        };
      }
      case 'netWeight':
      case 'mainProductWeight':
      case 'grossWeight': {
        const value = placeholders[block.resolver] || '';
        if (!value) return null;
        return {
          ...base,
          html: toHtmlBlock(
            resolveStorefrontTemplate(block.template, block.resolver, value, placeholders, ctx.metaKeys),
          ),
          source: 'computed',
        };
      }
      case 'kitComponents': {
        if (!ctx.isKit) return null;
        const kitHtml = renderKitComponentsTemplate(
          block.template,
          ctx.kitComponentRows,
          ctx.kitComponentSettings,
        );
        if (!kitHtml.trim()) return null;
        return {
          ...base,
          html: kitHtml,
          source: 'bom',
        };
      }
      default: {
        const text = substituteStorefrontPlaceholders(block.template, placeholders, ctx.metaKeys);
        if (!text?.trim()) return null;
        return { ...base, html: toHtmlBlock(text), source: 'template' };
      }
    }
  }
}

export const storefrontDescriptionBuilder = new StorefrontDescriptionBuilder();
