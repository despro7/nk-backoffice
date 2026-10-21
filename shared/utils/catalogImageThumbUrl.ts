/** Чи URL виглядає як WordPress/WooCommerce media (є варіанти -WxH). */
function isWooCommerceMediaUrl(src: string): boolean {
  if (/\/wp-content\/uploads\//i.test(src)) return true;
  if (/-\d+x\d+\.(jpe?g|png|webp|gif)(\?|$)/i.test(src)) return true;
  return false;
}

/** Мініатюра для preview-сітки; для BO /uploads/catalog/ — лише CSS-скейл, без -150x150. */
export function catalogImageThumbUrl(src: string, size = 150): string {
  const trimmed = src.trim();
  if (!trimmed) return trimmed;
  if (/\/uploads\/catalog\//i.test(trimmed)) return trimmed;
  if (!isWooCommerceMediaUrl(trimmed)) return trimmed;
  if (trimmed.includes(`-${size}x${size}.`)) return trimmed;
  const wpSized = trimmed.replace(/(\.(jpe?g|png|webp|gif))(\?.*)?$/i, `-${size}x${size}$1$3`);
  if (wpSized !== trimmed) return wpSized;
  return trimmed;
}
