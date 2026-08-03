/**
 * Client types for Products 2.0 UI.
 */

export type {
  CatalogGoodDto,
  CatalogTreeNodeDto,
  CatalogGoodDetailDto,
  CatalogGoodComponentDto,
  CatalogGoodPriceDto,
  CatalogGoodBarcodeDto,
  CatalogGoodImageDto,
  CatalogUnitDto,
  CatalogDictItemDto,
  CatalogDictionariesDto,
  CatalogCreateGoodInput,
  CatalogUpdateGoodInput,
  CatalogStockDto,
} from '@shared/types/catalog';

export {
  CATALOG_TRASH_ID,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_DEFAULT_CURRENCY_ID,
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
} from '@shared/types/catalog';

export const CATALOG_ROOT_ID = 'root';

export interface CatalogTreeItemData {
  id: string;
  name: string;
  isGroup: boolean;
  delMark: boolean;
  sku: string | null;
  isKit: boolean;
  parentId: string | null;
  children: string[];
  sortOrder?: number;
  /** Id дочірньої папки «Архів – …» (прихована в дереві, доступ через іконку). */
  archiveChildId?: string | null;
}

export type DrawerMode = 'create' | 'edit' | 'create-folder' | null;
