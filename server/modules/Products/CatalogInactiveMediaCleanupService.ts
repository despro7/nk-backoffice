/**
 * Cron: видалення зображень архівних товарів через ARCHIVED_MEDIA_RETENTION_DAYS після archivedAt.
 */

import fs from 'fs/promises';
import { prisma, logServer } from '../../lib/utils.js';
import { catalogMediaService } from './CatalogMediaService.js';
import { telegramAlertService } from '../../services/TelegramAlertService.js';
import { ARCHIVED_MEDIA_RETENTION_DAYS } from './CatalogArchiveMediaService.js';

const TAG = '[CatalogArchivedMediaCleanup]';

export type CatalogInactiveMediaCleanupResult = {
  goodsProcessed: number;
  imagesDeleted: number;
  errors: string[];
};

export class CatalogInactiveMediaCleanupService {
  async cleanup(): Promise<CatalogInactiveMediaCleanupResult> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVED_MEDIA_RETENTION_DAYS);

    logServer(
      `${TAG} Пошук архівних товарів зі зображеннями (archivedAt ≤ ${cutoff.toISOString()})`,
    );

    const goods = await prisma.catalogGood.findMany({
      where: {
        isGroup: false,
        archivedAt: { not: null, lte: cutoff },
        images: { some: {} },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        archivedAt: true,
        images: { select: { id: true } },
      },
    });

    if (goods.length === 0) {
      logServer(`${TAG} Немає товарів для очищення.`);
      return { goodsProcessed: 0, imagesDeleted: 0, errors: [] };
    }

    logServer(`${TAG} Знайдено ${goods.length} архівних товарів із зображеннями.`);

    let imagesDeleted = 0;
    const errors: string[] = [];

    for (const good of goods) {
      for (const image of good.images) {
        try {
          await catalogMediaService.deleteImage(image.id);
          imagesDeleted++;
        } catch (err) {
          const msg = `Товар ${good.sku ?? good.id}, image #${image.id}: ${
            err instanceof Error ? err.message : String(err)
          }`;
          errors.push(msg);
          logServer(`${TAG} ${msg}`, err);
        }
      }

      try {
        const dir = catalogMediaService.goodDir(good.id);
        const entries = await fs.readdir(dir);
        if (entries.length === 0) {
          await fs.rmdir(dir);
        }
      } catch {
        // директорія могла бути вже видалена або не існувати
      }
    }

    const result: CatalogInactiveMediaCleanupResult = {
      goodsProcessed: goods.length,
      imagesDeleted,
      errors,
    };

    logServer(
      `${TAG} Завершено: товарів=${result.goodsProcessed}, зображень=${result.imagesDeleted}, помилок=${result.errors.length}`,
    );

    if (result.imagesDeleted > 0) {
      void this.notifyCleanupResult(result);
    }

    return result;
  }

  private notifyCleanupResult(result: CatalogInactiveMediaCleanupResult): Promise<void> {
    const lines = [
      `Видалено зображень: ${result.imagesDeleted}`,
      `Товарів оброблено: ${result.goodsProcessed}`,
      `Поріг: ${ARCHIVED_MEDIA_RETENTION_DAYS} днів після архівації`,
    ];
    if (result.errors.length > 0) {
      lines.push('', `Помилок: ${result.errors.length}`);
      lines.push(...result.errors.slice(0, 5));
      if (result.errors.length > 5) {
        lines.push(`… та ще ${result.errors.length - 5}`);
      }
    }
    return telegramAlertService.sendAdminAlert('Каталог: видалення медіа архівних товарів', lines);
  }
}

export const catalogInactiveMediaCleanupService = new CatalogInactiveMediaCleanupService();
