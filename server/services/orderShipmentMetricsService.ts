import { prisma } from '../lib/utils.js';

type ShipmentItem = {
  sku?: string;
  name?: string;
  orderedQuantity?: number | string;
  quantity?: number | string;
};

type ShipmentPayloadData = {
  shipment?: {
    bySku?: Record<string, {
      quantity?: number | string;
      orderedQuantity?: number | string;
    }>;
  };
};

type OrderLike = {
  items: unknown;
  payloadData?: unknown;
};

type QuantityLikeRow = {
  items?: unknown;
};

export type ReportProductDescriptor = {
  sku: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  isSet: boolean;
  setPortions: number;
  setComponents: Array<{ sku: string; quantity: number }>;
  stockBalances: Record<string, number>;
};

export type ShippedQuantityBreakdown = {
  cacheQuantity: number;
  monolithicSetQuantity: number;
  monolithicComponentQuantity: number;
  isMonolithicSet: boolean;
};

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStockBalances(value: string | null | undefined): Record<string, number> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([warehouseId, balance]) => [warehouseId, Number(balance) || 0]),
    );
  } catch {
    return {};
  }
}

function parseSetComponents(value: string | null | undefined): Array<{ sku: string; quantity: number }> {
  const components = parseJsonArray(value);
  return components
    .map((component) => {
      const item = component as { id?: string; sku?: string; quantity?: unknown; qty?: unknown } | null;
      const sku = item?.id ?? item?.sku ?? '';
      const quantity = Number(item?.quantity ?? item?.qty ?? 0);
      return { sku: typeof sku === 'string' ? sku.trim() : String(sku).trim(), quantity };
    })
    .filter((c) => c.sku && c.quantity > 0);
}

function getSetPortions(value: string | null | undefined): number {
  const components = parseJsonArray(value);

  return components.reduce<number>((total: number, component: unknown) => {
    const componentItem = component as { quantity?: unknown; qty?: unknown } | null | undefined;
    const quantity = Number(componentItem?.quantity ?? componentItem?.qty ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return total;
    }

    return total + quantity;
  }, 0);
}

function normalizeCategoryKey(categoryId: number | null, categoryName: string | null): string | null {
  if (categoryId !== null) {
    return `category_${categoryId}`;
  }

  if (categoryName && categoryName.trim()) {
    return `category_${categoryName.trim().toLowerCase().replace(/\s+/g, '_')}`;
  }

  return null;
}

function normalizeCategoryLabel(categoryName: string | null): string | null {
  if (categoryName && categoryName.trim()) {
    return categoryName.trim();
  }

  return null;
}

