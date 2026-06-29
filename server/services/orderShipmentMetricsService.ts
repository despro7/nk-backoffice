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