import {
  registerPdfmeConverter,
  type PdfmeConverterImpl,
} from '@/shims/pdfmeConverterBrowserStub';

const PT_TO_MM = 25.4 / 72;

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;
let sharedWorker: InstanceType<PdfjsModule['PDFWorker']> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function openPdf(pdf: ArrayBuffer | Uint8Array) {
  const pdfjs = await loadPdfjs();
  // pdfjs передає буфер у worker (detach), працюємо з копією.
  const data = pdf instanceof Uint8Array ? pdf.slice() : new Uint8Array(pdf.slice(0));
  // Один спільний worker: pdfme викликає pdf2size + pdf2img на кожен рендер.
  sharedWorker ??= new pdfjs.PDFWorker();
  const task = pdfjs.getDocument({ data, worker: sharedWorker });
  const doc = await task.promise;
  return { doc, close: () => void task.destroy() };
}

const pdfjsConverter: PdfmeConverterImpl = {
  async pdf2size(pdf) {
    const { doc, close } = await openPdf(pdf);
    try {
      const sizes: Array<{ width: number; height: number }> = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const viewport = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push({ width: viewport.width * PT_TO_MM, height: viewport.height * PT_TO_MM });
      }
      return sizes;
    } finally {
      close();
    }
  },

  async pdf2img(pdf, options) {
    const scale = options?.scale ?? 1;
    const { doc, close } = await openPdf(pdf);
    try {
      const images: ArrayBuffer[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
        });
        images.push(await blob.arrayBuffer());
      }
      return images;
    } finally {
      close();
    }
  },
};

/** Вмикає рендер PDF як basePdf у pdfme Viewer (preview збереженої наліпки). */
export function ensurePdfjsPdfmeConverter(): void {
  registerPdfmeConverter(pdfjsConverter);
}
