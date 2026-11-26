import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Badge, Button, Tooltip } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { ActionBubble } from "@/components/action-bubble";
import { cn } from "@/lib/utils";
import { REPORT_CAPTURE_EXCLUDE_CLASS } from "@/services/ReportProblemService";
import { useIsMobile } from "@/hooks/useTouchUi";
import { ReportsFilterBuilder, type ReportFilterConfig } from "../../shared/filters";
import { useDraggableFilterBubble } from "./useDraggableFilterBubble";

interface SalesFiltersBarProps {
  /** Завжди видимі фільтри. */
  filters: ReportFilterConfig[];
  /** Другорядні фільтри під кнопкою «Ще фільтри». */
  moreFilters: ReportFilterConfig[];
  /** Скільки другорядних фільтрів зараз застосовано. */
  activeMoreCount: number;
  /** Чи застосовано хоч один фільтр (позначка на мобільній кнопці). */
  hasActiveFilters: boolean;
  colored?: boolean;
  onColoredToggle?: () => void;
  onReset: () => void;
  resetDisabled?: boolean;
  /** Ключ для збереження позиції перетягнутої мобільної кнопки (окремо для кожної секції). */
  positionKey?: string;
}

const ACTION_CLASS = "h-10 w-10 min-w-10 shrink-0 border-1.5 transition-colors";

/**
 * true, коли верх секції піднявся вище sticky-лінії кнопки фільтра.
 * Поки секція лише заходить знизу, кнопка висіла б над її верхнім краєм, тому її ховаємо.
 * 208px = 6.5rem (лінія sticky від низу екрана) + 3rem (bottom-12) + 3.5rem (висота кнопки); rootMargin приймає лише px або %.
 * `liftPx`: на скільки кнопку піднято перетягуванням, тоді секція має піднятися ще вище.
 */
function useSectionReachedFilterLine(enabled: boolean, liftPx: number) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [reached, setReached] = useState(false);

  useEffect(() => {
    const section = anchorRef.current?.parentElement;
    if (!enabled || !section) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setReached(entry.isIntersecting),
      { rootMargin: `0px 0px -${208 + Math.round(liftPx)}px 0px` },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [enabled, liftPx]);

  return { anchorRef, reached };
}

