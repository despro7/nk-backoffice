import { logServer } from '../../lib/utils.js';
import { catalogOpsLookup } from '../../modules/Products/CatalogOpsLookup.js';
import { productsCatalogService } from '../../modules/Products/ProductsCatalogService.js';

export class DilovodGoodsCacheManager {
  async getStatus() {
    const list = await catalogOpsLookup.listFinishedProducts({ includeOutdated: true });
    const lastUpdated = list.reduce<Date | null>((acc, p) => {
      if (!acc || p.updatedAt > acc) return p.updatedAt;
      return acc;
    }, null);

    return {
      lastSync: lastUpdated,
      count: list.length,
      updatedAt: lastUpdated,
    };
  }

  async refresh(forcedSkuList?: string[]) {
    try {
      logServer('[GoodsCache] Проекція catalog_goods → products...');
      let skuList = forcedSkuList;
      if (!skuList || skuList.length === 0) {
        const { activeSkus, archivedSkus } = await productsCatalogService.listSkusForLegacySync();
        skuList = [...activeSkus, ...archivedSkus];
      }
      const result = await catalogOpsLookup.projectToProductsCache(skuList);
      logServer(`[GoodsCache] Оновлено кеш товарів: ${result.syncedProducts}`);
      return { count: result.syncedProducts };
    } catch (error) {
      logServer(`[GoodsCache] Помилка оновлення кешу:`, error);
      throw new Error(`Goods cache refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async fetchGoodsFromDilovod(skuList?: string[]): Promise<Array<{ good_id: string; productNum: string; name?: string; parent?: string | null }>> {
    const list = skuList?.length
      ? catalogOpsLookup.listUnique(await catalogOpsLookup.getBySkus(skuList))
      : await catalogOpsLookup.listFinishedProducts({ includeOutdated: true });
    return list.map((p) => ({
      good_id: p.dilovodId,
      productNum: p.sku,
      name: p.name,
      parent: p.parent,
    }));
  }

  async updateGoodsCache(goods: Array<{ good_id: string; productNum: string; name?: string; parent?: string | null }>) {
    const skus = goods.map((g) => g.productNum).filter(Boolean);
    const result = await catalogOpsLookup.projectToProductsCache(skus);
    return result.syncedProducts;
  }
}
