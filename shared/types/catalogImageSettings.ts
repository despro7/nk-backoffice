/** Налаштування оптимізації зображень каталогу (settings_base, ключ storefront.media.optimization). */

export type CatalogImageFormat = 'webp' | 'jpeg' | 'original';

export interface CatalogImageOptimizationSettings {
  enabled: boolean;
  /** Максимум по довшій стороні, px */
  maxDimension: number;
  format: CatalogImageFormat;
  /** 40..100 */
  quality: number;
}

export const CATALOG_IMAGE_SETTINGS_KEY = 'storefront.media.optimization';

export const CATALOG_IMAGE_SETTINGS_DEFAULTS: CatalogImageOptimizationSettings = {
  enabled: true,
  maxDimension: 2000,
  format: 'webp',
  quality: 82,
};

export function normalizeCatalogImageSettings(
  raw: Partial<CatalogImageOptimizationSettings> | null | undefined,
): CatalogImageOptimizationSettings {
  const d = CATALOG_IMAGE_SETTINGS_DEFAULTS;
  const num = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  const format: CatalogImageFormat =
    raw?.format === 'jpeg' || raw?.format === 'original' || raw?.format === 'webp' ? raw.format : d.format;
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : d.enabled,
    maxDimension: num(raw?.maxDimension, 400, 8000, d.maxDimension),
    format,
    quality: num(raw?.quality, 40, 100, d.quality),
  };
}
