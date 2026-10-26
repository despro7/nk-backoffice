/**
 * Заміна @pdfme/converter у клієнтському бандлі.
 * Повний converter тягне clawpdf/pdfium (Node + великий WASM) → OOM на vite build.
 * Наші шаблони — basePdf 100×100 мм з JSON, без імпорту PDF у Designer.
 */

const LABEL_MM = 100;

export async function pdf2size(
  _pdf: ArrayBuffer | Uint8Array,
): Promise<Array<{ width: number; height: number }>> {
  return [{ width: LABEL_MM, height: LABEL_MM }];
}

export async function pdf2img(
  _pdf: ArrayBuffer | Uint8Array,
  _options?: { scale?: number },
): Promise<Uint8Array[]> {
  return [];
}

export async function img2pdf(_images: Uint8Array[]): Promise<Uint8Array> {
  return new Uint8Array();
}
