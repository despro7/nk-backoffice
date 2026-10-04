export interface ReleaseComponentBatch {
  batchId: string;
  batchNumber?: string;
  barcode?: string;
  quantity: number;
  /** Залишок партії на складі на момент вибору (для обмеження степера). */
  batchStock?: number;
}

export interface ReleaseComponentAllocation {
  sku: string;
  batches: ReleaseComponentBatch[];
}

export interface ReleasePreviewComponent {
  sku: string;
  name: string | null;
  quantity: number;
  allocatedQuantity?: number;
  batches?: ReleaseComponentBatch[];
}

export interface KitOutputBatchInfo {
  batchId: string | null;
  batchNumber: string;
  barcode?: string | null;
  created: boolean;
  expiration?: string | null;
}

export interface ReleaseSendSummary {
  setSku: string;
  setName: string | null;
  quantity: number;
  storageId: string | null;
  storageName: string | null;
  operDate: string | null;
  remark: string | null;
  components: ReleasePreviewComponent[];
  expectedTotal?: number;
  countedTotal?: number;
  shortage?: number;
  surplus?: number;
  surplusBatchName?: string | null;
  kitOutputBatch?: KitOutputBatchInfo | null;
}

export interface ReleaseLastKitBatchesResponse {
  releaseId: number | null;
  dilovodDocId: string | null;
  /** Дата останнього комплектування (локальний формат або ISO). */
  operDate: string | null;
  componentBatches: ReleaseComponentAllocation[];
}

export interface EnsureInventorySetResult {
  sourceSku: string;
  setSku: string;
  setName: string;
  dilovodId: string;
  created: boolean;
}

export interface FillBatchesResult {
  sku: string;
  batches: ReleaseComponentBatch[];
  totalQuantity: number;
  batchCount: number;
}

export const REBATCH_SKU_SUFFIX = '_rebatch';
export const RELEASE_DOC_NUMBER_TEMPLATE = 'K-{######}';

export function formatReleaseDocNumber(sequence: number): string {
  const normalized = Number.isFinite(sequence) && sequence > 0 ? Math.trunc(sequence) : 0;
  return RELEASE_DOC_NUMBER_TEMPLATE.replace('{######}', String(normalized).padStart(6, '0'));
}

export function buildRebatchSku(sourceSku: string): string {
  const normalized = String(sourceSku ?? '').trim();
  return `${normalized}${REBATCH_SKU_SUFFIX}`;
}

export function isRebatchSku(sku: string | null | undefined): boolean {
  return String(sku ?? '').trim().endsWith(REBATCH_SKU_SUFFIX);
}
