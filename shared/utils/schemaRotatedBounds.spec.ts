import { describe, expect, it } from 'vitest';
import {
  clampSchemaPositionToPage,
  getRotatedSchemaAabb,
  getSchemaAabbOffsetsFromPosition,
} from './schemaRotatedBounds.js';

const page100 = {
  width: 100,
  height: 100,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

describe('getRotatedSchemaAabb', () => {
  it('without rotation matches axis-aligned box', () => {
    expect(getRotatedSchemaAabb({ x: 10, y: 20, width: 30, height: 40, rotateDeg: 0 })).toEqual({
      minX: 10,
      minY: 20,
      maxX: 40,
      maxY: 60,
    });
  });

  it('90° swaps horizontal extent to height', () => {
    const { minOffsetX, maxOffsetX } = getSchemaAabbOffsetsFromPosition(10, 30, 90);
    expect(maxOffsetX - minOffsetX).toBeCloseTo(30, 5);
  });
});

describe('clampSchemaPositionToPage', () => {
  it('allows further right for tall rotated barcode than width-only clamp', () => {
    const width = 35;
    const height = 8;
    const rotateDeg = 270;
    const { maxOffsetX } = getSchemaAabbOffsetsFromPosition(width, height, rotateDeg);
    const maxX = page100.width - maxOffsetX;
    expect(maxX).toBeGreaterThan(page100.width - width);

    const atEdge = getRotatedSchemaAabb({ x: maxX, y: 10, width, height, rotateDeg });
    expect(atEdge.maxX).toBeCloseTo(100, 5);

    const clamped = clampSchemaPositionToPage({
      x: maxX + 5,
      y: 10,
      width,
      height,
      rotateDeg,
      page: page100,
    });
    expect(clamped.x).toBeCloseTo(maxX, 5);
  });
});
