/**
 * Локальне сховище зображень каталогу (не Dilovod).
 * Постійні: uploads/catalog/{goodId}/
 * Staging:  uploads/catalog/_staging/{sessionId}/
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma, logServer } from '../../lib/utils.js';
import type { CatalogGoodImageDto } from '../../../shared/types/catalog.js';

export const CATALOG_MEDIA_MAX_FILES = 10;
export const CATALOG_MEDIA_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const CATALOG_MEDIA_ACCEPT = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads', 'catalog');
const STAGING_DIR = path.join(UPLOADS_ROOT, '_staging');

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
      return '.bin';
  }
}

function publicUrl(goodId: string, fileName: string): string {
  return `/uploads/catalog/${encodeURIComponent(goodId)}/${encodeURIComponent(fileName)}`;
}

function toDto(row: {
  id: number;
  goodId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CatalogGoodImageDto {
  return {
    id: row.id,
    goodId: row.goodId,
    fileName: row.fileName,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
    url: publicUrl(row.goodId, row.fileName),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type SavedUploadFile = {
  originalName: string;
  mimeType: string;
  size: number;
  /** Абсолютний шлях тимчасового файлу від multer */
  tempPath: string;
};

export class CatalogMediaService {
  async ensureDirs(): Promise<void> {
    await fs.mkdir(STAGING_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_ROOT, { recursive: true });
  }

  stagingDir(sessionId: string): string {
    return path.join(STAGING_DIR, sessionId);
  }

  goodDir(goodId: string): string {
    return path.join(UPLOADS_ROOT, goodId);
  }

  validateFileMeta(mimeType: string, size: number): void {
    if (!CATALOG_MEDIA_ACCEPT.has(mimeType)) {
      throw new Error('Дозволені лише зображення JPEG, PNG, WebP, GIF');
    }
    if (size > CATALOG_MEDIA_MAX_BYTES) {
      throw new Error(`Максимальний розмір файлу — ${CATALOG_MEDIA_MAX_BYTES / (1024 * 1024)} МБ`);
    }
  }

  async listForGood(goodId: string): Promise<CatalogGoodImageDto[]> {
    const rows = await prisma.catalogGoodImage.findMany({
      where: { goodId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDto);
  }

  async listStaging(sessionId: string): Promise<
    Array<{
      id: string;
      fileName: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
    }>
  > {
    const dir = this.stagingDir(sessionId);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }

    const metaPath = path.join(dir, '_meta.json');
    let meta: Record<
      string,
      { originalName: string; mimeType: string; size: number }
    > = {};
    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      meta = JSON.parse(raw) as typeof meta;
    } catch {
      meta = {};
    }

    const files = entries.filter((e) => e !== '_meta.json');
    return files.map((fileName) => {
      const m = meta[fileName];
      return {
        id: fileName,
        fileName,
        originalName: m?.originalName || fileName,
        mimeType: m?.mimeType || 'application/octet-stream',
        size: m?.size || 0,
        url: `/uploads/catalog/_staging/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileName)}`,
      };
    });
  }