/** Фільтри блоків /reports/sales: один рядок на десктопі, ActionBubble на мобільних. */
export function SalesFiltersBar({
  filters,
  moreFilters,
  activeMoreCount,
  hasActiveFilters,
  colored,
  onColoredToggle,
  onReset,
  resetDisabled,
  positionKey,
}: SalesFiltersBarProps) {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const { offset, maxOffsetX, isDragging, consumeSuppressedPress, dragHandlers } = useDraggableFilterBubble({
    enabled: isMobile,
    storageKey: positionKey,
    sectionRef,
    // Тягнути можна лише закриту кнопку: «Закрити: Фільтри звіту» має інший aria-label
    handleSelector: 'button[aria-label="Фільтри звіту"]',
  });
  const { anchorRef, reached } = useSectionReachedFilterLine(isMobile, offset.y);

  // Межі перетягування: корінь секції (батько sticky-якоря)
  useLayoutEffect(() => {
    sectionRef.current = anchorRef.current?.parentElement ?? null;
  });
  // Унікальний id: на сторінці кілька секцій зі своїм фільтром
  const bubbleId = `filters-${useId()}`;

  const actions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {onColoredToggle && (
        <Tooltip content="Кольорове форматування">
          <Button
            isIconOnly
            variant="flat"
            aria-label="Кольорове форматування"
            aria-pressed={colored}
            onPress={onColoredToggle}
            className={`${ACTION_CLASS} ${
              colored
                ? "bg-lime-100 border-lime-500/50 text-lime-600/70"
                : "bg-transparent border-neutral-200 text-neutral-400"
            }`}
          >
            <DynamicIcon name="palette" size={18} />
          </Button>
        </Tooltip>
      )}
      <Tooltip content="Скинути фільтри">
        <Button
          isIconOnly
          variant="flat"
          aria-label="Скинути фільтри"
          isDisabled={resetDisabled}
          onPress={onReset}
          className={`${ACTION_CLASS} bg-transparent border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500`}
        >
          <DynamicIcon name="rotate-ccw" size={16} />
        </Button>
      </Tooltip>
    </div>
  );

  if (isMobile) {
    // Підказка над кнопкою в лівій половині вирівнюється по лівому краю, щоб не вилазити за екран
    const isLeftHalf = maxOffsetX > 0 && offset.x > maxOffsetX / 2;
    // Відкрита панель займає майже всю ширину секції: на час відкриття кнопка повертається у свій кут,
    // інакше панель із перетягнутої позиції вилазила б за край екрана
    const visualOffset = bubbleOpen ? { x: 0, y: 0 } : offset;
    const stacked = [...filters, ...moreFilters].map((filter) => ({ ...filter, className: "w-full" }));

    // Sticky-якір нульової висоти в корені секції: кнопка тримається внизу екрана, поки видно секцію,
    // і зупиняється на її нижньому краї, тож у кожної секції видно свій фільтр, а не один на всю сторінку.
    // bottom-12: у кінці секції кнопка зупиняється над рядком дій звіту, а не поверх нього.
    return (
      <div
        ref={anchorRef}
        data-report-capture-chrome="true"
        className={cn("sticky top-[calc(100dvh-6.5rem)] z-30 h-0", REPORT_CAPTURE_EXCLUDE_CLASS)}
      >
        {/* Обгортка з обробниками перетягування: утримати 1 с, далі кнопка йде за пальцем у межах секції */}
        <div
          {...dragHandlers}
          className={cn(
            "absolute right-0 bottom-12 transition-[opacity,transform] duration-200",
            isDragging && "transition-none",
            !reached && !bubbleOpen && !isDragging && "pointer-events-none opacity-0",
          )}
          style={{ transform: `translate(${-visualOffset.x}px, ${-visualOffset.y}px)` }}
        >
          {isDragging && (
            <span
              className={cn(
                "pointer-events-none absolute bottom-full mb-2",
                isLeftHalf ? "left-0" : "right-0",
              )}
            >
              <span className="block whitespace-nowrap rounded-md bg-default-900 px-2 py-1 text-xs font-medium text-white shadow-md">
                Перетягніть кнопку
              </span>
            </span>
          )}
          <ActionBubble
            id={bubbleId}
            colorPreset="sky"
            icon="filter"
            title="Фільтри"
            ariaLabel="Фільтри звіту"
            isOpen={bubbleOpen}
            onOpenChange={(open) => {
              if (consumeSuppressedPress()) return;
              setBubbleOpen(open);
            }}
            badge={hasActiveFilters}
            panelWidth="min(20rem, calc(100vw - 2rem))"
            panelBodyClassName="p-3"
            buttonClassName={cn(
              "touch-none select-none [-webkit-touch-callout:none]",
              isDragging && "scale-110 shadow-2xl ring-4 ring-sky-300/60",
            )}
            className="relative right-auto bottom-auto lg:bottom-auto"
          >
            <ReportsFilterBuilder filters={stacked} className="flex flex-col gap-2" />
            <div className="mt-3 flex">{actions}</div>
          </ActionBubble>
        </div>
      </div>
    );
  }

  return (
    <div ref={anchorRef} className="space-y-2">
      <div className="flex items-center gap-2">
        <ReportsFilterBuilder filters={filters} className="contents" />
        {moreFilters.length > 0 && (
          <Badge content={activeMoreCount} color="danger" size="sm" isInvisible={activeMoreCount === 0}>
            <Tooltip content="Ще фільтри">
              <Button
                isIconOnly
                variant="flat"
                aria-label="Ще фільтри"
                aria-expanded={moreOpen}
                onPress={() => setMoreOpen((open) => !open)}
                className={`${ACTION_CLASS} border-neutral-200 ${moreOpen ? "bg-neutral-200" : "bg-transparent"}`}
              >
                <DynamicIcon name="sliders-horizontal" size={18} />
              </Button>
            </Tooltip>
          </Badge>
        )}
        {actions}
      </div>
      {moreOpen && <ReportsFilterBuilder filters={moreFilters} />}
    </div>
  );
}
