type AnnotateTool = 'rect' | 'ellipse';

export type ScreenshotStroke = {
  tool: AnnotateTool;
  /** Нормалізовані 0..1 відносно natural розміру зображення */
  x: number;
  y: number;
  w: number;
  h: number;
};

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: ScreenshotStroke,
  width: number,
  height: number,
) {
  const x = stroke.x * width;
  const y = stroke.y * height;
  const w = stroke.w * width;
  const h = stroke.h * height;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.004));
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (stroke.tool === 'rect') {
    ctx.strokeRect(x, y, w, h);
  } else {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export async function mergeStrokesToImage(
  src: string,
  strokes: ScreenshotStroke[],
): Promise<string | null> {
  if (!strokes.length) return null;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image load failed'));
    el.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}
