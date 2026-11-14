/**
 * Заміна @pdfme/converter у клієнтському бандлі.
 * Повний converter тягне clawpdf/pdfium (Node + великий WASM) → OOM на vite build.
 *
 * Файл потрапляє у Vite prebundle `@pdfme/ui`, тому без імпортів: реальний рендер PDF
 * (pdfjs-dist) реєструє застосунок через `registerPdfmeConverter` перед показом PDF
 * (preview збереженої наліпки). Без реєстрації: заглушка для шаблонів з basePdf 100×100 мм.
 */

const LABEL_MM = 100;
const REGISTRY_KEY = '__nkPdfmeConverter';

export interface PdfmeConverterImpl {
  pdf2size(pdf: ArrayBuffer | Uint8Array): Promise<Array<{ width: number; height: number }>>;
  pdf2img(pdf: ArrayBuffer | Uint8Array, options?: { scale?: number }): Promise<ArrayBuffer[]>;
}

function registered(): PdfmeConverterImpl | undefined {
  return (globalThis as Record<string, unknown>)[REGISTRY_KEY] as PdfmeConverterImpl | undefined;
}

export function registerPdfmeConverter(impl: PdfmeConverterImpl): void {
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] = impl;
}

export async function pdf2size(
  pdf: ArrayBuffer | Uint8Array,
): Promise<Array<{ width: number; height: number }>> {
  const impl = registered();
  if (impl) return impl.pdf2size(pdf);
  return [{ width: LABEL_MM, height: LABEL_MM }];
}

export async function pdf2img(
  pdf: ArrayBuffer | Uint8Array,
  options?: { scale?: number },
): Promise<ArrayBuffer[]> {
  const impl = registered();
  if (impl) return impl.pdf2img(pdf, options);
  return [];
}

export async function img2pdf(_images: Uint8Array[]): Promise<Uint8Array> {
  return new Uint8Array();
}
