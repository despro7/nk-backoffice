/**
 * Контракт конструктора складських звітів і шаблону «Відомість по складу».
 *
 * Імена вимірів/ресурсів регістру — з `GET /api/reports/warehouse-statement/meta`
 * (`shape` / нормалізовані списки), не з захардкодженого enum. Синтетичні id
 * (`group`, sales value) живуть лише в цьому додатку і не йдуть у BAT-поля регістру.
 *
 * Імпорт: `@shared/types/warehouseStatement` (client) або `../../shared/types/warehouseStatement.js` (server).
 */

// --- Регістр (slim shape без Dilovod `raw`) --------------------------------

export type WarehouseStatementRegisterFieldKind = 'dimension' | 'resource' | 'attribute';

/** Поле регістру з `dilovodMetadataService.getRegisterShape` (без raw metadata). */
export interface WarehouseStatementRegisterField {
  name: string;
  presentation: string;
  valueType?: string;
  kind: WarehouseStatementRegisterFieldKind;
}

export interface WarehouseStatementRegisterShape {
  objectName: string;
  registerName: string;
  presentation?: string;
  dimensions: WarehouseStatementRegisterField[];
  resources: WarehouseStatementRegisterField[];
  attributes: WarehouseStatementRegisterField[];
}

/** Класифікація ресурсу shape для UI (qty vs гроші); не імʼя поля в Dilovod. */
export type WarehouseStatementResourceRole = 'qty' | 'money' | 'other';

export interface WarehouseStatementResourceMeta extends WarehouseStatementRegisterField {
  kind: 'resource';
  role: WarehouseStatementResourceRole;
}

// --- Виміри конструктора ---------------------------------------------------

/**
 * Синтетичний вимір: ієрархія груп `catalog_goods`.
 * Не є полем регістру — не класти в `from.dimensions` / BAT `fields`.
 */
export const WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP = 'group' as const;

export type WarehouseStatementSyntheticDimensionId =
  typeof WAREHOUSE_STATEMENT_SYNTHETIC_DIMENSION_GROUP;

/**
 * Id виміру: `shape.dimensions[].name` або синтетичний `group`.
 * У пресеті зберігати саме ці рядки; зникле з meta — ігнорувати.
 */
export type WarehouseStatementDimensionId = string;

export type WarehouseStatementDimensionSource = 'register' | 'synthetic';

export interface WarehouseStatementDimensionMeta {
  id: WarehouseStatementDimensionId;
  source: WarehouseStatementDimensionSource;
  presentation: string;
  /** Dilovod valueType, напр. `catalogs.goods`. Немає у синтетичного `group`. */
  valueType?: string;
}

/**
 * Підказки valueType для привʼязки фільтрів UI до вимірів shape.
 * Це типи каталогів Dilovod, не імена полів регістру (`good` / `storage` не хардкодити).
 */
export const WAREHOUSE_STATEMENT_VALUE_TYPES = {
  goods: 'catalogs.goods',
  storages: 'catalogs.storages',
  firms: 'catalogs.firms',
} as const;

/**
 * Dilovod інколи віддає union `valueType` через `|`.
 * Порівняння має дивитися на частини, не лише на точний рядок.
 */
export function warehouseStatementValueTypeIncludes(
  fieldValueType: string | undefined,
  wanted: string,
): boolean {
  if (!fieldValueType || !wanted) return false;
  const needle = wanted.trim().toLowerCase();
  return fieldValueType
    .split('|')
    .map((part) => part.trim().toLowerCase())
    .includes(needle);
}

// --- Метрики / колонки BAT + синтетика -------------------------------------

/** Слоти віртуальних полів Dilovod `balanceAndTurnover` (`virtualBatFields`). */
export const WAREHOUSE_STATEMENT_BAT_SLOTS = ['start', 'receipt', 'expense', 'final'] as const;
export type WarehouseStatementBatSlot = (typeof WAREHOUSE_STATEMENT_BAT_SLOTS)[number];

const BAT_SLOT_SUFFIX: Record<WarehouseStatementBatSlot, string> = {
  start: 'Start',
  receipt: 'Receipt',
  expense: 'Expense',
  final: 'Final',
};

/**
 * Id BAT-колонки = `virtualBatFields(resourceName)[slot]` (`qtyStart`, …).
 * `resourceName` брати зі shape, не літералом у payload.
 */
export function warehouseStatementBatFieldId(
  resourceName: string,
  slot: WarehouseStatementBatSlot,
): string {
  return `${resourceName}${BAT_SLOT_SUFFIX[slot]}`;
}