  private async readStagingMeta(
    sessionId: string
  ): Promise<Record<string, { originalName: string; mimeType: string; size: number }>> {
    const metaPath = path.join(this.stagingDir(sessionId), '_meta.json');
    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      return JSON.parse(raw) as Record<
        string,
        { originalName: string; mimeType: string; size: number }
      >;
    } catch {
      return {};
    }
  }

  private async writeStagingMeta(
    sessionId: string,
    meta: Record<string, { originalName: string; mimeType: string; size: number }>
  ): Promise<void> {
    const dir = this.stagingDir(sessionId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }

  async saveStaging(sessionId: string, files: SavedUploadFile[]): Promise<
    Array<{
      id: string;
      fileName: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
    }>
  > {
    if (!sessionId || !/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId)) {
      throw new Error('Невірний stagingSessionId');
    }

    const existing = await this.listStaging(sessionId);
    if (existing.length + files.length > CATALOG_MEDIA_MAX_FILES) {
      throw new Error(`Максимум ${CATALOG_MEDIA_MAX_FILES} зображень`);
    }

    const dir = this.stagingDir(sessionId);
    await fs.mkdir(dir, { recursive: true });
    const meta = await this.readStagingMeta(sessionId);
    const saved: Array<{
      id: string;
      fileName: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
    }> = [];

    for (const file of files) {
      this.validateFileMeta(file.mimeType, file.size);
      const fileName = `${randomUUID()}${extFromMime(file.mimeType, file.originalName)}`;
      const dest = path.join(dir, fileName);
      await fs.rename(file.tempPath, dest).catch(async () => {
        await fs.copyFile(file.tempPath, dest);
        await fs.unlink(file.tempPath).catch(() => undefined);
      });
      meta[fileName] = {
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
      };
      saved.push({
        id: fileName,
        fileName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        url: `/uploads/catalog/_staging/${encodeURIComponent(sessionId)}/${encodeURIComponent(fileName)}`,
      });
    }

    await this.writeStagingMeta(sessionId, meta);
    return saved;
  }

  async discardStaging(sessionId: string): Promise<void> {
    const dir = this.stagingDir(sessionId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      logServer('[CatalogMediaService] discardStaging failed', err);
    }
  }

  async removeStagingFile(sessionId: string, fileName: string): Promise<void> {
    const safe = path.basename(fileName);
    const filePath = path.join(this.stagingDir(sessionId), safe);
    await fs.unlink(filePath).catch(() => undefined);
    const meta = await this.readStagingMeta(sessionId);
    delete meta[safe];
    await this.writeStagingMeta(sessionId, meta);
  }

  async saveForGood(goodId: string, files: SavedUploadFile[]): Promise<CatalogGoodImageDto[]> {
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true },
    });
    if (!good) throw new Error('Товар не знайдено');
    if (good.isGroup) throw new Error('Зображення недоступні для груп');

    const currentCount = await prisma.catalogGoodImage.count({ where: { goodId } });
    if (currentCount + files.length > CATALOG_MEDIA_MAX_FILES) {
      throw new Error(`Максимум ${CATALOG_MEDIA_MAX_FILES} зображень`);
    }

    const dir = this.goodDir(goodId);
    await fs.mkdir(dir, { recursive: true });

    const maxSort = await prisma.catalogGoodImage.aggregate({
      where: { goodId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;
    const isFirstBatch = currentCount === 0;
    const created: CatalogGoodImageDto[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.validateFileMeta(file.mimeType, file.size);
      const fileName = `${randomUUID()}${extFromMime(file.mimeType, file.originalName)}`;
      const dest = path.join(dir, fileName);
      await fs.rename(file.tempPath, dest).catch(async () => {
        await fs.copyFile(file.tempPath, dest);
        await fs.unlink(file.tempPath).catch(() => undefined);
      });

      const row = await prisma.catalogGoodImage.create({
        data: {
          goodId,
          fileName,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          sortOrder: nextSort++,
          isPrimary: isFirstBatch && i === 0,
        },
      });
      created.push(toDto(row));
    }

    return created;
  }

  async commitStaging(sessionId: string, goodId: string): Promise<CatalogGoodImageDto[]> {
    const stagingItems = await this.listStaging(sessionId);
    if (stagingItems.length === 0) {
      await this.discardStaging(sessionId);
      return [];
    }

    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true },
    });
    if (!good) throw new Error('Товар не знайдено для commit staging');
    if (good.isGroup) {
      await this.discardStaging(sessionId);
      return [];
    }

    const dir = this.goodDir(goodId);
    await fs.mkdir(dir, { recursive: true });

    const maxSort = await prisma.catalogGoodImage.aggregate({
      where: { goodId },
      _max: { sortOrder: true },
    });
    let nextSort = (maxSort._max.sortOrder ?? -1) + 1;
    const existingCount = await prisma.catalogGoodImage.count({ where: { goodId } });
    const created: CatalogGoodImageDto[] = [];

    for (let i = 0; i < stagingItems.length; i++) {
      const item = stagingItems[i];
      const src = path.join(this.stagingDir(sessionId), item.fileName);
      const dest = path.join(dir, item.fileName);
      try {
        await fs.rename(src, dest);
      } catch {
        await fs.copyFile(src, dest);
      }

      const row = await prisma.catalogGoodImage.create({
        data: {
          goodId,
          fileName: item.fileName,
          originalName: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          sortOrder: nextSort++,
          isPrimary: existingCount === 0 && i === 0,
        },
      });
      created.push(toDto(row));
    }

    await this.discardStaging(sessionId);
    return created;
  }

  async deleteImage(imageId: number): Promise<void> {
    const row = await prisma.catalogGoodImage.findUnique({ where: { id: imageId } });
    if (!row) throw new Error('Зображення не знайдено');

    const filePath = path.join(this.goodDir(row.goodId), row.fileName);
    await fs.unlink(filePath).catch(() => undefined);
    await prisma.catalogGoodImage.delete({ where: { id: imageId } });

    if (row.isPrimary) {
      const next = await prisma.catalogGoodImage.findFirst({
        where: { goodId: row.goodId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      if (next) {
        await prisma.catalogGoodImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  }

  async setPrimary(imageId: number): Promise<CatalogGoodImageDto> {
    const row = await prisma.catalogGoodImage.findUnique({ where: { id: imageId } });
    if (!row) throw new Error('Зображення не знайдено');

    await prisma.$transaction([
      prisma.catalogGoodImage.updateMany({
        where: { goodId: row.goodId },
        data: { isPrimary: false },
      }),
      prisma.catalogGoodImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    const updated = await prisma.catalogGoodImage.findUniqueOrThrow({ where: { id: imageId } });
    return toDto(updated);
  }

  async reorder(goodId: string, orderedIds: number[]): Promise<CatalogGoodImageDto[]> {
    const existing = await prisma.catalogGoodImage.findMany({
      where: { goodId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        throw new Error(`Зображення ${id} не належить товару`);
      }
    }

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.catalogGoodImage.update({
          where: { id },
          data: { sortOrder: idx },
        })
      )
    );

    return this.listForGood(goodId);
  }
}

export const catalogMediaService = new CatalogMediaService();
