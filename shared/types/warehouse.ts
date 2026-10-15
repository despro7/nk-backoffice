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

/** Тип партії для фільтра /warehouse/batches */
export type WarehouseBatchKind =
  | 'product'
  | 'kit'
  | 'virtualProduct'
  | 'virtualKit';

/** Режим фільтра мінусових залишків на /warehouse/batches */
export type WarehouseBatchNegativeMode = 'without' | 'only' | 'all';

export const WAREHOUSE_BATCH_KIND_OPTIONS: Array<{
  key: WarehouseBatchKind;
  label: string;
}> = [
  { key: 'product', label: 'Товари' },
  { key: 'kit', label: 'Комплекти' },
  { key: 'virtualProduct', label: 'Віртуальні товари' },
  { key: 'virtualKit', label: 'Віртуальні комплекти' },
];

export const WAREHOUSE_BATCH_DEFAULT_KINDS: WarehouseBatchKind[] = ['product', 'kit'];

export const WAREHOUSE_BATCH_NEGATIVE_MODE_OPTIONS: Array<{
  key: WarehouseBatchNegativeMode;
  label: string;
}> = [
  { key: 'without', label: 'Без мінусів' },
  { key: 'only', label: 'Лише з мінусами' },
  { key: 'all', label: 'Всі' },
];

/** Рядок GET /api/warehouse/batches */
export interface WarehouseBatchListItem {
  batchId: string;
  /** Серійний № / номер партії */
  batchNumber: string;
  /** Дата виготовлення (catalogs.goodParts.date); null для віртуальних */
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
  /** Класифікація для фільтра типів */
  batchKind: WarehouseBatchKind;
  /** Не catalogs.goodParts (document-партія з балансу) */
  isVirtual: boolean;
  /** Комплект за accPolicy */
  isKit: boolean;
}

export interface WarehouseBatchesListResponse {
  success: boolean;
  data: WarehouseBatchListItem[];
  meta: {
    total: number;
    onlyWithStock: boolean;
    negativeMode: WarehouseBatchNegativeMode;
    batchKinds: WarehouseBatchKind[];
    limit: number;
  };
}
