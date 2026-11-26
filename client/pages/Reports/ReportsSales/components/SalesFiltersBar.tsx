import { useEffect, useRef, useState } from "react";
import { Badge, Button, Tooltip } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { ActionBubble, ActionBubbleDock } from "@/components/action-bubble";
import { useIsMobile } from "@/hooks/useTouchUi";
import { ReportsFilterBuilder, type ReportFilterConfig } from "../../shared/filters";

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
}

const ACTION_CLASS = "h-10 w-10 min-w-10 shrink-0 border-1.5 transition-colors";

/** true, поки блок звіту (батько фільтрів) перетинає середину екрана. */
function useSectionAtViewportCenter(enabled: boolean) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isCurrent, setIsCurrent] = useState(false);

  useEffect(() => {
    const section = anchorRef.current?.parentElement;
    if (!enabled || !section) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsCurrent(entry.isIntersecting),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [enabled]);

  return { anchorRef, isCurrent };
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
}: SalesFiltersBarProps) {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const { anchorRef, isCurrent } = useSectionAtViewportCenter(isMobile);

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
    const stacked = [...filters, ...moreFilters].map((filter) => ({ ...filter, className: "w-full" }));

    return (
      <div ref={anchorRef}>
        <ActionBubbleDock visible={isCurrent}>
          <ActionBubble
            id="filters"
            colorPreset="sky"
            icon="filter"
            title="Фільтри"
            ariaLabel="Фільтри звіту"
            isOpen={bubbleOpen}
            onOpenChange={setBubbleOpen}
            badge={hasActiveFilters}
            panelWidth="min(20rem, calc(100vw - 2rem))"
            panelBodyClassName="p-3"
          >
            <ReportsFilterBuilder filters={stacked} className="flex flex-col gap-2" />
            <div className="mt-3 flex">{actions}</div>
          </ActionBubble>
        </ActionBubbleDock>
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
