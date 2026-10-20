import { isArchiveFolderName } from '@shared/utils/storefrontDescription';

export type WarehouseProductSearchMetaField =
  | 'sku'
  | 'stock'
  | 'folder'
  | 'status'
  | 'updatedAt'
  | 'batch';

export type WarehouseProductSearchMatchType = 'name' | 'sku' | 'barcode' | 'batch';

export interface WarehouseProductSearchIndexItem {
  sku: string;
  name: string;
  catalogGoodId: string;
  parentName: string | null;
  barcodes: string[];
  portionsPerBox: number;
  isOutdated: boolean;
  doNotPublish: boolean;
  delMark: boolean;
  updatedAt: string;
}

export interface WarehouseProductSearchHit extends WarehouseProductSearchIndexItem {
  matchType?: WarehouseProductSearchMatchType;
  batchId?: string | null;
  batchLabel?: string | null;
  stockAtStorage?: number | null;
}

export interface WarehouseProductSearchFilters {
  activeOnly?: boolean;
  includeArchived?: boolean;
  withStockOnly?: boolean;
  withoutStockOnly?: boolean;
}

/** Архів: delMark / isOutdated або папка «Архів – …» (як у каталозі). */
export function isWarehouseProductArchived(
  hit: Pick<WarehouseProductSearchHit, 'delMark' | 'isOutdated' | 'parentName'>,
): boolean {
  if (hit.delMark || hit.isOutdated) return true;
  return isArchiveFolderName(hit.parentName ?? '');
}
