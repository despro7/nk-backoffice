/**
 * WooCommerce pull/push sync orchestration.
 */

import { prisma, logServer } from '../../lib/utils.js';
import {
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_CURRENCY_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
} from '../../../shared/types/catalog.js';
import { productsDilovodGateway } from '../Products/ProductsDilovodGateway.js';
import type {
  StorefrontDescriptionDoc,
  StorefrontDryRunPushPayload,
  WooInspectResult,
  WooInspectSummary,
  WooPullApplyInput,
  WooPullApplyResult,
  WooPullPreviewResult,
  WooPushApplyResult,
  WooPushBulkResult,
  WooPushPreviewResult,
} from '../../../shared/types/storefront.js';
import {
  stringifyProductIngredientsJson,
  stringifyProductNutritionJson,
  stringifyStorefrontDescriptionDoc,
} from '../../../shared/utils/storefrontDescription.js';
import {
  extractMarketingPlainFromHtml,
  isEffectivelyEmptyHtml,
  parseWcDescription,
  summarizeWcProduct,
} from '../../../shared/utils/storefrontDescriptionParser.js';
import { storefrontDescriptionBuilder } from './StorefrontDescriptionBuilder.js';
import { storefrontService } from './StorefrontService.js';
import { createWooCommerceClient } from './WooCommerceApiClient.js';
import { wooCommerceMediaService } from './WooCommerceMediaService.js';

function fieldConflict(
  field: string,
  local: string | number | null | undefined,
  remote: string | number | null | undefined,
): { field: string; localValue: string | null; remoteValue: string | null } | null {
  const localStr = local == null || local === '' ? null : String(local);
  const remoteStr = remote == null || remote === '' ? null : String(remote);
  if (!localStr || !remoteStr || localStr === remoteStr) return null;
  return { field, localValue: localStr, remoteValue: remoteStr };
}

function descriptionFieldConflict(
  local: string | null | undefined,
  remote: string | null | undefined,
): { field: string; localValue: string | null; remoteValue: string | null } | null {
  if (isEffectivelyEmptyHtml(local)) return null;
  if (!remote?.trim()) return null;
  const localStr = String(local).trim();
  const remoteStr = remote.trim();
  if (localStr === remoteStr) return null;
  return { field: 'description', localValue: localStr, remoteValue: remoteStr };
}

function priceFieldConflict(
  local: string | null | undefined,
  remote: string | null | undefined,
): { field: string; localValue: string | null; remoteValue: string | null } | null {
  const localNum = local == null || local === '' ? null : Number.parseFloat(local.replace(',', '.'));
  const remoteNum = remote == null || remote === '' ? null : Number.parseFloat(remote.replace(',', '.'));
  if (localNum == null || remoteNum == null || !Number.isFinite(localNum) || !Number.isFinite(remoteNum)) {
    return fieldConflict('regularPrice', local, remote);
  }
  if (Math.abs(localNum - remoteNum) < 0.0001) return null;
  return {
    field: 'regularPrice',
    localValue: String(localNum),
    remoteValue: String(remoteNum),
  };
}

