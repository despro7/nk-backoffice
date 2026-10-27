import { prisma } from '../../lib/utils.js';
import { getPortionsInOrdersBySku } from '../../services/productExportHelper.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import { computeEffectiveStock } from '../Storefront/WooCommerceStockService.js';
import type { ChatwootBotCatalogItemDto } from '../../../shared/types/chatwootBotTools.js';
import { stockTierFromEffective } from './chatwootBotCatalogStockTier.js';

export class ChatwootBotCatalogToolService {
  async listStorefrontCatalog(params: {
    query?: string;
    limit?: number;
  }): Promise<ChatwootBotCatalogItemDto[]> {
    const limit = Math.max(1, Math.min(30, params.limit ?? 15));
    const q = params.query?.trim().toLowerCase() ?? '';

    const storefrontRows = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        doNotPublish: false,
        wooProductId: { not: null },
        NOT: { sku: null },
      },
      select: { sku: true },
    });
    const allowedSkus = new Set(
      storefrontRows.map((r) => r.sku?.trim()).filter((s): s is string => Boolean(s)),
    );

    const products = await catalogOpsLookup.listFinishedProducts({ includeOutdated: false });
    const portionsMap = await getPortionsInOrdersBySku();

    let filtered = products.filter((p) => allowedSkus.has(p.sku.trim()));
    if (q) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      );
    }

    const items: ChatwootBotCatalogItemDto[] = [];
    for (const product of filtered.slice(0, limit)) {
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
      });
    }
    return items;
  }
}

export const chatwootBotCatalogToolService = new ChatwootBotCatalogToolService();
