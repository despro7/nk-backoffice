import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface CatalogTreeBubbleProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** Плаваюча бульбашка каталогу для мобільної адаптації (< md). */
export function CatalogTreeBubble({
  isOpen,
  onOpenChange,
  children,
}: CatalogTreeBubbleProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[role="menu"][aria-label="Дії з елементами каталогу"]')) return;
      onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div
      ref={rootRef}
      className="fixed right-4 z-50 flex flex-col items-end gap-3 md:hidden bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
    >
      {isOpen ? (
        <div className="w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-default-200 bg-content1 shadow-xl">
          <div className="flex items-center gap-2 border-b border-default-200 px-3 py-2">
            <DynamicIcon name="folder-tree" size={16} className="text-default-500" />
            <span className="text-sm font-semibold">Каталог</span>
          </div>
          <div className="h-[min(60dvh,32rem)] overflow-hidden p-1">{children}</div>
        </div>
      ) : null}

      <Button
        isIconOnly
        radius="full"
        aria-label={isOpen ? 'Закрити каталог' : 'Відкрити каталог'}
        aria-expanded={isOpen}
        className="h-14 w-14 min-w-14 bg-gradient-to-b from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-600/30"
        onPress={() => onOpenChange(!isOpen)}
      >
        <DynamicIcon name={isOpen ? 'x' : 'folder-tree'} size={22} />
      </Button>
    </div>
  );
}
