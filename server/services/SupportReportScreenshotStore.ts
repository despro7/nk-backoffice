/**
 * Скріншоти звітів користувачів («Сповістити адміна»).
 * Лежать у storage/support-reports (не в публічних uploads), віддаються лише адмінам
 * через GET /api/support-reports/:id/screenshot і видаляються через RETENTION_DAYS.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SCREENSHOT_RETENTION_DAYS = 30;

const ROOT = path.resolve(process.cwd(), 'storage', 'support-reports');
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;
let lastCleanupAt = 0;

function extensionOf(buffer: Buffer): 'jpg' | 'png' {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8 ? 'jpg' : 'png';
}

export function screenshotLink(reportId: number): string {
  return `/api/support-reports/${reportId}/screenshot`;
}

export async function saveReportScreenshot(reportId: number, buffer: Buffer): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true });
  await fs.writeFile(path.join(ROOT, `${reportId}.${extensionOf(buffer)}`), buffer);
  void cleanupOldScreenshots();
}

export async function findReportScreenshot(reportId: number): Promise<{ file: string; mime: string } | null> {
  for (const ext of ['jpg', 'png'] as const) {
    const file = path.join(ROOT, `${reportId}.${ext}`);
    try {
      await fs.access(file);
      return { file, mime: ext === 'jpg' ? 'image/jpeg' : 'image/png' };
    } catch {
      // next extension
    }
  }
  return null;
}

/** Видаляє файли, старші за SCREENSHOT_RETENTION_DAYS (не частіше ніж раз на 6 год). */
export async function cleanupOldScreenshots(force = false): Promise<number> {
  if (!force && Date.now() - lastCleanupAt < CLEANUP_EVERY_MS) return 0;
  lastCleanupAt = Date.now();
  const cutoff = Date.now() - SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  try {
    for (const name of await fs.readdir(ROOT)) {
      const file = path.join(ROOT, name);
      const stat = await fs.stat(file);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(file);
        removed++;
      }
    }
  } catch {
    // папки ще немає
  }
  return removed;
}