function parseWeight(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveDoNotPublishFromWcStatus(status: string | null | undefined): boolean {
  return String(status || '').trim() !== 'publish';
}

function normalizeShortDescriptionHtml(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return `<p>${trimmed}</p>`;
}

function extractMarketingPlainFromDoc(doc: StorefrontDescriptionDoc): string | null {
  const paragraph = doc.content.find(
    (node) =>
      node.type === 'paragraph' &&
      (node.attrs as { class?: string } | undefined)?.class === 'storefront-marketing',
  );
  if (!paragraph?.content?.length) return null;
  const text = paragraph.content
    .filter((node) => node.type === 'text' && typeof (node as { text?: string }).text === 'string')
    .map((node) => (node as { text: string }).text)
    .join('')
    .trim();
  return text || null;
}

function resolveProposedShortDescription(
  product: { short_description?: string | null; description?: string | null },
  parsedDoc: StorefrontDescriptionDoc,
): string | null {
  const wcShort = product.short_description?.trim();
  const raw =
    wcShort && !isEffectivelyEmptyHtml(wcShort)
      ? wcShort
      : extractMarketingPlainFromDoc(parsedDoc) ||
        extractMarketingPlainFromHtml(product.description || '');
  return normalizeShortDescriptionHtml(raw);
}

function resolveWooRegularPrice(product: {
  regular_price?: string | null;
  price?: string | null;
}): string | null {
  const raw = product.regular_price?.trim() || product.price?.trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return String(parsed);
}

function resolveStorefrontRegularPrice(
  prices: Array<{ priceType: string; price: number }>,
): string | null {
  const retail = prices.find((row) => row.priceType === CATALOG_PRICE_TYPE_RETAIL_ID);
  if (retail != null && retail.price > 0) return String(retail.price);
  const regular = prices.find((row) => row.priceType === CATALOG_PRICE_TYPE_REGULAR_ID);
  if (regular != null && regular.price > 0) return String(regular.price);
  return null;
}

async function upsertPulledRegularPrice(goodId: string, price: number): Promise<void> {
  const now = new Date();
  const storefrontPriceTypes = [CATALOG_PRICE_TYPE_RETAIL_ID, CATALOG_PRICE_TYPE_REGULAR_ID];
  const existingPrices = await prisma.catalogGoodPrice.findMany({
    where: { goodId, priceType: { in: storefrontPriceTypes } },
    select: { priceType: true, currency: true },
  });
  const currencyByType = new Map(
    existingPrices.map((row) => [row.priceType, row.currency || CATALOG_DEFAULT_CURRENCY_ID]),
  );

  for (const priceType of storefrontPriceTypes) {
    const currency = currencyByType.get(priceType) || CATALOG_DEFAULT_CURRENCY_ID;
    await productsDilovodGateway.savePrice({
      goodId,
      priceType,
      price,
      currency,
    });
    await prisma.catalogGoodPrice.upsert({
      where: { goodId_priceType: { goodId, priceType } },
      create: {
        goodId,
        priceType,
        price,
        currency,
        syncedAt: now,
      },
      update: {
        price,
        currency,
        syncedAt: now,
      },
    });
  }
}

export class WooCommerceSyncService {
  async inspectProduct(sku: string): Promise<WooInspectResult> {
    const creds = await storefrontService.getWooCredentialsConfigured();
    const client = createWooCommerceClient(creds);
    const product = await client.getProductBySku(sku.trim());
    if (!product) throw new Error(`Товар з SKU «${sku}» не знайдено на WooCommerce`);

    const { nkMeta, unknownMeta } = summarizeWcProduct(product);
    const summary: WooInspectSummary = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      descriptionLength: (product.description || '').length,
      descriptionPreview: (product.description || '').slice(0, 400),
      shortDescription: product.short_description || '',
      regularPrice: product.regular_price || '',
      weight: product.weight || '',
      stockQuantity: product.stock_quantity,
      nkMeta,
      unknownMeta,
    };

    return { summary, raw: product };
  }

  async pullPreview(goodId: string): Promise<WooPullPreviewResult> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      include: {
        prices: true,
        images: { select: { id: true } },
      },
    });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');
    if (!good.sku) throw new Error('SKU відсутній');

    const creds = await storefrontService.getWooCredentialsConfigured();
    const client = createWooCommerceClient(creds);
    const product =
      (good.wooProductId ? await client.getProductById(good.wooProductId) : null) ||
      (await client.getProductBySku(good.sku));
    if (!product) throw new Error(`Товар з SKU «${good.sku}» не знайдено на WooCommerce`);

    const settings = await storefrontService.getSettings();
    const preset = good.storefrontPresetId
      ? await storefrontService.getPreset(good.storefrontPresetId)
      : await storefrontService.getDefaultPreset();

    const isKit = good.accPolicyId === CATALOG_ACC_POLICY_KIT;
    const parsed = parseWcDescription({
      product,
      presetBlocks: preset.blocks,
      metaKeys: settings.metaKeys,
      isKit,
    });

    const { nkMeta } = summarizeWcProduct(product);
    const proposedWeight = parseWeight(product.weight);
    const localRegularPrice = resolveStorefrontRegularPrice(good.prices);
    const proposedDoNotPublish = resolveDoNotPublishFromWcStatus(product.status);
    const proposedShortDescription = resolveProposedShortDescription(product, parsed.storefrontDescriptionDoc);
    const proposedImageCount = product.images?.length ?? 0;
    const localImageCount = good.images.length;

    const conflicts = [
      fieldConflict('fullDescription', good.fullDescription, product.description),
      descriptionFieldConflict(good.description, proposedShortDescription),
      fieldConflict('weight', good.weight, proposedWeight),
      priceFieldConflict(localRegularPrice, resolveWooRegularPrice(product)),
      fieldConflict('doNotPublish', good.doNotPublish, proposedDoNotPublish),
      localImageCount > 0 && proposedImageCount > 0
        ? fieldConflict('images', localImageCount, proposedImageCount)
        : null,
      fieldConflict(
        'storefrontDescriptionDoc',
        good.storefrontDescriptionDoc,
        stringifyStorefrontDescriptionDoc(parsed.storefrontDescriptionDoc),
      ),
      fieldConflict(
        'productIngredientsJson',
        good.productIngredientsJson,
        stringifyProductIngredientsJson(parsed.productIngredientsJson),
      ),
      fieldConflict(
        'productNutritionJson',
        good.productNutritionJson,
        stringifyProductNutritionJson(parsed.productNutritionJson),
      ),
    ].filter(Boolean) as WooPullPreviewResult['conflicts'];

    return {
      goodId: good.id,
      sku: good.sku,
      wooProductId: product.id,
      wcRaw: product,
      local: {
        weight: good.weight,
        regularPrice: localRegularPrice,
        doNotPublish: good.doNotPublish,
        imageCount: localImageCount,
        storefrontDescriptionDoc: good.storefrontDescriptionDoc,
        productIngredientsJson: good.productIngredientsJson,
        productNutritionJson: good.productNutritionJson,
      },
      proposed: {
        fullDescription: product.description || null,
        shortDescription: proposedShortDescription,
        weight: proposedWeight,
        regularPrice: resolveWooRegularPrice(product),
        doNotPublish: proposedDoNotPublish,
        imageCount: proposedImageCount,
        meta: nkMeta,
        parsed,
      },
      conflicts,
    };
  }

  async pullApply(input: WooPullApplyInput): Promise<WooPullApplyResult> {
    await storefrontService.getWooCredentialsInternal();
    const preview = await this.pullPreview(input.goodId);
    const appliedFields: string[] = [];
    const patch: Record<string, unknown> = {};

    if (input.apply.fullDescription) {
      patch.fullDescription = preview.proposed.fullDescription;
      appliedFields.push('fullDescription');
    }
    if (input.apply.shortDescription && preview.proposed.shortDescription) {
      patch.description = preview.proposed.shortDescription;
      appliedFields.push('shortDescription');
    }
    if (input.apply.doNotPublish) {
      patch.doNotPublish = preview.proposed.doNotPublish;
      appliedFields.push('doNotPublish');
    }
    if (input.apply.weight && preview.proposed.weight != null) {
      patch.weight = preview.proposed.weight;
      appliedFields.push('weight');
    }
    if (input.apply.regularPrice && preview.proposed.regularPrice) {
      const price = Number.parseFloat(preview.proposed.regularPrice.replace(',', '.'));
      if (!Number.isFinite(price) || price < 0) {
        throw new Error('Некоректна ціна з WooCommerce');
      }
      await upsertPulledRegularPrice(input.goodId, price);
      appliedFields.push('regularPrice');
    }
    if (input.apply.storefrontDescriptionDoc) {
      patch.storefrontDescriptionDoc = stringifyStorefrontDescriptionDoc(
        preview.proposed.parsed.storefrontDescriptionDoc,
      );
      appliedFields.push('storefrontDescriptionDoc');
    }
    if (input.apply.productIngredientsJson) {
      patch.productIngredientsJson = stringifyProductIngredientsJson(
        preview.proposed.parsed.productIngredientsJson,
      );
      appliedFields.push('productIngredientsJson');
    }
    if (input.apply.productNutritionJson) {
      patch.productNutritionJson = stringifyProductNutritionJson(
        preview.proposed.parsed.productNutritionJson,
      );
      appliedFields.push('productNutritionJson');
    }
    if (input.apply.wooProductId) {
      patch.wooProductId = preview.wooProductId;
      appliedFields.push('wooProductId');
    }

    if (input.apply.images) {
      const localImageCount = await prisma.catalogGoodImage.count({ where: { goodId: input.goodId } });
      const replaceExisting = Boolean(input.apply.replaceImages);
      if (localImageCount > 0 && !replaceExisting) {
        throw new Error('Для заміни локальних зображень увімкніть опцію «Замінити існуючі»');
      }
      const imageResult = await wooCommerceMediaService.pullProductImages(
        input.goodId,
        preview.wcRaw,
        replaceExisting,
      );
      if (imageResult.imported === 0 && imageResult.errors.length > 0) {
        throw new Error(imageResult.errors.join('; '));
      }
      appliedFields.push('images');
    }

    if (appliedFields.length === 0) {
      throw new Error('Не обрано жодного поля для застосування');
    }

    const now = new Date();
    patch.wooLastSyncedAt = now;

    const dbFields = Object.keys(patch);
    if (dbFields.length > 0) {
      await prisma.catalogGood.update({
        where: { id: input.goodId },
        data: patch,
      });
    }

    logServer(`[WooCommerceSyncService] pull applied for ${input.goodId}: ${appliedFields.join(', ')}`);

    return {
      goodId: input.goodId,
      wooProductId: preview.wooProductId,
      wooLastSyncedAt: now.toISOString(),
      appliedFields,
    };
  }

  async pushPreview(goodId: string): Promise<WooPushPreviewResult> {
    const good = await prisma.catalogGood.findUnique({ where: { id: goodId } });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');
    if (!good.sku) throw new Error('SKU відсутній');

    const payload = await storefrontDescriptionBuilder.dryRunPush(goodId);
    return {
      goodId,
      sku: good.sku,
      wooProductId: good.wooProductId,
      payload,
      isCreate: !good.wooProductId,
    };
  }

  private buildWcPayload(payload: StorefrontDryRunPushPayload): Record<string, unknown> {
    const meta_data = Object.entries(payload.meta).map(([key, value]) => ({ key, value }));
    return {
      status: payload.status,
      short_description: payload.shortDescription || '',
      description: payload.descriptionHtml,
      weight: payload.weight != null ? String(payload.weight) : '',
      meta_data,
    };
  }

  async pushApply(goodId: string): Promise<WooPushApplyResult> {
    const preview = await this.pushPreview(goodId);
    const creds = await storefrontService.getWooCredentialsInternal();
    const client = createWooCommerceClient(creds);
    const wcPayload = this.buildWcPayload(preview.payload);
    const now = new Date();

    let wooProductId = preview.wooProductId;
    let created = false;

    const goodName = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { name: true },
    });

    if (wooProductId) {
      await client.updateProduct(wooProductId, wcPayload);
    } else {
      const createdProduct = await client.createProduct({
        ...wcPayload,
        name: goodName?.name || preview.sku,
        sku: preview.sku,
        type: 'simple',
      });
      wooProductId = createdProduct.id;
      created = true;
    }

    await prisma.catalogGood.update({
      where: { id: goodId },
      data: { wooProductId, wooLastSyncedAt: now },
    });

    let mediaResult: Awaited<ReturnType<typeof wooCommerceMediaService.uploadProductImages>> = {
      goodId,
      uploaded: [],
      errors: [],
    };
    try {
      mediaResult = await wooCommerceMediaService.uploadProductImages(goodId);
      if (mediaResult.errors.length > 0) {
        logServer(
          `[WooCommerceSyncService] push images for ${goodId} had errors`,
          mediaResult.errors.join('; '),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      mediaResult.errors.push(message);
      logServer(`[WooCommerceSyncService] push images for ${goodId} failed`, err);
    }

    logServer(`[WooCommerceSyncService] push applied for ${goodId} → WC#${wooProductId}`);

    return {
      goodId,
      wooProductId: wooProductId!,
      wooLastSyncedAt: now.toISOString(),
      created,
      imagesUploaded: mediaResult.uploaded.length,
      imageErrors: mediaResult.errors.length > 0 ? mediaResult.errors : undefined,
    };
  }

  async pushBulk(goodIds: string[]): Promise<WooPushBulkResult> {
    const results: WooPushBulkResult['results'] = [];
    for (const goodId of goodIds) {
      try {
        const result = await this.pushApply(goodId);
        const good = await prisma.catalogGood.findUnique({
          where: { id: goodId },
          select: { sku: true },
        });
        results.push({
          goodId,
          sku: good?.sku || '',
          ok: true,
          wooProductId: result.wooProductId,
          created: result.created,
        });
      } catch (err) {
        const good = await prisma.catalogGood.findUnique({
          where: { id: goodId },
          select: { sku: true },
        });
        results.push({
          goodId,
          sku: good?.sku || '',
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results };
  }
}

export const wooCommerceSyncService = new WooCommerceSyncService();
