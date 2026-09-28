import { describe, expect, it } from 'vitest';
import { buildCatalogImagePublicUrl } from './catalogMediaPublicUrl.js';

describe('buildCatalogImagePublicUrl', () => {
  it('builds encoded public URL for catalog image', () => {
    const url = buildCatalogImagePublicUrl(
      'https://backoffice.example.com/',
      'good-1',
      'photo.jpg',
    );
    expect(url).toBe('https://backoffice.example.com/uploads/catalog/good-1/photo.jpg');
  });
});
