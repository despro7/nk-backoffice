/** Масштаб pdfme Designer: мм → px (те саме, що ZOOM у @pdfme/ui). */
export const PDFME_DESIGNER_MM_TO_PX = 3.7795275591;

export type SchemaPageBounds = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

/** Осьовий AABB схеми з поворотом навколо центру (як у pdfme Wrapper). */
export function getRotatedSchemaAabb(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotateDeg: number;
}): { minX: number; minY: number; maxX: number; maxY: number } {
  const { x, y, width, height, rotateDeg } = params;
  const normalized = ((rotateDeg % 360) + 360) % 360;
  if (normalized === 0) {
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }

  const rad = (normalized * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const halfW = width / 2;
  const halfH = height / 2;

  const corners = [
    { dx: -halfW, dy: -halfH },
    { dx: halfW, dy: -halfH },
    { dx: halfW, dy: halfH },
    { dx: -halfW, dy: halfH },
  ].map(({ dx, dy }) => ({
    px: cx + dx * cos - dy * sin,
    py: cy + dx * sin + dy * cos,
  }));

  const xs = corners.map((c) => c.px);
  const ys = corners.map((c) => c.py);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Відстані AABB від точки position (x,y) до лівого/правого/верх/низ країв. */
export function getSchemaAabbOffsetsFromPosition(
  width: number,
  height: number,
  rotateDeg: number,
): { minOffsetX: number; maxOffsetX: number; minOffsetY: number; maxOffsetY: number } {
  const aabb = getRotatedSchemaAabb({ x: 0, y: 0, width, height, rotateDeg });
  return {
    minOffsetX: aabb.minX,
    maxOffsetX: aabb.maxX,
    minOffsetY: aabb.minY,
    maxOffsetY: aabb.maxY,
  };
}

export function clampSchemaPositionToPage(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotateDeg: number;
  page: SchemaPageBounds;
}): { x: number; y: number } {
  const { page } = params;
  const { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY } = getSchemaAabbOffsetsFromPosition(
    params.width,
    params.height,
    params.rotateDeg,
  );

  const minX = page.padding.left - minOffsetX;
  const maxX = page.width - page.padding.right - maxOffsetX;
  const minY = page.padding.top - minOffsetY;
  const maxY = page.height - page.padding.bottom - maxOffsetY;

  let x = params.x;
  let y = params.y;
  if (x < minX) x = minX;
  if (x > maxX) x = maxX;
  if (y < minY) y = minY;
  if (y > maxY) y = maxY;
  return { x, y };
}
