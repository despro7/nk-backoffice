/** Порівняння наборів зображень (Backoffice vs WooCommerce): назва, розмір, формат. */

export interface PullImageMeta {
  url: string;
  /** Назва для показу (з розширенням) */
  name: string;
  /** Ім'я файлу за URL (для порівняння); якщо немає, береться `name` */
  fileKey?: string;
  /** Додаткові прийнятні імена (напр. uuid-ім'я з раніших push) */
  altKeys?: string[];
  sizeBytes: number | null;
  /** Розширення великими літерами без крапки (WEBP, JPG...) */
  ext: string;
}

const SIZE_TOLERANCE = 0.02;

export function imageExtFromName(name: string): string {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(name.trim());
  const ext = match ? match[1].toUpperCase() : '';
  return ext === 'JPEG' ? 'JPG' : ext;
}

export function imageFileNameFromUrl(url: string): string {
  try {
    const path = new URL(url, 'http://local').pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return url.split('/').pop() ?? '';
  }
}

/** Основа назви без розширення та службових суфіксів WordPress (-scaled, -1200x800). */
export function imageNameStem(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-scaled$/, '')
    .replace(/-\d+x\d+$/, '');
}

export interface ImageMetaDiff {
  name: boolean;
  size: boolean;
  ext: boolean;
}

function imageNameMatches(a: PullImageMeta, b: PullImageMeta): boolean {
  const stems = (m: PullImageMeta) =>
    new Set([m.fileKey ?? m.name, m.name, ...(m.altKeys ?? [])].map(imageNameStem));
  const sa = stems(a);
  for (const s of stems(b)) if (sa.has(s)) return true;
  return false;
}

export function diffImageMeta(a: PullImageMeta, b: PullImageMeta): ImageMetaDiff {
  const sizeDiffers =
    a.sizeBytes != null &&
    b.sizeBytes != null &&
    Math.abs(a.sizeBytes - b.sizeBytes) / Math.max(a.sizeBytes, b.sizeBytes) > SIZE_TOLERANCE;
  return {
    name: !imageNameMatches(a, b),
    size: sizeDiffers,
    ext: a.ext !== b.ext,
  };
}

/** Набори відрізняються: різна кількість або будь-яка позиційна розбіжність назви/розміру/формату. */
export function imageSetsDiffer(local: PullImageMeta[], remote: PullImageMeta[]): boolean {
  if (local.length !== remote.length) return true;
  return local.some((img, i) => {
    const d = diffImageMeta(img, remote[i]);
    // WordPress перестискає зображення при завантаженні: менший файл на WC не є розбіжністю,
    // конфліктом вважаємо лише більший (WC має неоптимізовану версію)
    const remoteLarger =
      d.size && img.sizeBytes != null && remote[i].sizeBytes != null && remote[i].sizeBytes > img.sizeBytes;
    return d.name || d.ext || remoteLarger;
  });
}
