import { useEffect, useRef, useState, type RefObject } from 'react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import type { DataSource } from 'photoswipe';
import 'photoswipe/style.css';
import { catalogImageThumbUrl } from '@shared/utils/catalogImageThumbUrl';
import {
  markPhotoSwipeClosed,
  markPhotoSwipeOpen,
} from '@/lib/photoswipeOverlay';

export interface CatalogGalleryImage {
  src: string;
  thumbSrc?: string;
  alt?: string;
}

interface CatalogImageGalleryLightboxProps {
  images: CatalogGalleryImage[];
  openIndex: number | null;
  onClose: () => void;
  /** Монтувати `.pswp` всередині drawer — менше «interact outside». */
  appendToRef?: RefObject<HTMLElement | null>;
}

function probeImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 1200,
        height: img.naturalHeight || 800,
      });
    };
    img.onerror = () => resolve({ width: 1200, height: 800 });
    img.src = src;
  });
}

export function CatalogImageGalleryLightbox({
  images,
  openIndex,
  onClose,
  appendToRef,
}: CatalogImageGalleryLightboxProps) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);
  const onCloseRef = useRef(onClose);
  const appendToRefStable = useRef(appendToRef);
  const [dataSource, setDataSource] = useState<DataSource>([]);

  onCloseRef.current = onClose;
  appendToRefStable.current = appendToRef;

  useEffect(() => {
    if (images.length === 0) {
      setDataSource([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      images.map(async (img) => {
        const { width, height } = await probeImageSize(img.src);
        return {
          src: img.src,
          msrc: img.thumbSrc ?? catalogImageThumbUrl(img.src),
          width,
          height,
          alt: img.alt ?? '',
        };
      }),
    ).then((items) => {
      if (!cancelled) setDataSource(items);
    });
    return () => {
      cancelled = true;
    };
  }, [images]);

  useEffect(() => {
    let destroying = false;
    const lightbox = new PhotoSwipeLightbox({
      dataSource: [],
      pswpModule: () => import('photoswipe'),
      showHideAnimationType: 'zoom',
      initialZoomLevel: 'fit',
      appendToEl: document.body,
    });

    lightbox.on('openingAnimationStart', () => {
      markPhotoSwipeOpen();
    });

    lightbox.on('close', () => {
      markPhotoSwipeClosed();
      if (!destroying) {
        onCloseRef.current();
      }
    });

    lightbox.init();
    lightboxRef.current = lightbox;

    return () => {
      destroying = true;
      markPhotoSwipeClosed();
      lightbox.destroy();
      lightboxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lb = lightboxRef.current;
    const slides = Array.isArray(dataSource) ? dataSource : [];
    if (!lb || slides.length === 0) return;

    lb.options.dataSource = slides;
    const host = appendToRefStable.current?.current;
    lb.options.appendToEl = host ?? document.body;

    if (openIndex == null || openIndex < 0 || openIndex >= slides.length) {
      if (lb.pswp) {
        lb.pswp.close();
      }
      return;
    }

    if (lb.pswp?.isOpen) {
      lb.pswp.goTo(openIndex);
      return;
    }

    lb.loadAndOpen(openIndex);
  }, [dataSource, openIndex]);

  return null;
}
