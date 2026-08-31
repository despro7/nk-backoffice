// SKU для legacy products / goods cache — джерело catalog_goods (Готова продукція)

import { prisma } from '../../lib/utils.js';
import { productsCatalogService } from '../../modules/Products/ProductsCatalogService.js';

export class DilovodCacheManager {
  /** Активні SKU з піддерева «Готова продукція» (локальне дзеркало catalog_goods). */
  public async fetchFreshSkusFromCatalog(): Promise<string[]> {
    const { activeSkus } = await productsCatalogService.listSkusForLegacySync();
    console.log(`Отримано ${activeSkus.length} активних SKU з каталогу (Готова продукція)`);
    if (activeSkus.length > 0) {
      console.log(`Приклади SKU: ${activeSkus.slice(0, 5).join(', ')}`);
    }
    return activeSkus;
  }

  async getActiveCatalogSkus(): Promise<string[]> {
    return this.fetchFreshSkusFromCatalog();
  }

  async getCacheStats(): Promise<{
    hasCache: boolean;
    skuCount: number;
    lastUpdated: string | null;
    isExpired: boolean;
  }> {
    try {
      const skus = await this.fetchFreshSkusFromCatalog();
      return {
        hasCache: skus.length > 0,
        skuCount: skus.length,
        lastUpdated: null,
        isExpired: false,
      };
    } catch (error) {
      console.log('Помилка отримання статистики SKU каталогу:', error);
      return {
        hasCache: false,
        skuCount: 0,
        lastUpdated: null,
        isExpired: true,
      };
    }
  }

  async forceRefreshCache(): Promise<{ success: boolean; message: string; skuCount: number }> {
    try {
      const freshSkus = await this.fetchFreshSkusFromCatalog();
      return {
        success: true,
        message: 'SKU з каталогу (Готова продукція)',
        skuCount: freshSkus.length,
      };
    } catch (error) {
      console.log('Помилка отримання SKU з каталогу:', error);
      return {
        success: false,
        message: `Помилка отримання SKU: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        skuCount: 0,
      };
    }
  }

  async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }
}