export function getOrderedQuantity(value: unknown): number {
  const quantity = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function normalizeOrderItems(items: unknown): ShipmentItem[] {
  if (Array.isArray(items)) {
    return items as ShipmentItem[];
  }

  if (typeof items === 'string') {
    if (!items.trim() || items === '[object Object]') {
      return [];
    }

    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as ShipmentItem[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function extractShipmentPayloadItems(payloadData: unknown): ShipmentItem[] {
  const shipmentBySku = (payloadData as ShipmentPayloadData | null | undefined)?.shipment?.bySku;
  if (!shipmentBySku || typeof shipmentBySku !== 'object') {
    return [];
  }

  return Object.entries(shipmentBySku).flatMap(([sku, shipmentItem]) => {
    const normalizedSku = typeof sku === 'string' ? sku.trim() : '';
    const quantityValue = shipmentItem?.quantity ?? shipmentItem?.orderedQuantity ?? 0;
    const orderedQuantity = Number(typeof quantityValue === 'string' ? quantityValue.replace(',', '.') : quantityValue);

    if (!normalizedSku || !Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
      return [];
    }

    return [{
      sku: normalizedSku,
      name: normalizedSku,
      orderedQuantity,
      quantity: orderedQuantity,
    }];
  });
}

export function getOrderReportItems(
  order: OrderLike,
  cachedItems: ShipmentItem[] | null | undefined,
  includeShipmentPayload: boolean,
): ShipmentItem[] {
  const baseItems = cachedItems ?? normalizeOrderItems(order.items);

  if (!includeShipmentPayload) {
    return baseItems;
  }

  const shipmentItems = extractShipmentPayloadItems(order.payloadData);
  return shipmentItems.length > 0 ? [...baseItems, ...shipmentItems] : baseItems;
}

/**
 * Перераховує setPortions для всіх наборів у descriptors рекурсивно.
 */
export function recomputeSetPortions(descriptors: Map<string, ReportProductDescriptor>): void {
  const cache = new Map<string, number>();

  function computePortions(sku: string, visited: Set<string>): number {
    if (cache.has(sku)) return cache.get(sku)!;
    if (visited.has(sku)) return 0;

    const descriptor = descriptors.get(sku);
    if (!descriptor || descriptor.setComponents.length === 0) {
      cache.set(sku, 1);
      return 1;
    }

    const nextVisited = new Set(visited).add(sku);
    let total = 0;
    for (const component of descriptor.setComponents) {
      total += component.quantity * computePortions(component.sku, nextVisited);
    }

    cache.set(sku, total);
    return total;
  }

  for (const [, descriptor] of descriptors) {
    if (descriptor.setComponents.length > 0) {
      descriptor.setPortions = computePortions(descriptor.sku, new Set());
    }
  }
}

/**
 * Рекурсивно розгортає набір до листових SKU.
 */
export function expandSetToLeaves(
  sku: string,
  quantity: number,
  descriptors: Map<string, ReportProductDescriptor>,
  visited: Set<string> = new Set(),
): Map<string, number> {
  const result = new Map<string, number>();

  if (visited.has(sku)) {
    return result;
  }

  const descriptor = descriptors.get(sku);
  if (!descriptor || descriptor.setComponents.length === 0) {
    result.set(sku, quantity);
    return result;
  }

  const nextVisited = new Set(visited).add(sku);
  for (const component of descriptor.setComponents) {
    const subResult = expandSetToLeaves(component.sku, quantity * component.quantity, descriptors, nextVisited);
    for (const [leafSku, leafQty] of subResult) {
      result.set(leafSku, (result.get(leafSku) ?? 0) + leafQty);
    }
  }

  return result;
}

export async function getReportProductDescriptors(skus: Iterable<string>): Promise<Map<string, ReportProductDescriptor>> {
  const uniqueSkus = Array.from(new Set(Array.from(skus).filter(Boolean)));

  if (uniqueSkus.length === 0) {
    return new Map();
  }

  const products = await prisma.product.findMany({
    where: {
      sku: {
        in: uniqueSkus,
      },
    },
    select: {
      sku: true,
      name: true,
      categoryId: true,
      categoryName: true,
      set: true,
      stockBalanceByStock: true,
    },
  });

  return new Map(
    products.map((product) => {
      const categoryKey = normalizeCategoryKey(product.categoryId ?? null, product.categoryName ?? null);
      const categoryLabel = normalizeCategoryLabel(product.categoryName ?? null);

      return [
        product.sku,
        {
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId ?? null,
          categoryName: product.categoryName ?? null,
          categoryKey,
          categoryLabel,
          isSet: parseJsonArray(product.set).length > 0,
          setPortions: getSetPortions(product.set),
          setComponents: parseSetComponents(product.set),
          stockBalances: parseStockBalances(product.stockBalanceByStock),
        },
      ];
    }),
  );
}

function sumCachedQuantityForSku(cachedItems: ShipmentItem[] | null | undefined, targetSku: string): number {
  const normalizedSku = String(targetSku).trim();
  if (!cachedItems || cachedItems.length === 0) {
    return 0;
  }

  return cachedItems
    .filter((item) => item && String(item.sku).trim() === normalizedSku)
    .reduce((sum, item) => sum + getOrderedQuantity(item.orderedQuantity ?? item.quantity), 0);
}

export function computeShippedQuantityBreakdown(
  order: OrderLike,
  cachedItems: ShipmentItem[] | null | undefined,
  targetSku: string,
  descriptors: Map<string, ReportProductDescriptor>,
): ShippedQuantityBreakdown {
  const normalizedSku = String(targetSku).trim();
  const shipmentItems = extractShipmentPayloadItems(order.payloadData);
  const shipmentSkuSet = new Set(shipmentItems.map((item) => String(item.sku).trim()));
  const isMonolithicSet = shipmentSkuSet.has(normalizedSku);

  let monolithicSetQuantity = 0;
  for (const monoItem of shipmentItems) {
    if (String(monoItem.sku).trim() === normalizedSku) {
      monolithicSetQuantity += getOrderedQuantity(monoItem.orderedQuantity ?? monoItem.quantity);
    }
  }

  let monolithicComponentQuantity = 0;
  for (const monoItem of shipmentItems) {
    const monoQty = getOrderedQuantity(monoItem.orderedQuantity ?? monoItem.quantity);
    if (monoQty <= 0) continue;

    const leaves = expandSetToLeaves(monoItem.sku ?? '', monoQty, descriptors);
    monolithicComponentQuantity += leaves.get(normalizedSku) ?? 0;
  }

  const cacheQuantity = sumCachedQuantityForSku(cachedItems, normalizedSku);

  return {
    cacheQuantity,
    monolithicSetQuantity,
    monolithicComponentQuantity,
    isMonolithicSet,
  };
}

/**
 * Рахує shipped-метрику для SKU з розділенням монолітних наборів і звичайних порцій.
 * Для SKU-набору з shipment.bySku — кількість наборів; для leaf — cache без mono-компонентів.
 */
export function computeShippedQuantityForSku(
  order: OrderLike,
  cachedItems: ShipmentItem[] | null | undefined,
  targetSku: string,
  descriptors: Map<string, ReportProductDescriptor>,
): number {
  const breakdown = computeShippedQuantityBreakdown(order, cachedItems, targetSku, descriptors);

  if (breakdown.isMonolithicSet) {
    return breakdown.monolithicSetQuantity;
  }

  return Math.max(0, breakdown.cacheQuantity - breakdown.monolithicComponentQuantity);
}

export function computeRegularShippedQuantityForSku(
  order: OrderLike,
  cachedItems: ShipmentItem[] | null | undefined,
  targetSku: string,
  descriptors: Map<string, ReportProductDescriptor>,
): number {
  const breakdown = computeShippedQuantityBreakdown(order, cachedItems, targetSku, descriptors);
  return Math.max(
    0,
    breakdown.cacheQuantity - breakdown.monolithicComponentQuantity - breakdown.monolithicSetQuantity,
  );
}

export function collectSkusFromOrders(
  orders: Array<{ items?: unknown; payloadData?: unknown }>,
  cachedItemsByExternalId: Map<string, ShipmentItem[]>,
  includeShipmentPayload: boolean,
): Set<string> {
  const allSkus = new Set<string>();

  for (const order of orders) {
    for (const item of normalizeOrderItems(order.items)) {
      if (item.sku) {
        allSkus.add(String(item.sku).trim());
      }
    }

    if (includeShipmentPayload) {
      for (const item of extractShipmentPayloadItems(order.payloadData)) {
        if (item.sku) {
          allSkus.add(String(item.sku).trim());
        }
      }
    }
  }

  for (const cachedItems of cachedItemsByExternalId.values()) {
    for (const item of cachedItems) {
      if (item.sku) {
        allSkus.add(String(item.sku).trim());
      }
    }
  }

  return allSkus;
}

function parseQuantityValue(value: unknown): number {
  const normalizedValue = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
}

export function sumQuantityForSku(rows: QuantityLikeRow[] | null | undefined, skuToMatch: string): number {
  if (!rows || rows.length === 0) {
    return 0;
  }

  const normalizedSku = String(skuToMatch ?? '').trim();
  if (!normalizedSku) {
    return 0;
  }

  let sum = 0;

  for (const row of rows) {
    if (!row || row.items == null) {
      continue;
    }

    let items: unknown[] = [];
    if (Array.isArray(row.items)) {
      items = row.items;
    } else if (typeof row.items === 'string') {
      try {
        const parsed = JSON.parse(row.items);
        items = Array.isArray(parsed) ? parsed : [];
      } catch {
        continue;
      }
    } else {
      continue;
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const itemSku = String((item as { sku?: unknown }).sku ?? '').trim();
      if (itemSku !== normalizedSku) {
        continue;
      }

      const quantity = parseQuantityValue(
        (item as {
          portionQuantity?: unknown;
          qty?: unknown;
          quantity?: unknown;
          boxQuantity?: unknown;
        }).portionQuantity ??
          (item as { qty?: unknown }).qty ??
          (item as { quantity?: unknown }).quantity ??
          (item as { boxQuantity?: unknown }).boxQuantity ??
          0,
      );

      if (quantity > 0) {
        sum += quantity;
      }
    }
  }

  return sum;
}
