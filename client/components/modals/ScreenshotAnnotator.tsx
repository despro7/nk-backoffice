import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  drawStroke,
  mergeStrokesToImage,
  type ScreenshotStroke,
} from '@/components/modals/screenshotAnnotatorUtils';
import {
  ScreenshotAnnotatorToolbar,
  type AnnotateTool,
} from '@/components/modals/ScreenshotAnnotatorToolbar';

type DrawTool = 'rect' | 'ellipse';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

interface ScreenshotAnnotatorProps {
  src: string;
  strokes?: ScreenshotStroke[];
  onStrokesChange?: (strokes: ScreenshotStroke[]) => void;
  onAnnotatedChange: (dataUrl: string | null) => void;
  /** fullscreen — для модалки збільшення; compact — вбудоване превʼю */
  layout?: 'compact' | 'fullscreen';
  /** Якщо задано — тулбар рендериться через portal у цей контейнер (напр. ModalHeader) */
  toolbarContainer?: HTMLElement | null;
}

export function ScreenshotAnnotator({
  src,
  strokes: controlledStrokes,
  onStrokesChange,
  onAnnotatedChange,
  layout = 'fullscreen',
  toolbarContainer = null,
}: ScreenshotAnnotatorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<AnnotateTool>('pan');
  const [internalStrokes, setInternalStrokes] = useState<ScreenshotStroke[]>([]);
  const [draft, setDraft] = useState<ScreenshotStroke | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [imageNatural, setImageNatural] = useState({ width: 0, height: 0 });
  const [fitSize, setFitSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const isControlled = controlledStrokes !== undefined && onStrokesChange !== undefined;
  const strokes = isControlled ? controlledStrokes : internalStrokes;
  const isFullscreen = layout === 'fullscreen';

  const setStrokes = useCallback(
    (next: ScreenshotStroke[]) => {
      if (isControlled) {
        onStrokesChange(next);
      } else {
        setInternalStrokes(next);
      }
    },
    [isControlled, onStrokesChange],
  );

  useEffect(() => {
    if (!isControlled) {
      setInternalStrokes([]);
      setDraft(null);
      onAnnotatedChange(null);
    }
    setScale(1);
    setTool('pan');
    setImageNatural({ width: 0, height: 0 });
    setFitSize({ width: 0, height: 0 });
    viewportRef.current?.scrollTo({ left: 0, top: 0 });
  }, [src, isControlled]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomIn = () => setScale((value) => Math.min(ZOOM_MAX, +(value + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setScale((value) => Math.max(ZOOM_MIN, +(value - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setScale(1);

  const readImageNatural = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth || !img.naturalHeight) return;
    setImageNatural({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  /** Розмір зображення при scale=1 (fit у viewport). Layout-розмір, не CSS transform. */
  const measureFitSize = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !imageNatural.width || !imageNatural.height) return;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) return;

    const fitScale = Math.min(vw / imageNatural.width, vh / imageNatural.height);
    setFitSize({
      width: Math.max(1, Math.round(imageNatural.width * fitScale)),
      height: Math.max(1, Math.round(imageNatural.height * fitScale)),
    });
  }, [imageNatural]);

  const handleImageLoad = useCallback(() => {
    readImageNatural();
  }, [readImageNatural]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) {
      readImageNatural();
    }
  }, [src, readImageNatural]);

  useEffect(() => {
    if (!imageNatural.width) return;

    measureFitSize();
    const rafId = requestAnimationFrame(() => measureFitSize());
    return () => cancelAnimationFrame(rafId);
  }, [imageNatural, measureFitSize, layout]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const ro = new ResizeObserver(() => measureFitSize());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [measureFitSize]);

  const syncCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    canvas.width = width;
    canvas.height = height;
    setDisplaySize({ width, height });
  }, []);

  useEffect(() => {
    syncCanvasSize();
    const ro = new ResizeObserver(() => syncCanvasSize());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [syncCanvasSize, src, layout, scale, fitSize]);

  const paint = useCallback(
    (nextStrokes: ScreenshotStroke[], nextDraft: ScreenshotStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of nextStrokes) {
        drawStroke(ctx, stroke, canvas.width, canvas.height);
      }
      if (nextDraft) {
        drawStroke(ctx, nextDraft, canvas.width, canvas.height);
      }
    },
    [],
  );

  useEffect(() => {
    paint(strokes, draft);
  }, [strokes, draft, displaySize, paint]);

  const emitAnnotated = useCallback(
    async (nextStrokes: ScreenshotStroke[]) => {
      if (!nextStrokes.length) {
        onAnnotatedChange(null);
        return;
      }
      const merged = await mergeStrokesToImage(src, nextStrokes);
      onAnnotatedChange(merged);
    },
    [onAnnotatedChange, src],
  );

  const pointerToStroke = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }, drawTool: DrawTool): ScreenshotStroke => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { tool: drawTool, x: 0, y: 0, w: 0, h: 0 };
      }
      const x1 = Math.min(start.x, end.x) / canvas.width;
      const y1 = Math.min(start.y, end.y) / canvas.height;
      const x2 = Math.max(start.x, end.x) / canvas.width;
      const y2 = Math.max(start.y, end.y) / canvas.height;
      return {
        tool: drawTool,
        x: x1,
        y: y1,
        w: Math.max(0.005, x2 - x1),
        h: Math.max(0.005, y2 - y1),
      };
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === 'pan') {
      const viewport = viewportRef.current;
      if (!viewport) return;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    dragStartRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === 'pan') {
      const panStart = panStartRef.current;
      const viewport = viewportRef.current;
      if (!panStart || !viewport) return;
      viewport.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
      viewport.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
      return;
    }

    const start = dragStartRef.current;
    if (!start) return;
    const rect = canvas.getBoundingClientRect();
    const current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setDraft(pointerToStroke(start, current, tool));
  };

  const finishPointer = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === 'pan') {
      panStartRef.current = null;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    const start = dragStartRef.current;
    if (!start) return;

    const rect = canvas.getBoundingClientRect();
    const end = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    dragStartRef.current = null;
    setDraft(null);

    const stroke = pointerToStroke(start, end, tool);
    if (stroke.w < 0.01 && stroke.h < 0.01) return;

    const next = [...strokes, stroke];
    setStrokes(next);
    await emitAnnotated(next);

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleClear = async () => {
    setStrokes([]);
    setDraft(null);
    onAnnotatedChange(null);
  };

  const isLayoutReady = fitSize.width > 0 && fitSize.height > 0;

  const imageClassName = isLayoutReady
    ? 'block h-full w-full ring-1 ring-default-300 select-none pointer-events-none'
    : 'block max-h-full max-w-full w-full ring-1 ring-default-300 object-contain select-none pointer-events-none mx-auto';

  const viewportClassName = isFullscreen
    ? 'min-h-[240px] overflow-auto rounded-lg bg-neutral-200/80 border border-default-200'
    : 'overflow-auto max-h-64 rounded-lg bg-neutral-200/80 border border-default-200';

  const scaledWidth = Math.round(fitSize.width * scale);
  const scaledHeight = Math.round(fitSize.height * scale);

  const canvasCursorClass =
    tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair';

  const toolbar = (
    <ScreenshotAnnotatorToolbar
      scale={scale}
      tool={tool}
      strokesCount={strokes.length}
      zoomMin={ZOOM_MIN}
      zoomMax={ZOOM_MAX}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onZoomReset={zoomReset}
      onToolChange={setTool}
      onClear={() => void handleClear()}
      className={
        toolbarContainer
          ? 'flex flex-wrap items-center justify-end gap-1.5'
          : 'flex shrink-0 flex-wrap items-center justify-center gap-1.5'
      }
    />
  );

  return (
    <div className={isFullscreen ? 'flex h-full min-h-0 flex-col' : 'space-y-3'}>
      {!toolbarContainer ? toolbar : null}

      <div
        ref={viewportRef}
        className={isFullscreen ? `min-h-0 flex-1 ${viewportClassName}` : viewportClassName}
      >
          {isLayoutReady ? (
            <div
              className="relative mx-auto"
              style={{ width: scaledWidth, height: scaledHeight }}
            >
              <div
                ref={containerRef}
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: fitSize.width,
                  height: fitSize.height,
                  transform: `scale(${scale})`,
                }}
              >
                <img
                  ref={imgRef}
                  src={src}
                  alt="Скриншот для анотації"
                  className={imageClassName}
                  draggable={false}
                  onLoad={handleImageLoad}
                />
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 h-full w-full touch-none ${canvasCursorClass}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => void finishPointer(e)}
                  onPointerCancel={(e) => void finishPointer(e)}
                />
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative mx-auto"
              style={{ width: '100%', minHeight: isFullscreen ? 240 : 160 }}
            >
              <img
                ref={imgRef}
                src={src}
                alt="Скриншот для анотації"
                className={imageClassName}
                draggable={false}
                onLoad={handleImageLoad}
              />
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 h-full w-full touch-none ${canvasCursorClass}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => void finishPointer(e)}
                onPointerCancel={(e) => void finishPointer(e)}
              />
            </div>
          )}
      </div>

      {toolbarContainer ? createPortal(toolbar, toolbarContainer) : null}
    </div>
  );
}
