import { DynamicIcon } from 'lucide-react/dynamic';

interface QtyPillsProps {
  boxes: number;
  loose: number;
}

/** Коробки + розсип (порції поза повними коробками). */
export function QtyPills({ boxes, loose }: QtyPillsProps) {
  if (boxes <= 0 && loose <= 0) return null;
  return (
    <span className="flex items-center gap-2">
      {boxes > 0 && (
        <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/50 rounded px-1.5 py-0.5 ring-1 ring-neutral-400/80">
          <DynamicIcon name="package-2" size={14} strokeWidth={1.5} className="shrink-0" />
          {boxes}
        </span>
      )}
      {loose > 0 && (
        <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/50 rounded px-1.5 py-0.5 ring-1 ring-neutral-400/80 relative">
          {boxes > 0 && (
            <DynamicIcon
              name="plus"
              size={12}
              strokeWidth={2}
              className="shrink-0 text-sm absolute -left-2.5 bg-yellow-200 rounded-full border-1 border-neutral-400 leading-none"
            />
          )}
          <DynamicIcon name="paper-bag" size={14} strokeWidth={1.5} className="shrink-0" />
          {loose}
        </span>
      )}
    </span>
  );
}
