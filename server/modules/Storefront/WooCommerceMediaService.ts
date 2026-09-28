/**
 * WooCommerce media upload, pull and orphan audit.
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma, logServer } from '../../lib/utils.js';
import type {
  WooCommerceProduct,
  WooMediaPullResult,
  WooMediaUploadResult,
  WooOrphanAuditResult,
} from '../../../shared/types/storefront.js';
import {
  CATALOG_MEDIA_ACCEPT,
  CATALOG_MEDIA_MAX_BYTES,
  CATALOG_MEDIA_MAX_FILES,
  catalogMediaService,
} from '../Products/CatalogMediaService.js';
import {
  buildCatalogImagePublicUrl,
  resolveCatalogMediaPublicBaseUrl,
} from './catalogMediaPublicUrl.js';
import { storefrontService } from './StorefrontService.js';
import { createWooCommerceClient } from './WooCommerceApiClient.js';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads', 'catalog');

function extFromMime(mime: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName && /^\.(jpe?g|png|webp|gif)$/.test(fromName)) return fromName;
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.jpg';
  }
}

type WcImagePayload = { id?: number; src?: string; name?: string };

export class WooCommerceMediaService {
  /**
   * Синхронізує зображення товару з WooCommerce через wc/v3/products (sideload за src).
   * WP Media API (wp/v2/media) недоступний для WC API keys — тому не використовується.
   */
  async uploadProductImages(goodId: string): Promise<WooMediaUploadResult> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: {
        id: true,
        isGroup: true,
        wooProductId: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');
    if (!good.wooProductId) throw new Error('Товар ще не привʼязаний до WooCommerce');

    const creds = await storefrontService.getWooCredentialsInternal();
    const client = createWooCommerceClient(creds);
    const uploaded: WooMediaUploadResult['uploaded'] = [];
    const errors: string[] = [];

    if (good.images.length === 0) {
      await client.updateProduct(good.wooProductId, { images: [] });
      return { goodId, uploaded, errors };
    }

    let publicBase = '';
    const needsPublicUrl = good.images.some((image) => !image.wooMediaId);
    if (needsPublicUrl) {
      try {
        publicBase = await resolveCatalogMediaPublicBaseUrl();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          goodId,
          uploaded,
          errors: good.images
            .filter((image) => !image.wooMediaId)
            .map((image) => `Image #${image.id}: ${message}`),
        };
      }
    }

    const wcPayload: WcImagePayload[] = [];
    const payloadImages = [...good.images];

    for (const image of payloadImages) {
      if (image.wooMediaId) {
        wcPayload.push({ id: image.wooMediaId });
        continue;
      }

      const filePath = path.join(UPLOADS_ROOT, goodId, image.fileName);
      try {
        await fs.access(filePath);
      } catch {
        errors.push(`Image #${image.id}: файл не знайдено на диску`);
        continue;
      }

      wcPayload.push({
        src: buildCatalogImagePublicUrl(publicBase, goodId, image.fileName),
        name: image.originalName || image.fileName,
      });
    }

    if (wcPayload.length === 0) {
      return { goodId, uploaded, errors };
    }

    try {
      const updated = await client.updateProduct(good.wooProductId, { images: wcPayload });
      const returned = updated.images || [];

      for (let i = 0; i < payloadImages.length; i++) {
        const local = payloadImages[i];
        const wcImage = returned[i];
        if (!local || !wcImage?.id) continue;

        if (local.wooMediaId !== wcImage.id) {
          await prisma.catalogGoodImage.update({
            where: { id: local.id },
            data: { wooMediaId: wcImage.id },
          });
          if (!local.wooMediaId) {
            uploaded.push({ imageId: local.id, wooMediaId: wcImage.id });
          }
        }
      }

      if (returned.length < wcPayload.length) {
        errors.push(
          `WooCommerce повернув ${returned.length} з ${wcPayload.length} зображень — перевірте доступність URL backoffice`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      logServer(`[WooCommerceMediaService] product images sync failed for ${goodId}`, err);
    }

    return { goodId, uploaded, errors };
  }

  async pullProductImages(
    goodId: string,
    product: WooCommerceProduct,
    replaceExisting = false,
  ): Promise<WooMediaPullResult> {
    const wcImages = product.images || [];
    if (wcImages.length === 0) {
      return { goodId, imported: 0, replaced: false, errors: [] };
    }

    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true },
    });
    if (!good || good.isGroup) throw new Error('Товар не знайдено');

    const goodDir = path.join(UPLOADS_ROOT, goodId);
    await fs.mkdir(goodDir, { recursive: true });

    if (replaceExisting) {
      const existing = await prisma.catalogGoodImage.findMany({ where: { goodId } });
      for (const image of existing) {
        await fs.unlink(path.join(goodDir, image.fileName)).catch(() => undefined);
      }
      await prisma.catalogGoodImage.deleteMany({ where: { goodId } });
    }

    const currentCount = replaceExisting
      ? 0
      : await prisma.catalogGoodImage.count({ where: { goodId } });
    const maxSort = await prisma.catalogGoodImage.aggregate({
      where: { goodId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const errors: string[] = [];
    let imported = 0;

    for (const wcImage of wcImages) {
      if (currentCount + imported >= CATALOG_MEDIA_MAX_FILES) {
        errors.push(`Досягнуто ліміт ${CATALOG_MEDIA_MAX_FILES} зображень`);
        break;
      }

      const alreadyLinked = await prisma.catalogGoodImage.findFirst({
        where: { goodId, wooMediaId: wcImage.id },
      });
      if (alreadyLinked) continue;

      try {
        const res = await fetch(wcImage.src, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!CATALOG_MEDIA_ACCEPT.has(mimeType)) {
          throw new Error(`Непідтримуваний тип ${mimeType}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        catalogMediaService.validateFileMeta(mimeType, buffer.length);
        if (buffer.length > CATALOG_MEDIA_MAX_BYTES) {
          throw new Error(`Файл перевищує ${CATALOG_MEDIA_MAX_BYTES / (1024 * 1024)} МБ`);
        }

        const originalName = wcImage.name || wcImage.alt || `wc-${wcImage.id}.jpg`;
        const fileName = `${randomUUID()}${extFromMime(mimeType, originalName)}`;
        await fs.writeFile(path.join(goodDir, fileName), buffer);

        await prisma.catalogGoodImage.create({
          data: {
            goodId,
            fileName,
            originalName,
            mimeType,
            size: buffer.length,
            sortOrder: nextSort++,
            isPrimary: currentCount === 0 && imported === 0,
            wooMediaId: wcImage.id,
          },
        });
        imported += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`WC#${wcImage.id}: ${message}`);
        logServer(`[WooCommerceMediaService] pull image failed for WC#${wcImage.id}`, err);
      }
    }

    return { goodId, imported, replaced: replaceExisting, errors };
  }

  async auditOrphans(): Promise<WooOrphanAuditResult> {
    const creds = await storefrontService.getWooCredentialsInternal();
    const client = createWooCommerceClient(creds);

    const linked = await prisma.catalogGoodImage.findMany({
      where: { wooMediaId: { not: null } },
      select: { wooMediaId: true, goodId: true, good: { select: { sku: true } } },
    });
    const linkedMap = new Map(
      linked.map((row) => [row.wooMediaId!, { goodId: row.goodId, sku: row.good.sku }]),
    );

    const orphans: WooOrphanAuditResult['orphans'] = [];
    let page = 1;
    let totalWcImages = 0;

    while (true) {
      const batch = await client.listMedia(100, page);
      if (batch.length === 0) break;
      totalWcImages += batch.length;

      for (const item of batch) {
        const link = linkedMap.get(item.id);
        if (!link) {
          orphans.push({
            wooMediaId: item.id,
            src: item.src,
            name: item.title?.rendered || '',
            linkedGoodId: null,
            linkedSku: null,
          });
        }
      }

      if (batch.length < 100) break;
      page += 1;
      if (page > 20) break;
    }

    return { orphans, totalWcImages };
  }

  async deleteOrphans(wooMediaIds: number[]): Promise<{ deleted: number; errors: string[] }> {
    const creds = await storefrontService.getWooCredentialsInternal();
    const client = createWooCommerceClient(creds);
    let deleted = 0;
    const errors: string[] = [];

    for (const id of wooMediaIds) {
      try {
        await client.deleteMedia(id);
        await prisma.catalogGoodImage.updateMany({
          where: { wooMediaId: id },
          data: { wooMediaId: null },
        });
        deleted += 1;
      } catch (err) {
        errors.push(`#${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { deleted, errors };
  }
}

export const wooCommerceMediaService = new WooCommerceMediaService();
