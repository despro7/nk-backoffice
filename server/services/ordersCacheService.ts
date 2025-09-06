import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface OrderCacheItem {
  sku: string;
  name: string;
  orderedQuantity: number;
  stockBalances: { [warehouse: string]: number };
}

export interface OrderCacheData {
  id: number;
  externalId: string;
  processedItems: string | null; // JSON string с массивом OrderCacheItem[]
  totalQuantity: number;
  cacheUpdatedAt: Date;
  cacheVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderCacheData {
  externalId: string;
  processedItems: string | null;
  totalQuantity: number;
  cacheVersion?: number;
}

export interface UpdateOrderCacheData {
  processedItems?: string | null;
  totalQuantity?: number;
  cacheVersion?: number;
}

export class OrdersCacheService {
  /**
   * Создает или обновляет кеш для заказа
   */
  async upsertOrderCache(data: CreateOrderCacheData): Promise<OrderCacheData> {
    try {
      const cacheData = await prisma.ordersCache.upsert({
        where: {
          externalId: data.externalId
        },
        update: {
          processedItems: data.processedItems,
          totalQuantity: data.totalQuantity,
          cacheUpdatedAt: new Date(),
          cacheVersion: data.cacheVersion || 1
        },
        create: {
          externalId: data.externalId,
          processedItems: data.processedItems,
          totalQuantity: data.totalQuantity,
          cacheVersion: data.cacheVersion || 1
        }
      });

      console.log(`✅ [ORDERS CACHE] ${data.processedItems ? 'Updated' : 'Created'} cache for order ${data.externalId}`);
      return cacheData;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to upsert order cache:', error);
      throw error;
    }
  }

  /**
   * Получает кеш для заказа по externalId
   */
  async getOrderCache(externalId: string): Promise<OrderCacheData | null> {
    try {
      const cache = await prisma.ordersCache.findUnique({
        where: {
          externalId: externalId
        }
      });

      if (cache) {
        console.log(`📋 [ORDERS CACHE] Retrieved cache for order ${externalId}`);
      } else {
        console.log(`📋 [ORDERS CACHE] Cache not found for order ${externalId}`);
      }

      return cache;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to get order cache:', error);
      throw error;
    }
  }

  /**
   * Получает кешированные товары для заказа в виде массива
   */
  async getOrderCacheItems(externalId: string): Promise<OrderCacheItem[]> {
    try {
      const cache = await this.getOrderCache(externalId);

      if (!cache || !cache.processedItems) {
        return [];
      }

      const items: OrderCacheItem[] = JSON.parse(cache.processedItems);
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to parse cache items:', error);
      return [];
    }
  }

  /**
   * Проверяет, существует ли кеш для заказа
   */
  async hasOrderCache(externalId: string): Promise<boolean> {
    try {
      const cache = await prisma.ordersCache.findUnique({
        where: {
          externalId: externalId
        },
        select: {
          id: true
        }
      });

      return cache !== null;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to check cache existence:', error);
      return false;
    }
  }

  /**
   * Инвалидирует кеш для заказа (удаляет запись)
   */
  async invalidateOrderCache(externalId: string): Promise<boolean> {
    try {
      const result = await prisma.ordersCache.deleteMany({
        where: {
          externalId: externalId
        }
      });

      const deleted = result.count > 0;
      if (deleted) {
        console.log(`🗑️ [ORDERS CACHE] Invalidated cache for order ${externalId}`);
      } else {
        console.log(`🗑️ [ORDERS CACHE] Cache not found for order ${externalId}`);
      }

      return deleted;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to invalidate cache:', error);
      throw error;
    }
  }

  /**
   * Удаляет кеш для заказа
   */
  async deleteOrderCache(externalId: string): Promise<boolean> {
    try {
      const result = await prisma.ordersCache.deleteMany({
        where: {
          externalId: externalId
        }
      });

      const deleted = result.count > 0;
      if (deleted) {
        console.log(`🗑️ [ORDERS CACHE] Deleted cache for order ${externalId}`);
      } else {
        console.log(`🗑️ [ORDERS CACHE] Cache not found for order ${externalId}`);
      }

      return deleted;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to delete cache:', error);
      throw error;
    }
  }

  /**
   * Получает статистику по кешу
   */
  async getCacheStatistics(): Promise<{
    totalEntries: number;
    averageAge: number;
    totalProcessedItemsSize: number;
  }> {
    try {
      const now = new Date();
      const totalEntries = await prisma.ordersCache.count();

      // Получаем средний возраст кеша (простой расчет)
      const cacheEntries = await prisma.ordersCache.findMany({
        select: {
          cacheUpdatedAt: true
        },
        take: 1000 // Ограничиваем для производительности
      });

      let totalAge = 0;
      cacheEntries.forEach(entry => {
        if (entry.cacheUpdatedAt) {
          totalAge += now.getTime() - entry.cacheUpdatedAt.getTime();
        }
      });

      const averageAge = cacheEntries.length > 0 ? totalAge / cacheEntries.length : 0;

      // Получаем все записи для подсчета размера processedItems
      const allCache = await prisma.ordersCache.findMany({
        select: {
          processedItems: true
        }
      });

      let totalProcessedItemsSize = 0;
      allCache.forEach(cache => {
        if (cache.processedItems) {
          totalProcessedItemsSize += cache.processedItems.length;
        }
      });

      return {
        totalEntries,
        averageAge: Math.round(averageAge / (1000 * 60 * 60)), // в часах
        totalProcessedItemsSize
      };
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to get cache statistics:', error);
      throw error;
    }
  }

  /**
   * Получает все externalId заказов с кешем
   */
  async getCachedOrderIds(): Promise<string[]> {
    try {
      const cachedOrders = await prisma.ordersCache.findMany({
        select: {
          externalId: true
        }
      });

      const externalIds = cachedOrders.map(order => order.externalId);
      console.log(`📋 [ORDERS CACHE] Found ${externalIds.length} orders with cache`);

      return externalIds;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to get cached order IDs:', error);
      throw error;
    }
  }

  /**
   * Получает кеши для нескольких заказов одним запросом
   */
  async getMultipleOrderCaches(externalIds: string[]): Promise<Map<string, OrderCacheData | null>> {
    try {
      if (externalIds.length === 0) {
        return new Map();
      }

      const caches = await prisma.ordersCache.findMany({
        where: {
          externalId: {
            in: externalIds
          }
        }
      });

      const cacheMap = new Map<string, OrderCacheData | null>();

      // Заполняем карту найденными кешами
      caches.forEach(cache => {
        cacheMap.set(cache.externalId, cache);
      });

      // Для заказов без кеша устанавливаем null
      externalIds.forEach(externalId => {
        if (!cacheMap.has(externalId)) {
          cacheMap.set(externalId, null);
        }
      });

      console.log(`📋 [ORDERS CACHE] Retrieved ${caches.length}/${externalIds.length} caches in bulk`);

      return cacheMap;
    } catch (error) {
      console.error('❌ [ORDERS CACHE] Failed to get multiple order caches:', error);
      throw error;
    }
  }
}

export const ordersCacheService = new OrdersCacheService();
