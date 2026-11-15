/**
 * Дзеркалення файлів каталогу на прод-сервер (лише коли backoffice запущено локально).
 *
 * Локальний `npm run dev` пише рядки в прод-БД (SSH-тунель), але файли лягають у локальний uploads/.
 * Якщо задані обидві змінні, нові файли копіюються по SSH у каталог прода, а видалені прибираються.
 *
 *   CATALOG_MEDIA_PROD_SSH_HOST     SSH-хост (alias з ~/.ssh/config, напр. netcup)
 *   CATALOG_MEDIA_PROD_UPLOADS_DIR  абсолютний шлях до uploads/catalog на проді
 *
 * Помилки не зривають завантаження: лише лог.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { logServer } from '../../lib/utils.js';

const execFileAsync = promisify(execFile);
const SSH_TIMEOUT_MS = 60_000;
const SAFE_SEGMENT = /^[\w.\-]+$/;

function config(): { host: string; dir: string } | null {
  if (process.env.NODE_ENV === 'production') return null;
  const host = process.env.CATALOG_MEDIA_PROD_SSH_HOST?.trim();
  const dir = process.env.CATALOG_MEDIA_PROD_UPLOADS_DIR?.trim().replace(/\/+$/, '');
  if (!host || !dir) return null;
  return { host, dir };
}

export function isProdMediaSyncEnabled(): boolean {
  return config() !== null;
}

function remoteGoodDir(dir: string, goodId: string): string {
  return path.posix.join(dir, goodId);
}

function validSegments(...parts: string[]): boolean {
  return parts.every((p) => SAFE_SEGMENT.test(p));
}

/** Копіює файл у uploads/catalog/{goodId}/ на проді. */
export async function pushCatalogImageToProd(
  goodId: string,
  fileName: string,
  localPath: string,
): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  if (!validSegments(goodId, fileName)) {
    logServer(`[CatalogMediaProdSync] skip push, unsafe name ${goodId}/${fileName}`);
    return;
  }
  const remoteDir = remoteGoodDir(cfg.dir, goodId);
  try {
    await execFileAsync('ssh', [cfg.host, 'mkdir', '-p', remoteDir], { timeout: SSH_TIMEOUT_MS });
    await execFileAsync('scp', ['-q', localPath, `${cfg.host}:${path.posix.join(remoteDir, fileName)}`], {
      timeout: SSH_TIMEOUT_MS,
    });
  } catch (err) {
    logServer(`[CatalogMediaProdSync] push failed ${goodId}/${fileName}`, err);
  }
}

/** Видаляє файл з прода. */
export async function removeCatalogImageFromProd(goodId: string, fileName: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  if (!validSegments(goodId, fileName)) return;
  try {
    await execFileAsync(
      'ssh',
      [cfg.host, 'rm', '-f', path.posix.join(remoteGoodDir(cfg.dir, goodId), fileName)],
      { timeout: SSH_TIMEOUT_MS },
    );
  } catch (err) {
    logServer(`[CatalogMediaProdSync] remove failed ${goodId}/${fileName}`, err);
  }
}
