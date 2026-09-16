import { useEffect, useRef, useState } from 'react';
import type { ProductLabelPayload } from '@shared/types/productLabel';
import { PORTION_LABEL_CANVAS_PX } from '@shared/constants/productLabelPortionStatic';
import { PortionLabelCanvas } from './label/PortionLabelCanvas';

interface ProductLabelPreviewProps {
  payload: ProductLabelPayload;
  onChange: (patch: Partial<ProductLabelPayload>) => void;
  disabled?: boolean;
  nutritionErrors?: string[];
}

/** Максимальний масштаб превʼю відносно макету Figma (288px). */
const PREVIEW_MAX_SCALE = 2.5;
const PREVIEW_MIN_SCALE = 1.25;
/** Запас зверху для абсолютної панелі заголовка. */
const PREVIEW_TOOLBAR_OVERFLOW_PX = 30;

export function ProductLabelPreview({
  payload,
  onChange,
  disabled,
  nutritionErrors = [],
}: ProductLabelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(PREVIEW_MIN_SCALE);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const fitScale = width / PORTION_LABEL_CANVAS_PX;
      const next = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, fitScale));
      setScale(next);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displaySize = PORTION_LABEL_CANVAS_PX * scale;
  const toolbarSlot = PREVIEW_TOOLBAR_OVERFLOW_PX;
  const viewportHeight = displaySize + toolbarSlot;

  return (
    <div ref={containerRef} className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full max-w-[720px] flex-col gap-1 text-center">
        <p className="text-xs text-text-secondary">Клікніть на текст наліпки для редагування</p>
        {nutritionErrors.length > 0 ? (
          <p className="text-xs text-warning-600">
            Поживна цінність: {nutritionErrors[0]}
            {nutritionErrors.length > 1 ? ` (+${nutritionErrors.length - 1})` : ''}
          </p>
        ) : null}
      </div>
      <div className="relative" style={{ width: displaySize, height: viewportHeight }}>
        <div
          className="absolute bottom-0 left-0 z-20"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'bottom left',
            width: PORTION_LABEL_CANVAS_PX,
            height: PORTION_LABEL_CANVAS_PX,
          }}
        >
          <PortionLabelCanvas payload={payload} onChange={onChange} disabled={disabled} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 z-10 shadow-2xl ring-1 ring-black/5"
          style={{ width: displaySize, height: displaySize }}
        />
      </div>
    </div>
  );
}
