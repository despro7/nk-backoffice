import { logServer, prisma } from '../../lib/utils.js';
import { DilovodApiClient } from './DilovodApiClient.js';

export class DilovodGoodsCacheManager {
  // Використовуємо поле products.dilovodId замість окремої таблиці goods_cache
  async getStatus() {
    // Cast to any until Prisma client is regenerated after migrations
    const count = await prisma.product.count({
      where: ({ dilovodId: { not: null } } as any)
    });

    // Отримуємо час останнього оновлення з таблиці products, де є dilovodId
    const lastUpdated = await prisma.product.findFirst({
      where: ({ dilovodId: { not: null } } as any),
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    return {
      lastSync: lastUpdated?.updatedAt || null,
      count,
      updatedAt: lastUpdated?.updatedAt || null
    };
  }

  async refresh(forcedSkuList?: string[]) {
    try {
      logServer('[GoodsCache] Починаємо оновлення кешу товарів...');
      // Підтримуємо опціональний список SKU (передається коли потрібно завжди отримати свіжі)
      let skuList = forcedSkuList;
      if (!skuList || skuList.length === 0) {
        // Якщо не передано, зчитуємо з кеша налаштувань (settingsWpSku)
        const skuRow = await prisma.settingsWpSku.findFirst({ orderBy: { lastUpdated: 'desc' } });
        if (skuRow && skuRow.skus) {
          try {
            skuList = JSON.parse(skuRow.skus);
          } catch {
            skuList = skuRow.skus.split(',').map(s => s.trim()).filter(Boolean);
          }
        }
      }

      const goods = await this.fetchGoodsFromDilovod(skuList);
      logServer(`[GoodsCache] Отримано товарів з Dilovod: ${goods.length}`);
      const updated = await this.updateGoodsCache(goods);
      logServer(`[GoodsCache] Оновлено кеш товарів: ${updated}`);
      return { count: updated };
    } catch (error) {
      logServer(`[GoodsCache] Помилка оновлення кешу:`, error);
      throw new Error(`Goods cache refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async fetchGoodsFromDilovod(skuList?: string[]): Promise<Array<{ good_id: string; productNum: string; name?: string; parent?: string | null }>> {
    // 1. Отримуємо кешований масив SKU з settings_wp_sku
    // Якщо список SKU не передано — беремо зі збереженого кешу
    if (!skuList || skuList.length === 0) {
      const skuRow = await prisma.settingsWpSku.findFirst({ orderBy: { lastUpdated: 'desc' } });
      if (!skuRow || !skuRow.skus) return [];
      // skus зберігається як JSON-рядок або CSV
      try {
        skuList = JSON.parse(skuRow.skus);
      } catch {
        skuList = skuRow.skus.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (!skuList.length) return [];

    // 2. Викликаємо DilovodApiClient для отримання товарів
    const apiClient = new DilovodApiClient();
    const goods = await apiClient.getGoodsFromCatalog(skuList);

    // 3. Коректний мапінг під структуру кешу — залишаємо ту ж структуру але
    // тепер результати ми будемо застосовувати в таблиці products (поле dilovodId)
    // ВАЖЛИВО: Незважаючи на аліаси в DilovodApiClient.getGoodsFromCatalog(),
    // Dilovod API повертає оригінальні назви полів: id, sku, id__pr, parent
    // (аліаси productNum: "sku" та id__pr: "name" НЕ перейменовують поля у відповіді)
    type CacheGood = { good_id: string; productNum: string; name?: string; parent?: string | null };
    return goods.map((g: any): CacheGood => ({
      good_id: g.id,            // ← ID товару в Dilovod
      productNum: g.sku,        // ← SKU/артикул товару
      name: g.id__pr || null,   // ← id__pr містить назву товару
      parent: g.parent || null
    }));
  }

  async updateGoodsCache(goods: Array<{ good_id: string; productNum: string; name?: string; parent?: string | null }>) {
    // Ми не видаляємо всі продукти; оновлюємо продуктам поле dilovodId

    // Фільтруємо товари без обов'язкових полів
    const validGoods = goods.filter(good => {
      if (!good.good_id || !good.productNum) {
      logServer('[GoodsCache] Пропущено товар без good_id або productNum: ' + JSON.stringify(good));
        return false;
      }
      return true;
    });

    // Batch insert для підвищення продуктивності
    let updatedCount = 0;
    for (const good of validGoods) {
      try {
        const existing = await prisma.product.findUnique({ where: { sku: good.productNum } });
        if (existing) {
          await prisma.product.update({
            where: { sku: good.productNum },
            data: ({ dilovodId: good.good_id, name: good.name || existing.name } as any)
          });
          updatedCount++;
        } else {
          // Якщо продукт відсутній в таблиці products — створюємо мінімальний запис,
          // щоб потім можна було шукати по SKU при експорті замовлення
          await prisma.product.create({
            data: ({
              sku: good.productNum,
              name: good.name || '',
              dilovodId: good.good_id
            } as any)
          });
          updatedCount++;
        }
      } catch (err) {
        logServer('[GoodsCache] Помилка оновлення продукту: ' + good.productNum, err);
      }
    }

    return updatedCount;
  }
}