export function warehouseStatementVirtualBatFields(
  resourceName: string,
): Record<WarehouseStatementBatSlot, string> {
  return {
    start: warehouseStatementBatFieldId(resourceName, 'start'),
    receipt: warehouseStatementBatFieldId(resourceName, 'receipt'),
    expense: warehouseStatementBatFieldId(resourceName, 'expense'),
    final: warehouseStatementBatFieldId(resourceName, 'final'),
  };
}

/** Похідна собівартість одиниці для грошового ресурсу: `{resourceName}UnitCost`. */
export function warehouseStatementUnitCostMetricId(resourceName: string): string {
  return `${resourceName}UnitCost`;
}

/** Префікс синтетичних метрик вартості по цінах продажу. Не поле регістру. */
export const WAREHOUSE_STATEMENT_SALES_VALUE_METRIC_PREFIX = 'salesValue' as const;

export const WAREHOUSE_STATEMENT_SALES_UNIT_PRICE_METRIC_ID = 'salesUnitPrice' as const;

/** (ціна продажу − собівартість од.) ÷ ціна продажу. Не поле регістру. */
export const WAREHOUSE_STATEMENT_SALES_PROFITABILITY_METRIC_ID = 'salesProfitability' as const;

export function warehouseStatementSalesValueMetricId(slot: WarehouseStatementBatSlot): string {
  return `${WAREHOUSE_STATEMENT_SALES_VALUE_METRIC_PREFIX}${BAT_SLOT_SUFFIX[slot]}`;
}

export const WAREHOUSE_STATEMENT_SALES_VALUE_METRIC_IDS = {
  start: warehouseStatementSalesValueMetricId('start'),
  receipt: warehouseStatementSalesValueMetricId('receipt'),
  expense: warehouseStatementSalesValueMetricId('expense'),
  final: warehouseStatementSalesValueMetricId('final'),
} as const;

/**
 * Id метрики/колонки: BAT-поле з meta.batColumns, `{resource}UnitCost`,
 * `salesValue{Start|Receipt|Expense|Final}`, `salesUnitPrice`, `salesProfitability`.
 */
export type WarehouseStatementMetricId = string;

export type WarehouseStatementMetricKind =
  | 'bat'
  | 'unitCost'
  | 'salesValue'
  | 'salesUnitPrice'
  | 'salesProfitability';

export type WarehouseStatementMetricFormat = 'qty' | 'money' | 'percent';

export interface WarehouseStatementBatColumnMeta {
  id: WarehouseStatementMetricId;
  resourceName: string;
  slot: WarehouseStatementBatSlot;
  presentation: string;
}

export interface WarehouseStatementMetricMeta {
  id: WarehouseStatementMetricId;
  kind: WarehouseStatementMetricKind;
  presentation: string;
  format: WarehouseStatementMetricFormat;
  /** Імʼя ресурсу shape; немає у чисто синтетичних sales-метрик. */
  resourceName?: string;
  slot?: WarehouseStatementBatSlot;
}

// --- Фільтри / період / витрата --------------------------------------------

export type WarehouseStatementPeriodMode = 'dateRange' | 'asOfDate';

/** Дати — `YYYY-MM-DD` (календарний день, не Date ISO datetime). */
export type WarehouseStatementPeriod =
  | { mode: 'dateRange'; startDate: string; endDate: string }
  | { mode: 'asOfDate'; asOfDate: string };

/**
 * Розкладка витрати (не змінює opening/closing регістру):
 * `sale` → documents.sale*, `goodMoving` → documents.goodMoving, `goodWriteOff` → documents.goodWriteOff.
 */
export const WAREHOUSE_STATEMENT_EXPENSE_KINDS = ['sale', 'goodMoving', 'goodWriteOff'] as const;
export type WarehouseStatementExpenseKind = (typeof WAREHOUSE_STATEMENT_EXPENSE_KINDS)[number];

export interface WarehouseStatementDirectoryItem {
  id: string;
  name: string;
  /** Батьківська група каталогу; `null` — корінь (як у Товари 2.0). */
  parentId?: string | null;
  /** Рівень вкладеності для UI (DFS, як дерево каталогу). */
  depth?: number;
}

/** Як підписувати колонки в шапці таблиці. */
export const WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES = ['full', 'short'] as const;
export type WarehouseStatementColumnHeaderStyle =
  (typeof WAREHOUSE_STATEMENT_COLUMN_HEADER_STYLES)[number];

/**
 * Імена вимірів складу/товару/фірми та qty-ресурсу, резолвлені з live shape за valueType / role.
 * Якщо виміру немає в shape — поле відсутнє (не підставляти літерал).
 */
