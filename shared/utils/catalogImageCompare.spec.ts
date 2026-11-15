import { describe, expect, it } from 'vitest';
import { imageSetsDiffer, imageNameStem, imageExtFromName } from './catalogImageCompare';

const img = (name: string, sizeBytes: number | null) => ({
  url: `/${name}`,
  name,
  sizeBytes,
  ext: imageExtFromName(name),
});

describe('catalogImageCompare', () => {
  it('ignores WP suffixes and tiny size drift', () => {
    expect(imageNameStem('Borshch-1-scaled.JPG')).toBe('borshch-1');
    expect(imageSetsDiffer([img('a-1.webp', 100000)], [img('a-1-scaled.webp', 101000)])).toBe(false);
  });
  it('detects format, name, size and count differences', () => {
    expect(imageSetsDiffer([img('a.webp', 1000)], [img('a.jpg', 1000)])).toBe(true);
    expect(imageSetsDiffer([img('a.webp', 1000)], [img('b.webp', 1000)])).toBe(true);
    expect(imageSetsDiffer([img('a.webp', 1000)], [img('a.webp', 2000)])).toBe(true);
    expect(imageSetsDiffer([img('a.webp', 1000)], [])).toBe(true);
  });
});
