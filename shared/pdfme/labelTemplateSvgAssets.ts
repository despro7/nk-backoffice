/** Канонічні SVG-слоти макету (content у БД часто порожній або URL-плейсхолдер). */
export const LABEL_TEMPLATE_SVG_FIELD_NAMES = new Set([
  'logo_svg',
  'instruction_svg',
  'estimated_svg',
  'warning_icon',
  'qr_url',
]);

/** Чи потрібно підставити SVG з public замість збереженого content. */
export function isStoredLabelSvgContentMissing(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) return false;
  if (trimmed.startsWith('data:image/svg+xml')) return false;
  // Designer інколи зберігає шлях замість тіла SVG.
  if (trimmed.startsWith('/') && !trimmed.includes('<')) return true;
  if (/^https?:\/\//i.test(trimmed) && !trimmed.includes('<')) return true;
  return false;
}
