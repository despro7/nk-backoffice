/** Рівень відсканованого ШК: порція або коробка. */
export type WarehouseBarcodeKind = 'portion' | 'box';

/**
 * Відповідь GET /api/warehouse/product-by-barcode?code=…
 *
 * Залишки складів: GET /api/warehouse/stock-snapshot?skus=… → stocks[sku].storages[storageId].
 * Запасний шлях — POST /stock-snapshot з body.storageId → selectedStock.
 */
export interface WarehouseProductByBarcodeResponse {
  sku: string;
  name: string;
  /** Вага порції в грамах (`products.weight`). */
  weight: number | null;
  portionsPerBox: number;
  /** Відсканований / знайдений код. */
  barcode: string;
  barcodeKind: WarehouseBarcodeKind;
  /** Dilovod `goodPart` id; null якщо ШК без партії. */
  batchId: string | null;
  /** `goodPartName` (номер партії для UI); null якщо немає. */
  batchNumber: string | null;
}
