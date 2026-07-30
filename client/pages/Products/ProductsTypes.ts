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
  CatalogUnitDto,
  CatalogCreateGoodInput,
  CatalogUpdateGoodInput,
  CatalogStockDto,
} from '@shared/types/catalog';

export {
  CATALOG_TRASH_ID,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
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
}

export type DrawerMode = 'create' | 'edit' | 'create-folder' | null;
