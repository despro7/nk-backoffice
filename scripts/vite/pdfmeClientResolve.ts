import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Vite resolve.alias — не тягнути clawpdf у client build. */
export const pdfmeClientAliases: Record<string, string> = {
  '@pdfme/converter': path.join(root, 'client/shims/pdfmeConverterBrowserStub.ts'),
};
