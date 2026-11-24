import { prisma } from '../../lib/utils.js';
import {
  collectSkusFromOrders,
  getReportProductDescriptors,
  recomputeSetPortions,
  type ReportProductDescriptor,
} from '../../services/orderShipmentMetricsService.js';
import { loadShipmentEvents, type ShipmentEventOrder } from '../../services/shipmentEvents.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import { safeParseItems } from './historyNormalize.js';

/** Спільні парсери операцій (відвантаження, комплектації, переміщення) для історії товару й аналізатора відхилень. */

export type InventoryStorageIds = { smallStorageId: string; mainStorageId: string };

export async function loadInventoryStorageIds(): Promise<InventoryStorageIds> {
  const [smallStorageSetting, mainStorageSetting] = await Promise.all([
    prisma.settingsBase.findUnique({ where: { key: 'dilovod_small_storage_id' } }),
    prisma.settingsBase.findUnique({ where: { key: 'dilovod_main_storage_id' } }),
  ]);
  return {
    smallStorageId: smallStorageSetting?.value || '1100700000001019',
    mainStorageId: mainStorageSetting?.value || '1100700000001005',
  };
}

export function resolveKitStorage(storageId: string | null | undefined, ids: InventoryStorageIds): 'ms' | 'gp' {
  const resolved = storageId || ids.mainStorageId;
  return resolved === ids.smallStorageId ? 'ms' : 'gp';
}

export type ShipmentContext = {
  orders: ShipmentEventOrder[];
  cachedItemsByExternalId: Map<
    string,
    Array<{ sku?: string; name?: string; orderedQuantity?: number; quantity?: number }>
  >;
  productDescriptors: Map<string, ReportProductDescriptor>;
};

/** Події відвантаження в діапазоні + кеш позицій + дескриптори товарів (для computeShippedQuantityForSku). */
export async function loadShipmentContext(range: { start: Date; end: Date }): Promise<ShipmentContext> {
  const { orders, caches } = await loadShipmentEvents({ range, status: 'all', includeItems: true });
  const cachedItemsByExternalId: ShipmentContext['cachedItemsByExternalId'] = new Map();
  if (orders.length === 0) {
    return { orders, cachedItemsByExternalId, productDescriptors: new Map() };
  }
  for (const order of orders) {
    const processedItems = caches.get(order.reportKey)?.processedItems;
    if (!processedItems) continue;
    try {
      const parsed = JSON.parse(processedItems);
      if (Array.isArray(parsed)) {
        cachedItemsByExternalId.set(order.reportKey, parsed);
      }
    } catch {
      // ignore malformed cache
    }
  }

  // collectSkusFromOrders шукає кеш за externalId: подаємо події з ключем reportKey
  const ordersByReportKey = orders.map((order) => ({ ...order, externalId: order.reportKey }));
  const allSkus = collectSkusFromOrders(ordersByReportKey, cachedItemsByExternalId, true);
  const productDescriptors = await getReportProductDescriptors(allSkus);
  recomputeSetPortions(productDescriptors);
  return { orders, cachedItemsByExternalId, productDescriptors };
}

type ReleaseLike = { operDate: Date | null; createdAt: Date; items: unknown };

export function getReleaseOperationDate(release: ReleaseLike): Date {
  const items = Array.isArray(release.items) ? release.items : safeParseItems(release.items);
  const first = items[0] as { operationDate?: string; operation_date?: string } | undefined;
  const operationDateRaw = release.operDate || first?.operationDate || first?.operation_date || null;
  return operationDateRaw ? new Date(operationDateRaw) : release.createdAt;
}

export function getSetNameFromRelease(releaseItems: unknown): string | null {
  const items = Array.isArray(releaseItems) ? releaseItems : safeParseItems(releaseItems);
  const first = items[0] as { name?: string; title?: string; setName?: string } | undefined;
  const name = first?.name ?? first?.title ?? first?.setName ?? null;
  return name ? String(name).trim() || null : null;
}

/** Кількості всіх компонентів комплектації за SKU (з урахуванням components_quantity_mode). */
export function collectComponentQtyBySku(releaseItems: unknown, setQuantity: number): Map<string, number> {
  const result = new Map<string, number>();
  const items = Array.isArray(releaseItems) ? releaseItems : safeParseItems(releaseItems);
  for (const setItem of items) {
    if (!setItem || typeof setItem !== 'object') continue;
    const quantityMode =
      String((setItem as { components_quantity_mode?: unknown }).components_quantity_mode ?? '')
        .toLowerCase() === 'total'
        ? 'total'
        : 'per_set';
    const itemSetQty = Number((setItem as { quantity?: unknown }).quantity ?? setQuantity) || setQuantity || 0;
    const compsRaw =
      (setItem as { components_snapshot?: unknown; componentsSnapshot?: unknown }).components_snapshot ??
      (setItem as { componentsSnapshot?: unknown }).componentsSnapshot ??
      [];
    if (!Array.isArray(compsRaw)) continue;
    for (const component of compsRaw) {
      if (!component || typeof component !== 'object') continue;
      const componentSku = String(
        (component as { sku?: unknown; id?: unknown }).sku ??
          (component as { id?: unknown }).id ??
          '',
      ).trim();
      if (!componentSku) continue;
      const rawQty = Number(
        (component as { quantity?: unknown; qty?: unknown }).quantity ??
          (component as { qty?: unknown }).qty ??
          0,
      );
      if (!Number.isFinite(rawQty) || rawQty === 0) continue;
      result.set(
        componentSku,
        (result.get(componentSku) ?? 0) + (quantityMode === 'total' ? rawQty : rawQty * itemSetQty),
      );
    }
  }
  return result;
}

export function getComponentQtyFromRelease(releaseItems: unknown, sku: string, setQuantity: number): number {
  return collectComponentQtyBySku(releaseItems, setQuantity).get(sku) ?? 0;
}

export async function loadPortionsPerBoxBySku(skus: Iterable<string>): Promise<Map<string, number>> {
  const unique = [...new Set(skus)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const found = await catalogOpsLookup.getBySkus(unique);
  return new Map(catalogOpsLookup.listUnique(found).map((p) => [p.sku, Number(p.portionsPerBox) || 1]));
}

/** Кількість порцій позиції переміщення (totalPortions або порції + коробки * porcій у коробці). */
export function calcMovementItemQty(item: Record<string, unknown>, portionsPerBoxBySku: Map<string, number>): number {
  if (typeof item.totalPortions === 'number' && item.totalPortions !== 0) {
    return item.totalPortions;
  }
  const itemSku = String(item.sku ?? '').trim();
  const ppb = portionsPerBoxBySku.get(itemSku) ?? 1;
  const portions = Number(item.portionQuantity) || 0;
  const boxes = Number(item.boxQuantity) || 0;
  return portions + boxes * ppb;
}

export function collectItemSkus(items: unknown[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const s = String((it as { sku?: string }).sku ?? '').trim();
    if (s) out.push(s);
  }
  return out;
}
