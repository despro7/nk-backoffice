import { prisma } from '../../lib/utils.js';
import { getPortionsInOrdersBySku } from '../../services/productExportHelper.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import { computeEffectiveStock } from '../Storefront/WooCommerceStockService.js';
import type { ChatwootBotCatalogItemDto } from '../../../shared/types/chatwootBotTools.js';
import {
  isMeatFree,
  parseCatalogNutrition,
  parseIngredientsJson,
  plainCatalogDescription,
  searchCatalogDocs,
} from './chatwootBotCatalogSearch.js';
import { stockTierFromEffective } from './chatwootBotCatalogStockTier.js';

export class ChatwootBotCatalogToolService {
  async listStorefrontCatalog(params: {
    query?: string;
    limit?: number;
  }): Promise<ChatwootBotCatalogItemDto[]> {
    const limit = Math.max(1, Math.min(30, params.limit ?? 15));
    const q = params.query?.trim() ?? '';

    const storefrontRows = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        doNotPublish: false,
        wooProductId: { not: null },
        NOT: { sku: null },
      },
      select: { sku: true, description: true, productIngredientsJson: true, productNutritionJson: true },
    });
    const storefrontBySku = new Map(
      storefrontRows
        .filter((r): r is typeof r & { sku: string } => Boolean(r.sku?.trim()))
        .map((r) => [
          r.sku.trim(),
          {
            description: plainCatalogDescription(r.description),
            ingredients: parseIngredientsJson(r.productIngredientsJson),
            nutrition: parseCatalogNutrition(r.productNutritionJson),
          },
        ]),
    );

    const products = await catalogOpsLookup.listFinishedProducts({ includeOutdated: false });
    const portionsMap = await getPortionsInOrdersBySku();

    const docs = products.flatMap((product) => {
      const extra = storefrontBySku.get(product.sku.trim());
      return extra ? [{ product, name: product.name, sku: product.sku, category: product.categoryName, ...extra }] : [];
    });
    const found = searchCatalogDocs(docs, q);

    const items: ChatwootBotCatalogItemDto[] = [];
    for (const { product, category, ingredients, description, nutrition } of found.slice(0, limit)) {
      const effective = computeEffectiveStock(
        product.stockBalanceByStock,
        portionsMap.get(product.sku.trim()) ?? 0,
      );
      const tier = stockTierFromEffective(effective);
      const retail = product.additionalPrices?.find((p) =>
        p.priceType.toLowerCase().includes('retail'),
      );
      const retailPrice = retail ? Number(retail.priceValue) : product.costPerItem;
      items.push({
        name: product.name,
        sku: product.sku,
        retailPrice: Number.isFinite(retailPrice) ? retailPrice : null,
        stockTier: tier,
        effectiveStock: tier === 'exact' ? effective : undefined,
        category,
        ingredients: ingredients.length ? ingredients.slice(0, 12) : undefined,
        meatFree: isMeatFree(ingredients),
        description: description || undefined,
        weightGrams: product.weight ?? undefined,
        nutritionPer100g: nutrition ?? undefined,
      });
    }
    return items;
  }
}

export const chatwootBotCatalogToolService = new ChatwootBotCatalogToolService();
