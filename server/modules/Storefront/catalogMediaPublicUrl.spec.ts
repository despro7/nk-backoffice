import { describe, expect, it } from 'vitest';
import { buildCatalogImagePublicUrl } from './catalogMediaPublicUrl.js';

describe('buildCatalogImagePublicUrl', () => {
  it('appends friendly file name for WordPress sideload', () => {
    const url = buildCatalogImagePublicUrl('https://b.example.com', 'g1', 'uuid.webp', 'borshch-1.webp');
    expect(url).toBe('https://b.example.com/uploads/catalog/g1/uuid.webp/borshch-1.webp');
  });

  it('builds encoded public URL for catalog image', () => {
    const url = buildCatalogImagePublicUrl(
      'https://backoffice.example.com/',
      'good-1',
      'photo.jpg',
    );
    expect(url).toBe('https://backoffice.example.com/uploads/catalog/good-1/photo.jpg');
  });
});
