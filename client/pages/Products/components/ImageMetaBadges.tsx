import { useState, type ImgHTMLAttributes } from 'react';

export function formatImageSize(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} МБ`;
}

export function imageExtLabel(fileName: string | null | undefined): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName ?? '');
  return match ? match[1].toUpperCase() : '';
}

export interface ImageMeta {
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  ext?: string | null;
}

/** Рядок метаданих для caption: «1600 × 1200 px · 0,38 МБ · WEBP». */
export function formatImageMetaLine(meta: ImageMeta): string {
  return [
    meta.width && meta.height ? `${meta.width} × ${meta.height} px` : '',
    formatImageSize(meta.sizeBytes),
    meta.ext ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Мінімалістичні бейджі метаданих; видимі при наведенні на батьківський `.group`. */
export function ImageMetaBadges({ meta }: { meta: ImageMeta }) {
  const items = [
    meta.width && meta.height ? `${meta.width}×${meta.height}` : '',
    formatImageSize(meta.sizeBytes),
    meta.ext ?? '',
  ].filter(Boolean);
  if (items.length === 0) return null;
  return (
    <span className="pointer-events-none absolute inset-x-1 bottom-1 flex flex-wrap gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      {items.map((label) => (
        <span
          key={label}
          className="rounded bg-black/60 px-1 py-px text-[9px] font-medium leading-3 text-white backdrop-blur-sm"
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/** Мініатюра, що сама вимірює натуральні розміри та показує бейджі при hover. */
export function MeasuredThumb({
  sizeBytes,
  ext,
  ...imgProps
}: ImgHTMLAttributes<HTMLImageElement> & { sizeBytes?: number | null; ext?: string | null }) {
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  return (
    <span className="relative block">
      <img
        {...imgProps}
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget;
          if (naturalWidth && naturalHeight) setDims({ width: naturalWidth, height: naturalHeight });
          imgProps.onLoad?.(e);
        }}
      />
      <ImageMetaBadges meta={{ ...dims, sizeBytes, ext }} />
    </span>
  );
}
