import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';
import { PDFME_DESIGNER_MM_TO_PX } from '@shared/utils/schemaRotatedBounds';

const ZOOM = PDFME_DESIGNER_MM_TO_PX;

function escapeCssAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseRotateDeg(transform: string | undefined): number | undefined {
  if (!transform) return undefined;
  const match = transform.match(/rotate\(([-\d.]+)deg\)/);
  if (!match) return undefined;
  const deg = Number(match[1]);
  if (!Number.isFinite(deg)) return undefined;
  return ((deg % 360) + 360) % 360;
}

/** Moveable інколи лишає translate() в transform; позиція schema = left/top + translate. */
function parseTranslatePx(transform: string | undefined): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };
  const match = transform.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
  if (!match) return { x: 0, y: 0 };
  const x = Number(match[1]);
  const y = Number(match[2]);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function pxToMm(px: number): number {
  return Math.round((px / ZOOM) * 100) / 100;
}

export function readDesignerFieldGeometryFromElement(el: HTMLElement): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
} {
  const widthPx = Number.parseFloat(el.style.width.replace('px', ''));
  const heightPx = Number.parseFloat(el.style.height.replace('px', ''));
  const rotate = parseRotateDeg(el.style.transform) ?? 0;

  // offsetLeft/offsetTop — цілі px, дають дрейф до ~0.13 мм; беремо дробові style.left/top.
  const leftPx = Number.parseFloat(el.style.left.replace('px', ''));
  const topPx = Number.parseFloat(el.style.top.replace('px', ''));
  const { x: tx, y: ty } = parseTranslatePx(el.style.transform);

  return {
    x: pxToMm(leftPx + tx),
    y: pxToMm(topPx + ty),
    width: pxToMm(widthPx),
    height: pxToMm(heightPx),
    rotate,
  };
}

/**
 * Перед збереженням: підтягнути position/size/rotate з DOM обгорток Designer (title = name поля).
 * Допомагає, коли Moveable оновив style, але schemasList ще не синхронізований.
 */
export function syncLabelTemplateFromDesignerDom(
  host: HTMLElement,
  template: LabelPdfmeTemplate,
): LabelPdfmeTemplate {
  const next: LabelPdfmeTemplate = structuredClone(template);

  for (const page of next.schemas) {
    for (const field of page) {
      const name = field.name;
      if (!name) continue;

      const el = host.querySelector<HTMLElement>(
        `div.selectable[title="${escapeCssAttrValue(name)}"]`,
      );
      if (!el) continue;

      const geom = readDesignerFieldGeometryFromElement(el);
      field.position = { ...field.position, x: geom.x, y: geom.y };
      field.width = geom.width;
      field.height = geom.height;
      field.rotate = geom.rotate;
    }
  }

  return next;
}