export interface WarehouseStatementResolvedShapeNames {
  goodsDimensionName?: string;
  storageDimensionName?: string;
  firmDimensionName?: string;
  qtyResourceName?: string;
}

// --- GET /api/reports/warehouse-statement/meta -----------------------------

export interface WarehouseStatementMetaResponse {
  shape: WarehouseStatementRegisterShape;
  dimensions: WarehouseStatementDimensionMeta[];
  resources: WarehouseStatementResourceMeta[];
  batColumns: WarehouseStatementBatColumnMeta[];
  metrics: WarehouseStatementMetricMeta[];
  resolved: WarehouseStatementResolvedShapeNames;
  storages: WarehouseStatementDirectoryItem[];
  firms: WarehouseStatementDirectoryItem[];
  groups: WarehouseStatementDirectoryItem[];
  priceTypes: WarehouseStatementDirectoryItem[];
  /**
   * Дефолт групування: вимір складу → `group` → вимір товару,
   * лише ті, що є в `dimensions`.
   */
  defaultGrouping: WarehouseStatementDimensionId[];
  /** Дефолт колонок: BAT кількості + BAT собівартості + «за одиницю». */
  defaultColumns: WarehouseStatementMetricId[];
}

// --- POST /api/reports/warehouse-statement ---------------------------------

/**
 * Тіло запиту відомості.
 *
 * `dimensionFilters` — ключі = `shape.dimensions[].name` (не `storage`/`good` літералами).
 * `grouping` / `columns` — id з meta; невідомі після оновлення shape ігнорувати.
 * `groupIds` — Dilovod id груп товарів (`ILH` по виміру товару з shape).
 */
/** Елемент списку «Виключення»: група каталогу, товар або інший вимір. */
export interface WarehouseStatementExclusion {
  dimensionId: WarehouseStatementDimensionId;
  valueId: string;
  label?: string;
}

export interface WarehouseStatementQueryRequest {
  period: WarehouseStatementPeriod;
  dimensionFilters?: Record<string, string[]>;
  groupIds?: string[];
  /** Виключити групи / товари / інші значення вимірів після відбору. */
  exclusions?: WarehouseStatementExclusion[];
  expenseKinds?: WarehouseStatementExpenseKind[];
  /** Id типу цін Dilovod; omit → settings `mainPriceType`. */
  priceType?: string;
  grouping: WarehouseStatementDimensionId[];
  columns: WarehouseStatementMetricId[];
  hideZeroQty?: boolean;
}

export type WarehouseStatementRowKind = 'total' | 'group' | 'leaf';

export interface WarehouseStatementRow {
  id: string;
  kind: WarehouseStatementRowKind;
  /** Вимір цього рівня дерева; немає у кореневому total. */
  dimensionId?: WarehouseStatementDimensionId;
  /** Id значення (Dilovod / група каталогу). */
  valueId?: string;
  /** Безпосередня батьківська група каталогу (для виключення ієрархії). */
  groupId?: string;
  label: string;
  sku?: string | null;
  /** Товар з delMark, у смітнику або в папці «Архів – …». */
  inactive?: boolean;
  depth: number;
  /** Значення колонок: ключ = metric id з `columns` / meta.metrics. */
  values: Record<string, number>;
  /**
   * Розкладка витрати по `expenseKinds` (ключ kind → сума qty expense).
   * Лише якщо в запиті були expenseKinds і колонка витрати увімкнена.
   */
  expenseBreakdown?: Partial<Record<WarehouseStatementExpenseKind, number>>;
  children?: WarehouseStatementRow[];
}

export interface WarehouseStatementQueryResponse {
  rows: WarehouseStatementRow[];
  totals: Record<string, number>;
  grouping: WarehouseStatementDimensionId[];
  columns: WarehouseStatementMetricId[];
  resolved: WarehouseStatementResolvedShapeNames;
}

/** Пресет конструктора (localStorage): зберігати id з meta, не вигадані ключі. */
export interface WarehouseStatementConstructorPreset {
  period: WarehouseStatementPeriod;
  dimensionFilters?: Record<string, string[]>;
  groupIds?: string[];
  exclusions?: WarehouseStatementExclusion[];
  expenseKinds?: WarehouseStatementExpenseKind[];
  priceType?: string;
  grouping: WarehouseStatementDimensionId[];
  columns: WarehouseStatementMetricId[];
  hideZeroQty?: boolean;
  /** Повна назва / лише слот / слот бейджем під групою. */
  columnHeaderStyle?: WarehouseStatementColumnHeaderStyle;
  /** Закріпити рядок «Разом» під шапкою таблиці. */
  pinTotals?: boolean;
}
