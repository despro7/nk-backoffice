import { describe, expect, it } from 'vitest';
import { buildCatalogImageName, splitImageName } from './catalogImageName';

describe('catalogImageName', () => {
  it('transliterates and replaces spaces', () => {
    expect(buildCatalogImageName('Бобова локшина (1).JPG')).toBe('bobova-lokshyna-1.jpg');
  });
  it('forced extension wins', () => {
    expect(buildCatalogImageName('Фото Щука.png', '.webp')).toBe('foto-shchuka.webp');
  });
  it('splits ext', () => {
    expect(splitImageName('a b.webp')).toEqual({ base: 'a b', ext: '.webp' });
    expect(buildCatalogImageName('.jpg')).toBe('image.jpg');
  });
});
