import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type ResizableDrawerPlacement = 'left' | 'right';

export interface UseResizableDrawerWidthOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  placement: ResizableDrawerPlacement;
}

function clampDrawerWidth(width: number, minWidth: number, maxWidth: number): number {
  const viewportMax = typeof window !== 'undefined'
    ? Math.floor(window.innerWidth * 0.92)
    : maxWidth;
  const cappedMax = Math.min(maxWidth, viewportMax);
  return Math.min(cappedMax, Math.max(minWidth, Math.round(width)));
}

function readStoredWidth(storageKey: string, defaultWidth: number, minWidth: number, maxWidth: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultWidth;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return defaultWidth;
    return clampDrawerWidth(parsed, minWidth, maxWidth);
  } catch {
    return defaultWidth;
  }
}

function persistWidth(storageKey: string, width: number): void {
  try {
    localStorage.setItem(storageKey, String(width));
  } catch {
    // ignore quota / private mode
  }
}

export function useResizableDrawerWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  placement,
}: UseResizableDrawerWidthOptions) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    setWidth(readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth));
  }, [storageKey, defaultWidth, minWidth, maxWidth]);

  useEffect(() => {
    const onResize = () => {
      setWidth((current) => clampDrawerWidth(current, minWidth, maxWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minWidth, maxWidth]);

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
      setWidth(clampDrawerWidth(nextWidth, minWidth, maxWidth));
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
        minWidth,
        maxWidth,
      );
      setWidth(nextWidth);
      persistWidth(storageKey, nextWidth);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [placement, width, storageKey, minWidth, maxWidth]);

  return {
    width,
    isResizing,
    minWidth,
    maxWidth,
    onResizePointerDown,
  };
}
