import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ProductMovementsDrawerPlacement } from '../types';

const STORAGE_KEY = 'product-movements-drawer-width-v1';

/** Близько до HeroUI size="4xl" (max-w-4xl ≈ 56rem). */
export const PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH = 840;
export const PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH = 622;
export const PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH = 1024;

function clampDrawerWidth(width: number): number {
  const viewportMax = typeof window !== 'undefined'
    ? Math.floor(window.innerWidth * 0.92)
    : PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH;
  const maxWidth = Math.min(PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH, viewportMax);
  return Math.min(maxWidth, Math.max(PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH, Math.round(width)));
}

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH;
    return clampDrawerWidth(parsed);
  } catch {
    return PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH;
  }
}

function persistWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // ignore quota / private mode
  }
}

export function useProductMovementsDrawerWidth(placement: ProductMovementsDrawerPlacement) {
  const [width, setWidth] = useState(PRODUCT_MOVEMENTS_DRAWER_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  useEffect(() => {
    const onResize = () => {
      setWidth((current) => clampDrawerWidth(current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onResizePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;
    const pointerId = event.pointerId;
    const target = event.currentTarget;

    target.setPointerCapture?.(pointerId);
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = placement === 'right'
        ? startWidth - delta
        : startWidth + delta;
      setWidth(clampDrawerWidth(nextWidth));
    };

    const onUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture?.(pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);

      const delta = upEvent.clientX - startX;
      const nextWidth = clampDrawerWidth(
        placement === 'right' ? startWidth - delta : startWidth + delta,
      );
      setWidth(nextWidth);
      persistWidth(nextWidth);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [placement, width]);

  return {
    width,
    isResizing,
    minWidth: PRODUCT_MOVEMENTS_DRAWER_MIN_WIDTH,
    maxWidth: PRODUCT_MOVEMENTS_DRAWER_MAX_WIDTH,
    onResizePointerDown,
  };
}
