import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFME_UI_INDEX_PATH, patchPdfmeUiBundle } from './pdfmeDesignerRotatedDragPatch';

type ClampValue = { position: { x: number; y: number }; width: number; height: number; rotate?: number };

function loadPatchedBundle(): string {
  const { code, patched } = patchPdfmeUiBundle(fs.readFileSync(PDFME_UI_INDEX_PATH, 'utf8'));
  expect(patched).toBe(true);
  return code;
}

/** Виконує патчений clamp з template2SchemasList ізольовано (той самий текст, що потрапляє в бандл). */
function buildTemplateClamp(code: string): (value: ClampValue, width: number, height: number) => void {
  const helper = code.match(/var nkGetSchemaAabbOffsets = [\s\S]*?\n};\n/)?.[0];
  const clamp = code.match(/\t\t\tconst \{ minOffsetX, maxOffsetX, minOffsetY, maxOffsetY \} = nkGetSchemaAabbOffsets\(value\.width[\s\S]*?height - maxOffsetY\);/)?.[0];
  expect(helper).toBeTruthy();
  expect(clamp).toBeTruthy();
  return new Function('value', 'width', 'height', `${helper}\n${clamp}`) as (
    value: ClampValue,
    width: number,
    height: number,
  ) => void;
}

describe('pdfmeDesignerRotatedDragPatch', () => {
  it('replaces template2SchemasList clamp and drops offsetLeft in onDragEnd', () => {
    const code = loadPatchedBundle();
    expect(code).not.toContain('if (xEdge > width) value.position.x = Math.max(0, width - value.width);');
    expect(code).not.toContain('leftPx = target.offsetLeft');
  });

  it('keeps a rotated barcode at its saved x on load', () => {
    const clamp = buildTemplateClamp(loadPatchedBundle());
    const barcode: ClampValue = { position: { x: 75.67, y: 75.67 }, width: 34.49, height: 14, rotate: 270 };
    clamp(barcode, 100, 100);
    expect(barcode.position).toEqual({ x: 75.67, y: 75.67 });
  });

  it('still clamps rotated field whose visual box leaves the page', () => {
    const clamp = buildTemplateClamp(loadPatchedBundle());
    const barcode: ClampValue = { position: { x: 90, y: 0 }, width: 34.49, height: 14, rotate: 270 };
    clamp(barcode, 100, 100);
    expect(barcode.position.x).toBeCloseTo(100 - (34.49 + 14) / 2, 5);
  });

  it('behaves like upstream for unrotated fields', () => {
    const clamp = buildTemplateClamp(loadPatchedBundle());
    const field: ClampValue = { position: { x: 80, y: 95 }, width: 30, height: 10 };
    clamp(field, 100, 100);
    expect(field.position).toEqual({ x: 70, y: 90 });
  });
});
