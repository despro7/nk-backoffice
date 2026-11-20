// Менеджер синхронізації товарів: тонка обгортка над catalog_* (legacy `products` sync видалено).

import { prisma } from '../../lib/utils.js';
import { catalogOpsLookup } from '../../modules/Products/CatalogOpsLookup.js';

export class DilovodSyncManager {
  // Закриття з'єднання з базою даних
  async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  // Масове оновлення залишків товарів у catalog_goods (+ dual-write у `products` усередині applyStockBalances)
  async updateProductStockBalancesBulk(
    items: {
      sku: string;
      mainStorage: number;
      smallStorage: number;
    }[]
  ): Promise<{
    success: boolean;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    const result = await catalogOpsLookup.applyStockBalances(items);
    return {
      success: result.errors.length === 0,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    };
  }
}
