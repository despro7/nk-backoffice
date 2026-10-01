/**
 * При архівації товару — надсилання файлів зображень у Telegram (як document)
 * з попередженням про видалення через ARCHIVED_MEDIA_RETENTION_DAYS.
 */

import fs from 'fs/promises';
import path from 'path';
import { prisma, logServer } from '../../lib/utils.js';
import { catalogMediaService } from './CatalogMediaService.js';
import { telegramAlertService } from '../../services/TelegramAlertService.js';

const TAG = '[CatalogArchiveMedia]';

/** Днів до видалення файлів зображень після архівації (cron). */
export const ARCHIVED_MEDIA_RETENTION_DAYS = 7;

function resolveBackofficeBaseUrl(): string {
  return (
    process.env.BACKOFFICE_PUBLIC_URL?.trim() ||
    process.env.CATALOG_MEDIA_PUBLIC_BASE_URL?.trim() ||
    ''
  ).replace(/\/+$/, '');
}

export class CatalogArchiveMediaService {
  async notifyArchivedGoods(goodIds: string[]): Promise<void> {
    const unique = [...new Set(goodIds.filter(Boolean))];
    for (const goodId of unique) {
      try {
        await this.notifyArchivedGood(goodId);
      } catch (err) {
        logServer(`${TAG} notify failed for ${goodId}`, err);
      }
    }
  }

  private async notifyArchivedGood(goodId: string): Promise<void> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        isGroup: true,
        images: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            fileName: true,
            originalName: true,
            mimeType: true,
          },
        },
      },
    });

    if (!good || good.isGroup || good.images.length === 0) return;

    const files: Array<{ buffer: Buffer; filename: string; mimeType: string }> = [];
    const dir = catalogMediaService.goodDir(goodId);

    for (const image of good.images) {
      const filePath = path.join(dir, image.fileName);
      try {
        const buffer = await fs.readFile(filePath);
        files.push({
          buffer,
          filename: image.originalName?.trim() || image.fileName,
          mimeType: image.mimeType || 'application/octet-stream',
        });
      } catch (err) {
        logServer(`${TAG} cannot read ${filePath}`, err);
      }
    }

    if (files.length === 0) return;

    const baseUrl = resolveBackofficeBaseUrl();
    const productLink = baseUrl
      ? `${baseUrl}/products?goodId=${encodeURIComponent(goodId)}`
      : null;

    await telegramAlertService.sendArchivedProductMedia({
      name: good.name,
      sku: good.sku,
      description: good.description,
      productLink,
      retentionDays: ARCHIVED_MEDIA_RETENTION_DAYS,
      files,
    });

    logServer(`${TAG} Telegram backup sent for ${good.sku ?? goodId}: ${files.length} file(s)`);
  }
}

export const catalogArchiveMediaService = new CatalogArchiveMediaService();
