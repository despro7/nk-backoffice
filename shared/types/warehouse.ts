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

export interface WarehouseBatchBarcodeItem {
  code: string;
  /** Дата реєстрації ШК у локальному каталозі (updatedAt). */
  registeredAt: string | null;
}

/** Рядок GET /api/warehouse/batches */
export interface WarehouseBatchListItem {
  batchId: string;
  /** Серійний № / номер партії */
  batchNumber: string;
  /** Дата виготовлення (catalogs.goodParts.date) */
  createdAt: string | null;
  expiration: string | null;
  productId: string;
  productName: string;
  sku: string | null;
  /** Залишок на складі готової продукції */
  quantityGp: number;
  /** Залишок на малому складі */
  quantityMs: number;
  /** Сумарний залишок по всіх складах/фірмах */
  totalQuantity: number;
  barcodeCount: number;
  /** Усі ШК, від новіших до старіших */
  barcodes: WarehouseBatchBarcodeItem[];
  /** Останній доданий ШК */
  lastBarcode: string | null;
  lastBarcodeRegisteredAt: string | null;
}

export interface WarehouseBatchesListResponse {
  success: boolean;
  data: WarehouseBatchListItem[];
  meta: {
    total: number;
    onlyWithStock: boolean;
    limit: number;
  };
}
