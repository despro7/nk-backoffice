import type { Font } from '@pdfme/common';

let fontPromise: Promise<Font> | null = null;

async function loadFace(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не вдалося завантажити шрифт ${url}`);
  return res.arrayBuffer();
}

/** SVG для превʼю в Designer (у шаблоні з БД content цих полів порожній). */
export async function loadLabelDesignerAssets(): Promise<Record<string, string>> {
  const files: Record<string, string> = {
    logo_svg: '/nk-food-logo.svg',
    instruction_svg: '/portion-instruction.svg',
    estimated_svg: '/estimated.svg',
    warning_icon: '/icon-warning.svg',
    qr_url: '/qr-code-nk.svg',
  };
  const entries = await Promise.all(
    Object.entries(files).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return [key, ''] as const;
        return [key, await res.text()] as const;
      } catch {
        return [key, ''] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Arial для pdfme Designer/Viewer у браузері. */
export function loadClientLabelFonts(): Promise<Font> {
  if (!fontPromise) {
    fontPromise = Promise.all([
      loadFace('/fonts/ArialRegular.ttf'),
      loadFace('/fonts/ArialBold.ttf'),
      loadFace('/fonts/DaysOne-Regular.ttf'),
      loadFace('/fonts/OpenSansCondensed-Bold.ttf'),
    ]).then(([regular, bold, daysOne, condensed]) => ({
      Arial: { data: regular, fallback: true, subset: false },
      ArialBold: { data: bold, subset: false },
      DaysOne: { data: daysOne, subset: false },
      OpenSansCondensed: { data: condensed, subset: false },
    }));
  }
  return fontPromise;
}
