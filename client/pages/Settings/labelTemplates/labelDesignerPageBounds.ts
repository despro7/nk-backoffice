import type { Template } from '@pdfme/common';
import type { SchemaPageBounds } from '@shared/utils/schemaRotatedBounds';

export function pageBoundsFromPdfmeTemplate(template: Template): SchemaPageBounds {
  const basePdf = template.basePdf;
  if (typeof basePdf === 'object' && basePdf !== null && 'width' in basePdf && 'height' in basePdf) {
    const padding = Array.isArray(basePdf.padding) ? basePdf.padding : [0, 0, 0, 0];
    const [top, right, bottom, left] = padding as [number, number, number, number];
    return {
      width: basePdf.width,
      height: basePdf.height,
      padding: { top, right, bottom, left },
    };
  }
  return {
    width: 100,
    height: 100,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}
