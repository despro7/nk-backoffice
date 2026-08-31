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

/** Default currency — UAH */
export const CATALOG_DEFAULT_CURRENCY_ID = '1101200000001001';

/** Роздріб (Інтернет-магазин) */
export const CATALOG_PRICE_TYPE_RETAIL_ID = '1101300000001001';
/** Звичайна */
export const CATALOG_PRICE_TYPE_REGULAR_ID = '1101300000001007';
/** Військові */
export const CATALOG_PRICE_TYPE_MILITARY_ID = '1101300000001012';

/** Основні типи цін Dilovod: Роздріб (ІМ), Звичайна, Військові */
export const CATALOG_MAIN_PRICE_TYPE_IDS = [
  CATALOG_PRICE_TYPE_RETAIL_ID,
  CATALOG_PRICE_TYPE_REGULAR_ID,
  CATALOG_PRICE_TYPE_MILITARY_ID,
] as const;

/** Знижка військової ціни за одну порцію, грн */
export const CATALOG_MILITARY_DISCOUNT_PER_PORTION = 5;

/**
 * Назва кореневої папки готової продукції в Dilovod.
 * Компоненти BOM комплекту шукаються лише в цій папці (рекурсивно).
 */
export const CATALOG_FINISHED_PRODUCTS_FOLDER_NAME = 'Готова продукція';

/** Папка «Готова продукція» — порції та комплекти (`/products#folder=…`). */
export const CATALOG_FINISHED_PRODUCTS_FOLDER_ID = '1100300000001026';

/** Папка матеріалів (`/products#folder=…`). */
export const CATALOG_MATERIALS_FOLDER_ID = '1100300000001651';

export interface CatalogGoodImageDto {
  id: number;
  goodId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  sortOrder: number;
  isPrimary: boolean;
  /** Публічний URL для preview (/uploads/catalog/...) */
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** Прогалини обовʼязкових реквізитів картки. */
export interface CatalogMissingRequired {
  /** Назви основних типів цін, яких бракує або вони ≤ 0. */
  prices: string[];
  weight: boolean;
  packageRatio: boolean;
}

export interface CatalogGoodDto {
  id: string;
  parentId: string | null;
  parentName: string | null;
  isGroup: boolean;
  delMark: boolean;
  name: string;
  sku: string | null;
  mainUnitId: string | null;
  packageRatio: number | null;
  weight: number | null;
  /** Dilovod `specQty` — «Розрахунок на N шт.» специфікації продукції */
  specQty: number | null;
  accPolicyId: string | null;
  printName: string | null;
  /** Короткий опис → Dilovod */
  description: string | null;
  /** Повний опис лише локально (WP) */
  fullDescription: string | null;
  /** Локальний порядок siblings (інтервал крок 10) */
  sortOrder: number;
  /** Локальний коеф. порцій; dual-write → products.unitRatio */
  unitRatio: number | null;
  /** Розпарсені залишки з stockBalanceByStock */
  mainStock?: number;
  smallStock?: number;
  stockBalanceByStock?: Record<string, number> | null;
  syncedAt: string;
  updatedAt: string;
  /** Has BOM or kit accPolicy */
  isKit?: boolean;
  childrenCount?: number;
  /** Обовʼязкові поля, яких бракує (продукція / набір). */
  missingRequired?: CatalogMissingRequired;
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
  sortOrder?: number;
}

export interface CatalogGoodComponentDto {
  id?: number;
  parentGoodId: string;
  componentGoodId: string;
  componentName?: string;
  componentSku?: string | null;
  /** Вага компонента з картки, кг (для прогнозу ваги батьківського обʼєкта) */
  componentWeight?: number | null;
  /** Політика обліку компонента (щоб відрізняти інгредієнти від продукції) */
  componentAccPolicyId?: string | null;
  qty: number;
  rowNum: number;
  /** Од. виміру рядка tpGoods (для специфікації) */
  unitId?: string | null;
  /** Примітка рядка специфікації ↔ Dilovod tpGoods.remark */
  note?: string | null;
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
  images: CatalogGoodImageDto[];
  stock: CatalogStockDto | null;
}

export interface CatalogUnitDto {
  id: string;
  name: string;
  code?: string | null;
}

/** Універсальний рядок довідника Dilovod (id + назва). */
export interface CatalogDictItemDto {
  id: string;
  name: string;
  code?: string | null;
}

export interface CatalogDictionariesDto {
  units: CatalogDictItemDto[];
  priceTypes: CatalogDictItemDto[];
  currencies: CatalogDictItemDto[];
  accPolicies: CatalogDictItemDto[];
}

export interface CatalogCreateGoodInput {
  name: string;
  parentId?: string | null;
  isGroup?: boolean;
  sku?: string | null;
  mainUnitId?: string | null;
  packageRatio?: number | null;
  weight?: number | null;
  specQty?: number | null;
  accPolicyId?: string | null;
  printName?: string | null;
  description?: string | null;
  fullDescription?: string | null;
  unitRatio?: number | null;
  /** Staging-сесія зображень — commit після create */
  stagingSessionId?: string | null;
  components?: Array<{
    componentGoodId: string;
    qty: number;
    rowNum?: number;
    unitId?: string | null;
    note?: string | null;
  }>;
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
  parentName?: string | null;
  isGroup?: boolean;
  sku?: string | null;
  mainUnitId?: string | null;
  packageRatio?: number | null;
  weight?: number | null;
  specQty?: number | null;
  accPolicyId?: string | null;
  printName?: string | null;
  description?: string | null;
  fullDescription?: string | null;
  unitRatio?: number | null;
  components?: Array<{
    componentGoodId: string;
    qty: number;
    rowNum?: number;
    unitId?: string | null;
    note?: string | null;
  }>;
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

/** Bulk-зміна політики обліку (`accPolicy`) для товарів, не груп. */
export interface CatalogChangeTypeInput {
  ids: string[];
  accPolicyId: string;
}

/** Reorder sibling у межах parentId (інтервальний sortOrder). */
export interface CatalogReorderInput {
  parentId: string | null;
  id: string;
  /** Id елемента, перед яким ставимо (null/omit = в кінець, якщо немає afterId) */
  beforeId?: string | null;
  /** Id елемента, після якого ставимо (null/omit = на початок, якщо немає beforeId) */
  afterId?: string | null;
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
