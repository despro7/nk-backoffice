import { barcodes, image, multiVariableText, svg, text } from '@pdfme/schemas';
import type { Plugin } from '@pdfme/common';

/** Спільний набір плагінів для Designer, Viewer і generate. */
export function createLabelPdfmePlugins(): Record<string, Plugin> {
  return {
    text,
    multiVariableText,
    image,
    svg,
    ean13: barcodes.ean13,
    qrcode: barcodes.qrcode,
  };
}
