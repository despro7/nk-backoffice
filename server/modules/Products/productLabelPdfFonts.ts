import path from 'path';
import { Font } from '@react-pdf/renderer';

let registered = false;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const FONTS_DIR = path.join(PUBLIC_DIR, 'fonts');

/** Реєструє шрифти для PDF наліпки «Порція». */
export function ensureProductLabelPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: 'CodeEAN13',
    src: path.join(PUBLIC_DIR, 'CodeEAN13.woff'),
  });

  Font.register({
    family: 'DaysOne',
    src: path.join(FONTS_DIR, 'DaysOne-Regular.ttf'),
  });

  Font.register({
    family: 'Arial',
    fonts: [
      { src: path.join(FONTS_DIR, 'ArialRegular.ttf'), fontWeight: 400 },
      { src: path.join(FONTS_DIR, 'ArialBold.ttf'), fontWeight: 700 },
    ],
  });

  Font.register({
    family: 'OpenSansCondensed',
    fonts: [
      { src: path.join(FONTS_DIR, 'OpenSansCondensed-Regular.woff'), fontWeight: 400 },
      { src: path.join(FONTS_DIR, 'OpenSansCondensed-Bold.ttf'), fontWeight: 700 },
    ],
  });

  registered = true;
}

/** SVG-асет з public/ для PDF (лише вектор). */
export function portionLabelPdfAsset(name: string): string {
  const base = name.replace(/\.(svg|png)$/i, '');
  return path.join(PUBLIC_DIR, `${base}.svg`);
}
