export function resolveCatalogMediaAbsoluteUrl(
  mediaPublicBaseUrl: string | null | undefined,
  url: string,
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = mediaPublicBaseUrl?.trim().replace(/\/+$/, '');
  if (!base) return trimmed;
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function resolveCatalogMediaAbsoluteUrls(
  mediaPublicBaseUrl: string | null | undefined,
  urls: string[],
): string[] {
  return urls.map((url) => resolveCatalogMediaAbsoluteUrl(mediaPublicBaseUrl, url));
}
