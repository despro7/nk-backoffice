import { describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

vi.mock('../../lib/utils.js', () => ({ prisma: {} }));

import { optimizeCatalogImage } from './CatalogImageOptimizer.js';
import { CATALOG_IMAGE_SETTINGS_DEFAULTS } from '../../../shared/types/catalogImageSettings.js';

async function makePng(width: number, height: number): Promise<{ file: string; size: number }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'catimg-'));
  const file = path.join(dir, 'in.png');
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .png()
    .toBuffer();
  await fs.writeFile(file, buf);
  return { file, size: buf.length };
}

describe('optimizeCatalogImage', () => {
  it('downsizes and converts PNG to WebP', async () => {
    const { file, size } = await makePng(4000, 3000);
    const res = await optimizeCatalogImage(file, 'image/png', size, CATALOG_IMAGE_SETTINGS_DEFAULTS);
    expect(res.mimeType).toBe('image/webp');
    expect(res.ext).toBe('.webp');
    const meta = await sharp(res.path).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2000);
  });

  it('leaves file untouched when disabled', async () => {
    const { file, size } = await makePng(100, 100);
    const res = await optimizeCatalogImage(file, 'image/png', size, {
      ...CATALOG_IMAGE_SETTINGS_DEFAULTS,
      enabled: false,
    });
    expect(res.ext).toBeNull();
    expect(res.size).toBe(size);
  });
});
