import { describe, expect, it } from 'vitest';
import { buildEan13, isInternalEan13 } from './barcodeUtils.js';

describe('box barcode allocation (EAN-13 series)', () => {
  it('builds valid internal EAN-13', () => {
    const code = buildEan13('220000000100');
    expect(isInternalEan13(code)).toBe(true);
    expect(code).toHaveLength(13);
  });
});
