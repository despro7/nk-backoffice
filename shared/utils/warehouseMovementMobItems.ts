/**
 * Рядки переміщення з mob (скан ШК) vs кеш tpGoods з Dilovod / v2 serializeMovementItems.
 */

export type MovementStoredItem = Record<string, unknown>;

export function movementStoredItemKey(item: MovementStoredItem): string {
  const sku = String(item.sku ?? '').trim();
  const batchId = String(item.batchId ?? '').trim();
  const batchNumber = String(item.batchNumber ?? '').trim();
  const batchKey = batchId || batchNumber;
  return `${sku}::${batchKey}`;
}

/** Чи збережений масив items містить mob-поля (скан / прийом). */
export function isMobMovementStoredItems(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((row) => {
    if (!row || typeof row !== 'object') return false;
    const item = row as MovementStoredItem;
    return (
      'barcode' in item
      || 'barcodeKind' in item
      || 'receivedTotalPortions' in item
      || 'receivedBoxQuantity' in item
      || 'receivedPortionQuantity' in item
    );
  });
}

/**
 * PUT з v2/desktop: зберігаємо ШК, прийом і назву партії з mob-рядка; кількості — з incoming.
 */
export function mergeIncomingPutItemsPreservingMobScan(
  existing: MovementStoredItem[],
  incoming: MovementStoredItem[],
): MovementStoredItem[] {
  if (!isMobMovementStoredItems(existing)) {
    return incoming;
  }

  const existingByKey = new Map(
    existing.map((row) => [movementStoredItemKey(row), row]),
  );

  return incoming.map((row) => {
    const prev = existingByKey.get(movementStoredItemKey(row));
    if (!prev) {
      return row;
    }
    return {
      ...prev,
      productName: row.productName ?? prev.productName,
      boxQuantity: row.boxQuantity ?? prev.boxQuantity,
      portionQuantity: row.portionQuantity ?? prev.portionQuantity,
      totalPortions: row.totalPortions ?? prev.totalPortions,
      batchId: String(row.batchId ?? prev.batchId ?? ''),
      batchNumber: String(prev.batchNumber || row.batchNumber || ''),
      batchStorage: row.batchStorage ?? prev.batchStorage,
      forecast: row.forecast ?? prev.forecast,
    };
  });
}
