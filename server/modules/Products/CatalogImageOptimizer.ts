/**
 * Стиснення зображень каталогу (sharp): ресайз по довшій стороні, конвертація формату, quality.
 * Налаштування читаються з settings_base (storefront.media.optimization).
 */

import fs from 'fs/promises';
import sharp from 'sharp';
import { prisma } from '../../lib/utils.js';
import {
  CATALOG_IMAGE_SETTINGS_KEY,
  normalizeCatalogImageSettings,
  type CatalogImageOptimizationSettings,
} from '../../../shared/types/catalogImageSettings.js';

export async function readCatalogImageSettings(): Promise<CatalogImageOptimizationSettings> {
  const row = await prisma.settingsBase.findUnique({
    where: { key: CATALOG_IMAGE_SETTINGS_KEY },
    select: { value: true },
  });
  let parsed: Partial<CatalogImageOptimizationSettings> | null = null;
  try {
    parsed = row?.value ? (JSON.parse(row.value) as Partial<CatalogImageOptimizationSettings>) : null;
  } catch {
    parsed = null;
  }
  return normalizeCatalogImageSettings(parsed);
}

export async function writeCatalogImageSettings(
  input: Partial<CatalogImageOptimizationSettings>,
): Promise<CatalogImageOptimizationSettings> {
  const current = await readCatalogImageSettings();
  const next = normalizeCatalogImageSettings({ ...current, ...input });
  await prisma.settingsBase.upsert({
    where: { key: CATALOG_IMAGE_SETTINGS_KEY },
    create: {
      key: CATALOG_IMAGE_SETTINGS_KEY,
      value: JSON.stringify(next),
      description: 'Оптимізація зображень каталогу (формат, розмір, якість)',
      category: 'storefront',
      isActive: true,
    },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export interface OptimizedImage {
  /** Шлях до файлу з результатом (може збігатися з вхідним) */
  path: string;
  mimeType: string;
  size: number;
  /** Розширення з крапкою або null, якщо лишилось оригінальне */
  ext: string | null;
}

/**
 * Оптимізує файл на місці (повертає шлях до результату). GIF і невдалі спроби лишаються без змін.
 * Якщо результат не менший за оригінал і формат не змінювався, лишається оригінал.
 */
export async function optimizeCatalogImage(
  inputPath: string,
  mimeType: string,
  originalSize: number,
  settings: CatalogImageOptimizationSettings,
): Promise<OptimizedImage> {
  const keep: OptimizedImage = { path: inputPath, mimeType, size: originalSize, ext: null };
  if (!settings.enabled || mimeType === 'image/gif') return keep;

  const targetFormat =
    settings.format === 'original'
      ? mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'jpeg'
      : settings.format;

  try {
    let pipeline = sharp(inputPath, { failOn: 'none' })
      .rotate()
      .resize({
        width: settings.maxDimension,
        height: settings.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });
    if (targetFormat === 'webp') pipeline = pipeline.webp({ quality: settings.quality });
    else if (targetFormat === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
    else pipeline = pipeline.jpeg({ quality: settings.quality, mozjpeg: true });

    const outPath = `${inputPath}.opt`;
    const info = await pipeline.toFile(outPath);
    const sameFormat = targetFormat === (mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpeg');
    if (sameFormat && info.size >= originalSize) {
      await fs.unlink(outPath).catch(() => undefined);
      return keep;
    }
    await fs.unlink(inputPath).catch(() => undefined);
    await fs.rename(outPath, inputPath);
    const meta = {
      webp: { mimeType: 'image/webp', ext: '.webp' },
      png: { mimeType: 'image/png', ext: '.png' },
      jpeg: { mimeType: 'image/jpeg', ext: '.jpg' },
    }[targetFormat];
    return { path: inputPath, mimeType: meta.mimeType, size: info.size, ext: meta.ext };
  } catch {
    await fs.unlink(`${inputPath}.opt`).catch(() => undefined);
    return keep;
  }
}
