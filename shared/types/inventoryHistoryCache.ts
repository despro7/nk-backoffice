/** Налаштування кешу денних рухів для історії товару в інвентаризації (`settings_base`). */
export interface InventoryHistoryCacheSettings {
  /** Скільки хвилин тримати в кеші сьогодні і вчора (документи ще проводяться). */
  recentDayTtlMinutes: number;
  /** Скільки хвилин тримати в кеші старіші дні. */
  pastDayTtlMinutes: number;
}

export const INVENTORY_HISTORY_CACHE_DEFAULTS: InventoryHistoryCacheSettings = {
  recentDayTtlMinutes: 1,
  pastDayTtlMinutes: 30,
};

export const INVENTORY_HISTORY_CACHE_LIMITS = {
  recentDayTtlMinutes: { min: 0, max: 60 },
  pastDayTtlMinutes: { min: 0, max: 24 * 60 },
} as const;

/** Обмежує значення допустимими межами; нечислові значення замінює типовими. */
export function normalizeInventoryHistoryCacheSettings(raw: unknown): InventoryHistoryCacheSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof InventoryHistoryCacheSettings): number => {
    const value = Number(source[key]);
    if (!Number.isFinite(value)) return INVENTORY_HISTORY_CACHE_DEFAULTS[key];
    const { min, max } = INVENTORY_HISTORY_CACHE_LIMITS[key];
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  return {
    recentDayTtlMinutes: pick('recentDayTtlMinutes'),
    pastDayTtlMinutes: pick('pastDayTtlMinutes'),
  };
}
