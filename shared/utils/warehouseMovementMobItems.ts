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

export function parseMovementStoredItems(items: unknown): MovementStoredItem[] {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Документ створено через mob-сканування (ШК у рядках або етап прийому зі сканером). */
export function isMovementCreatedViaMobScanFlow(input: {
  items: unknown;
  receiptScanStartedAt?: string | null;
}): boolean {
  if (String(input.receiptScanStartedAt ?? '').trim()) return true;
  return parseMovementStoredItems(input.items).some(
    (row) => String(row.barcode ?? '').trim().length > 0,
  );
}

/**
 * Переміщення з v2/desktop: є рядки, але не mob-скан (наприклад П-00503 без ШК у items).
 */
export function isMovementFromAlternateInterface(input: {
  items: unknown;
  receiptScanStartedAt?: string | null;
}): boolean {
  const rows = parseMovementStoredItems(input.items);
  if (rows.length === 0) return false;
  return !isMovementCreatedViaMobScanFlow(input);
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
