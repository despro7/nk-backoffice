/**
 * Shared types for Products 2.0 catalog domain (`catalog_*` + /api/catalog).
 */

/** Dilovod trash folder id («Видалені обʼєкти(смітник)») */
export const CATALOG_TRASH_ID = '1100300000001805';

/** Default mainUnit — шт. */
export const CATALOG_DEFAULT_MAIN_UNIT_ID = '1103600000000001';

/** Accounting policy for regular goods */
export const CATALOG_ACC_POLICY_GOOD = '1201200000001001';

/** Accounting policy for kits (комплекти) */
export const CATALOG_ACC_POLICY_KIT = '1201200000001031';

export interface CatalogGoodDto {
  id: string;
  parentId: string | null;
  isGroup: boolean;
  delMark: boolean;
  name: string;
  sku: string | null;
  mainUnitId: string | null;
  packageRatio: number | null;
  weight: number | null;
  accPolicyId: string | null;
  printName: string | null;
  description: string | null;
  syncedAt: string;
  updatedAt: string;
  /** Has BOM or kit accPolicy */
  isKit?: boolean;
  childrenCount?: number;
}

export interface CatalogTreeNodeDto {
  id: string;
  parentId: string | null;
  name: string;
  isGroup: boolean;
  delMark: boolean;
  sku: string | null;
  isKit: boolean;
  childrenCount: number;
}

export interface CatalogGoodComponentDto {
  id?: number;
  parentGoodId: string;
  componentGoodId: string;
  componentName?: string;
  componentSku?: string | null;
  qty: number;
  rowNum: number;
}

export interface CatalogGoodPriceDto {
  id?: number;
  goodId: string;
  priceType: string;
  price: number;
  currency?: string | null;
}

export interface CatalogGoodBarcodeDto {
  id?: number;
  goodId: string;
  dilovodRegisterId?: string | null;
  code: string;
  /** Dilovod goodPart id; null/undefined = без партії */
  goodPart?: string | null;
  /** goodPart__pr — номер/назва партії для UI */
  goodPartName?: string | null;
  activity: boolean;
}

export interface CatalogStockDto {
  mainStock: number;
  smallStock: number;
  stockBalanceByStock: Record<string, number> | null;
}

export interface CatalogGoodDetailDto extends CatalogGoodDto {
  components: CatalogGoodComponentDto[];
  prices: CatalogGoodPriceDto[];
  barcodes: CatalogGoodBarcodeDto[];
  stock: CatalogStockDto | null;
}

export interface CatalogUnitDto {
  id: string;
  name: string;
  code?: string | null;
}

export interface CatalogCreateGoodInput {
  name: string;
  parentId?: string | null;
  isGroup?: boolean;
  sku?: string | null;
  mainUnitId?: string | null;
  packageRatio?: number | null;
  weight?: number | null;
  accPolicyId?: string | null;
  printName?: string | null;
  description?: string | null;
  components?: Array<{ componentGoodId: string; qty: number; rowNum?: number }>;
  prices?: Array<{ priceType: string; price: number; currency?: string | null }>;
  barcodes?: Array<{
    code: string;
    activity?: boolean;
    goodPart?: string | null;
    goodPartName?: string | null;
  }>;
}

export interface CatalogUpdateGoodInput {
  name?: string;
  parentId?: string | null;
  sku?: string | null;
  mainUnitId?: string | null;
  packageRatio?: number | null;
  weight?: number | null;
  accPolicyId?: string | null;
  printName?: string | null;
  description?: string | null;
  components?: Array<{ componentGoodId: string; qty: number; rowNum?: number }>;
  prices?: Array<{ priceType: string; price: number; currency?: string | null }>;
  barcodes?: Array<{
    code: string;
    activity?: boolean;
    goodPart?: string | null;
    goodPartName?: string | null;
  }>;
}

export interface CatalogMoveInput {
  ids: string[];
  targetParentId: string;
}

export interface CatalogBulkIdsInput {
  ids: string[];
}

export interface CatalogRefreshInput {
  /** Specific Dilovod ids to re-pull; omit for full catalog refresh */
  ids?: string[];
}

export interface CatalogApiListResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
