/** Імена зображень каталогу: латиниця, пробіли -> дефіси, розширення не редагується. */

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ь: '', ю: 'yu', я: 'ya', ъ: '', ы: 'y', э: 'e', ё: 'yo',
};

export function splitImageName(name: string): { base: string; ext: string } {
  const trimmed = name.trim();
  const match = IMAGE_EXT_RE.exec(trimmed);
  if (!match) return { base: trimmed, ext: '' };
  return { base: trimmed.slice(0, match.index), ext: match[0].toLowerCase() };
}

export function sanitizeImageBaseName(base: string): string {
  const latin = Array.from(base.toLowerCase())
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const cleaned = latin
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return cleaned.slice(0, 120) || 'image';
}

/**
 * Повне ім'я файлу: санітизована база + розширення.
 * `forcedExt` (з крапкою) має пріоритет над розширенням у вхідному імені.
 */
export function buildCatalogImageName(rawName: string, forcedExt?: string | null): string {
  const { base, ext } = splitImageName(rawName);
  const finalExt = (forcedExt || ext || '').toLowerCase();
  return `${sanitizeImageBaseName(base)}${finalExt}`;
}
