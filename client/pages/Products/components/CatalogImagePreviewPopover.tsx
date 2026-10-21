import { useMemo, useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { catalogImageThumbUrl } from '@shared/utils/catalogImageThumbUrl';
import {
  CatalogImageGalleryLightbox,
  type CatalogGalleryImage,
} from './CatalogImageGalleryLightbox';

const GRID_SLOTS = 6;

interface CatalogImagePreviewPopoverProps {
  urls: string[];
  label?: string;
  children: ReactNode;
  clickToOpen?: boolean;
}

function buildGalleryImages(urls: string[]): CatalogGalleryImage[] {
  return urls.filter(Boolean).map((src) => ({
    src,
    thumbSrc: catalogImageThumbUrl(src),
  }));
}

export function CatalogImagePreviewPopover({
  urls,
  label,
  children,
  clickToOpen = true,
}: CatalogImagePreviewPopoverProps) {
  const [open, setOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const allUrls = useMemo(() => urls.filter(Boolean), [urls]);
  const galleryImages = useMemo(() => buildGalleryImages(allUrls), [allUrls]);

  if (allUrls.length === 0) {
    return <>{children}</>;
  }

  const count = allUrls.length;
  const showMoreCell = count > GRID_SLOTS;
  const visibleUrls = showMoreCell ? allUrls.slice(0, GRID_SLOTS - 1) : allUrls.slice(0, GRID_SLOTS);
  const moreCount = showMoreCell ? count - (GRID_SLOTS - 1) : 0;

  const openGalleryAt = (index: number) => {
    setGalleryIndex(index);
    setOpen(false);
  };

  const gridThumbSrc = (url: string) => catalogImageThumbUrl(url);

  return (
    <>
      <Popover
        isOpen={open}
        onOpenChange={setOpen}
        placement="top"
        showArrow
        offset={10}
        shouldBlockScroll={false}
        classNames={{ 
          base: 'z-[10050] before:white before:rounded-[6px_2px_2px_2px] before:z-1 before:shadow-[1px_1px_2px_-0.5px_rgba(0,0,0,0.1)]',
          content: 'p-2 max-w-[20rem]',
        }}
      >
        <PopoverTrigger>
          <button
            type="button"
            data-selection-ignore
            className="inline-flex cursor-pointer text-left"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!clickToOpen) {
                e.preventDefault();
              }
            }}
          >
            {children}
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col gap-2">
            <div className={`grid ${visibleUrls.length < 3 ? `grid-cols-${visibleUrls.length}` : 'grid-cols-3'} gap-1.5`}>
              {visibleUrls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  className="h-16 w-16 overflow-hidden rounded-sm bg-default-100 ring-offset-1 hover:ring-1 hover:ring-primary/30 transition-ring duration-200"
                  onClick={() => openGalleryAt(index)}
                >
                  <img
                    src={gridThumbSrc(url)}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
              {showMoreCell ? (
                <button
                  type="button"
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-sm bg-default-700/75 px-1 text-center text-[10px] leading-tight text-white ring-offset-1 hover:ring-1 hover:ring-primary/30 hover:bg-default-700/60 transition-[colors_ring] duration-200"
                  onClick={() => openGalleryAt(GRID_SLOTS - 1)}
                >
                  <span className="font-semibold">І ще {moreCount}</span>
                </button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <CatalogImageGalleryLightbox
        images={galleryImages}
        openIndex={galleryIndex}
        onClose={() => setGalleryIndex(null)}
      />
    </>
  );
}
