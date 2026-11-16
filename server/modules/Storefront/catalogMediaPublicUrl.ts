/**
 * Публічні URL локальних зображень каталогу для WooCommerce sideload.
 * WC завантажує файли з backoffice за HTTP — потрібна доступна з інтернету base URL.
 */

import { prisma } from '../../lib/utils.js';
import { STOREFRONT_SETTINGS_KEYS } from '../../../shared/constants/storefrontDefaults.js';

/**
 * @param friendlyName необов'язково: «красиве» ім'я файлу (латиниця) в кінці URL. WordPress при
 *   sideload зберігає файл під іменем з кінця URL, тож на сайті буде це ім'я, а не uuid.
 *   Сервер віддає той самий файл за `/uploads/catalog/{goodId}/{fileName}/{friendlyName}`.
 */
export function buildCatalogImagePublicUrl(
  baseUrl: string,
  goodId: string,
  fileName: string,
  friendlyName?: string | null,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const friendly = friendlyName?.trim() ? `/${encodeURIComponent(friendlyName.trim())}` : '';
  return `${base}/uploads/catalog/${encodeURIComponent(goodId)}/${encodeURIComponent(fileName)}${friendly}`;
}

export async function resolveCatalogMediaPublicBaseUrl(): Promise<string> {
  const fromSettings = await prisma.settingsBase.findUnique({
    where: { key: STOREFRONT_SETTINGS_KEYS.woo.mediaPublicBaseUrl },
    select: { value: true },
  });
  const base =
    fromSettings?.value?.trim() ||
    process.env.CATALOG_MEDIA_PUBLIC_BASE_URL?.trim() ||
    process.env.BACKOFFICE_PUBLIC_URL?.trim() ||
    '';
  if (!base) {
    throw new Error(
      'Не налаштовано публічну URL backoffice для зображень. Вкажіть «URL backoffice для медіа» у Налаштування → Сайт або змінну CATALOG_MEDIA_PUBLIC_BASE_URL.',
    );
  }
  return base.replace(/\/+$/, '');
}
