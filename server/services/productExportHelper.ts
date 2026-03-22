/**
 * productExportHelper.ts
 *
 * Централізована логіка підготовки payload для експорту товарів у SalesDrive.
 * Використовується як HTTP-ендпоінтом (GET /api/products/export-to-salesdrive),
 * так і кроновим завданням автоматичного експорту.
 *
 * Ключова особливість: залишки складу "1" коригуються на кількість порцій,
 * зарезервованих активними замовленнями (статуси Нові=1 та Підтверджені=2).
 */

import { prisma } from '../lib/utils.js';
import { ordersCacheService, OrderCacheItem } from './ordersCacheService.js';

// ─── Типи ────────────────────────────────────────────────────────────────────

export interface ExportPayloadItem {
  id: string;
  name: string;
  sku: string;
  costPerItem: string;
  currency: string;
  category: { id: number; name: string };
  set: Array<{ id: string; quantity: number; name?: string }>;
  additionalPrices: any[];
  stockBalanceByStock: Record<string, number>;
}

export interface BuildExportPayloadOptions {
  /** Розгортати комплекти на кінцеві товари. За замовчуванням false. */
  expandSets?: boolean;
  /**
   * Коригувати залишок складу "1" на кількість порцій у активних замовленнях
   * (статуси 1=Нові, 2=Підтверджені). За замовчуванням true.
   */
  adjustStock?: boolean;
}

// ─── Допоміжні функції ────────────────────────────────────────────────────────

/**
 * Підраховує загальну кількість кожного SKU у активних замовленнях
 * (статуси 1=Нові та 2=Підтверджені) через кеш порцій.
 * Повертає Map<sku, totalQuantity>.
 */
export async function getPortionsInOrdersBySku(): Promise<Map<string, number>> {
  const portionsMap = new Map<string, number>();

  // Отримуємо всі замовлення зі статусами 1 (Нові) та 2 (Підтверджені)
  const activeOrders = await prisma.order.findMany({
    where: { status: { in: ['1', '2'] } },
    select: { externalId: true },
  });

  if (activeOrders.length === 0) return portionsMap;

  const externalIds = activeOrders.map(o => o.externalId);

  // Bulk-запит до кешу (вже розгорнуті порції через preprocessOrderItemsForCache)
  const cacheMap = await ordersCacheService.getMultipleOrderCaches(externalIds);

  for (const cacheData of cacheMap.values()) {
    if (!cacheData?.processedItems) continue;
    try {
      const items: OrderCacheItem[] = JSON.parse(cacheData.processedItems);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.sku && item.orderedQuantity > 0) {
          portionsMap.set(item.sku, (portionsMap.get(item.sku) ?? 0) + item.orderedQuantity);
        }
      }
    } catch {
      // Пошкоджений кеш — пропускаємо
    }
  }

  return portionsMap;
}

/**
 * Рекурсивно розгортає комплект на кінцеві товари.
 */
async function expandSetRecursively(
  product: any,
  expandedComponents: Record<string, { component: any; quantity: number }>,
  visitedSets: Set<string>,
  depth: number
): Promise<void> {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    console.warn(`⚠️ Max recursion depth reached for product ${product.sku}`);
    return;
  }

  if (visitedSets.has(product.sku)) {
    console.warn(`⚠️ Circular reference detected for product ${product.sku}`);
    return;
  }
  visitedSets.add(product.sku);

  let set: Array<{ id: string; quantity: number }> = [];
  try {
    set = product.set ? (typeof product.set === 'string' ? JSON.parse(product.set) : product.set) : [];
  } catch {
    console.warn(`Failed to parse set for product ${product.sku}`);
  }

  for (const setItem of set) {
    if (!setItem.id || !setItem.quantity) continue;

    const component = await prisma.product.findFirst({ where: { sku: setItem.id } });
    if (!component) continue;

    let componentSet: any[] = [];
    try {
      componentSet = typeof component.set === 'string' ? JSON.parse(component.set) : component.set || [];
    } catch {
      console.warn(`Failed to parse set for component ${component.sku}`);
    }

    if (Array.isArray(componentSet) && componentSet.length > 0) {
      await expandSetRecursively(component, expandedComponents, new Set(visitedSets), depth + 1);
    } else {
      if (expandedComponents[setItem.id]) {
        expandedComponents[setItem.id].quantity += setItem.quantity;
      } else {
        expandedComponents[setItem.id] = { component, quantity: setItem.quantity };
      }
    }
  }

  visitedSets.delete(product.sku);
}

// ─── Головна функція ──────────────────────────────────────────────────────────

/**
 * Збирає повний payload для експорту товарів у SalesDrive.
 * Коригує залишок складу "1" на кількість порцій в активних замовленнях.
 */
export async function buildExportPayload(
  options: BuildExportPayloadOptions = {}
): Promise<{ payload: ExportPayloadItem[]; adjustedCount: number }> {
  const { expandSets = false, adjustStock = true } = options;

  // Отримуємо всі активні товари
  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    where: { isOutdated: { not: true } },
  });

  // Завантажуємо порції в замовленнях (паралельно)
  const portionsMap = adjustStock ? await getPortionsInOrdersBySku() : new Map<string, number>();

  let adjustedCount = 0;

  const payload = await Promise.all(
    products.map(async (product): Promise<ExportPayloadItem> => {
      let set: any[] = [];
      try {
        set = product.set ? JSON.parse(product.set) : [];
      } catch {
        console.warn(`Failed to parse set for product ${product.sku}`);
      }

      let additionalPrices: any[] = [];
      try {
        additionalPrices = product.additionalPrices ? JSON.parse(product.additionalPrices) : [];
      } catch {
        console.warn(`Failed to parse additionalPrices for product ${product.sku}`);
      }

      let stockBalanceByStock: Record<string, number> = {};
      try {
        stockBalanceByStock = product.stockBalanceByStock
          ? JSON.parse(product.stockBalanceByStock)
          : {};
      } catch {
        console.warn(`Failed to parse stockBalanceByStock for product ${product.sku}`);
      }

      // Коригуємо залишок складу "1"
      if (adjustStock) {
        const inOrders = portionsMap.get(product.sku) ?? 0;
        if (inOrders > 0) {
          const current = Number(stockBalanceByStock['1']) || 0;
          stockBalanceByStock = {
            ...stockBalanceByStock,
            '1': Math.max(0, current - inOrders),
          };
          adjustedCount++;
        }
      }

      // Розгортаємо комплекти якщо потрібно
      let finalSet = set;
      if (expandSets && Array.isArray(set) && set.length > 0) {
        const expandedComponents: Record<string, { component: any; quantity: number }> = {};
        await expandSetRecursively(product, expandedComponents, new Set(), 0);
        if (Object.keys(expandedComponents).length > 0) {
          finalSet = Object.entries(expandedComponents).map(([sku, data]) => ({
            id: sku,
            quantity: data.quantity,
            name: data.component.name,
          }));
        }
      }

      return {
        id: product.sku,
        name: product.name,
        sku: product.sku,
        costPerItem: (product.costPerItem || 0).toFixed(5),
        currency: product.currency || 'UAH',
        category: {
          id: product.categoryId || 0,
          name: product.categoryName || '',
        },
        set: finalSet,
        additionalPrices,
        stockBalanceByStock,
      };
    })
  );

  return { payload, adjustedCount };
}
