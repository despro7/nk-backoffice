import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';

const UNDO_MS = 6000;

interface MovementMobUndoBannerProps {
  productName: string;
  onUndo: () => void;
  onElapsed: () => void;
}

export default function MovementMobUndoBanner({
  productName,
  onUndo,
  onElapsed,
}: MovementMobUndoBannerProps) {
  const [shrinking, setShrinking] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setShrinking(true));
    const timeout = window.setTimeout(onElapsed, UNDO_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [onElapsed]);

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-lg overflow-hidden rounded-xl bg-danger text-white shadow-lg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 origin-left bg-white/25 mix-blend-soft-light will-change-transform"
        style={{
          transform: shrinking ? 'scaleX(0)' : 'scaleX(1)',
          transition: shrinking ? `transform ${UNDO_MS}ms linear` : undefined,
        }}
      />
      <div className="relative z-10 flex items-center gap-3 px-3.5 py-3">
        <p className="min-w-0 flex-1 text-sm leading-tight">
          Видалено: <span className="font-medium">{productName}</span>
        </p>
        <Button
          size="sm"
          variant="flat"
          className="bg-white/15 text-white h-8 min-w-0 px-3"
          onPress={onUndo}
        >
          Скасувати
        </Button>
      </div>
    </div>
  );
}

export { UNDO_MS };
