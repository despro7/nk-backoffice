/** Партія товару, створена з картки товару (Dilovod catalogs.goodParts + порційний ШК). */

/** Що означає дата партії: власне виробництво чи надходження зовнішнього товару (лише підпис у UI). */
export type ProductBatchDateKind = 'production' | 'receipt';

export interface ProductBatchSameDayItem {
  batchId: string;
  /** Серійний № партії (YMMDD або YMMDD-N) */
  batchNumber: string;
  expiration: string | null;
  barcodes: string[];
}

export interface ProductBatchPreview {
  /** День партії YYYY-MM-DD */
  date: string;
  /** YMMDD */
  baseName: string;
  /** Назва, яку отримає нова партія */
  batchName: string;
  /** Партії цього товару за той самий день */
  sameDay: ProductBatchSameDayItem[];
}

export interface ProductBatchCreateInput {
  date: string;
  expiration: string;
  /** Не створювати нову партію, а дореєструвати ШК для наявної партії цього дня */
  reuseBatchId?: string | null;
}

export interface ProductBatchCreateResult {
  batchId: string;
  batchNumber: string;
  barcode: string | null;
  /** Партію створено зараз (false – використано наявну) */
  created: boolean;
  /** ШК зареєстровано зараз */
  barcodeCreated: boolean;
  /** Партія є, але ШК не зареєстровано */
  barcodeError?: string;
}
