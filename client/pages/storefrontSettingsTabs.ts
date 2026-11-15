export const STOREFRONT_SETTINGS_TAB_KEYS = ['connection', 'description', 'images', 'diagnostics'] as const;

export type StorefrontSettingsTabKey = (typeof STOREFRONT_SETTINGS_TAB_KEYS)[number];

export const STOREFRONT_SETTINGS_TAB_LABELS: Record<StorefrontSettingsTabKey, string> = {
  connection: 'Підключення',
  description: 'Опис товару',
  images: 'Зображення',
  diagnostics: 'Діагностика',
};

export function parseStorefrontSettingsTabKey(raw: string | null): StorefrontSettingsTabKey {
  return raw && STOREFRONT_SETTINGS_TAB_KEYS.includes(raw as StorefrontSettingsTabKey)
    ? (raw as StorefrontSettingsTabKey)
    : 'connection';
}
