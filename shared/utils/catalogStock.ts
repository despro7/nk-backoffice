/**
 * Залишки товару каталогу (`catalog_goods.stockBalanceByStock`).
 *
 * Формат JSON:
 * - готова продукція: слоти `'1'` (склад ГП) і `'2'` (малий склад), історичний формат;
 * - інгредієнти: ключі = id складів Dilovod (сировина/пакування, виробництво).
 */

/** Склад сировини/пакування (Dilovod `catalogs.storages`). */
export const DILOVOD_RAW_MATERIALS_STORAGE_ID = '1100700000001018';

/** Склад «Виробництво продукції» (Dilovod `catalogs.storages`). */
export const DILOVOD_PRODUCTION_STORAGE_ID = '1100700000001020';

/** Склади, по яких рахуються залишки інгредієнтів. */
export const INGREDIENT_STOCK_STORAGE_IDS = [
  DILOVOD_RAW_MATERIALS_STORAGE_ID,
  DILOVOD_PRODUCTION_STORAGE_ID,
] as const;

/** Гілка каталогу, від якої залежить набір складів у UI. */
export type CatalogStockBranch = 'finished' | 'ingredient';

export interface ParsedCatalogStock {
  /** Склад ГП (слот `'1'`) */
  mainStock: number;
  /** Малий склад (слот `'2'`) */
  smallStock: number;
  /** Склад сировини/пакування */
  rawStock: number;
  /** Виробництво продукції */
  productionStock: number;
  stockBalanceByStock: Record<string, number> | null;
}

const EMPTY_STOCK: ParsedCatalogStock = {
  mainStock: 0,
  smallStock: 0,
  rawStock: 0,
  productionStock: 0,
  stockBalanceByStock: null,
};

function toQty(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseCatalogStockJson(raw: string | null | undefined): ParsedCatalogStock {
  if (!raw) return { ...EMPTY_STOCK };
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...EMPTY_STOCK };
    }
    return {
      mainStock: toQty(parsed['1']),
      smallStock: toQty(parsed['2']),
      rawStock: toQty(parsed[DILOVOD_RAW_MATERIALS_STORAGE_ID]),
      productionStock: toQty(parsed[DILOVOD_PRODUCTION_STORAGE_ID]),
      stockBalanceByStock: parsed,
    };
  } catch {
    return { ...EMPTY_STOCK };
  }
}

/**
 * JSON залишків інгредієнта. Ключі в стабільному порядку, щоб порівняння
 * «без змін» працювало за рядком.
 */
export function buildIngredientStockJson(rawStock: number, productionStock: number): string {
  return JSON.stringify({
    [DILOVOD_RAW_MATERIALS_STORAGE_ID]: roundStockQty(rawStock),
    [DILOVOD_PRODUCTION_STORAGE_ID]: roundStockQty(productionStock),
  });
}

/** Dilovod віддає qty з 3 знаками (кг); прибираємо шум float після сумування фірм. */
export function roundStockQty(qty: number): number {
  return Math.round(toQty(qty) * 1000) / 1000;
}

/** Залишок у кг/шт: до 3 знаків після коми, без зайвих нулів (`412,626`, `29,26`, `0`). */
export function formatStockQty(qty: number | null | undefined): string {
  const n = Number(qty);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 3, useGrouping: false });
}

/** Назва одиниці виміру товару (`кг`, `шт`, `л`…) з довідника; `''`, якщо невідома. */
export function resolveUnitName(
  unitId: string | null | undefined,
  units: ReadonlyArray<{ id: string; name: string }> | undefined,
): string {
  if (!unitId || !units?.length) return '';
  return units.find((u) => u.id === unitId)?.name?.trim() ?? '';
}
