import { DateRangePicker } from "@heroui/react";
import type { DateValue } from "@internationalized/date";
import { I18nProvider } from "@react-aria/i18n";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
import { useRangeCalendarMonths } from "@/hooks/useTouchUi";

/**
 * Дні між початком і кінцем діапазону. HeroUI фарбує їх `before:bg-primary-50`, а primary у проєкті сірий —
 * primary-50 на білому календарі не видно.
 */
const RANGE_CELL_CLASS =
  "data-[selected=true]:data-[range-selection=true]:before:bg-default-200 data-[selected=true]:data-[range-selection=true]:text-default-900";

interface ReportDateRangeFilterProps {
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  inputWrapperClassName?: string;
  maxValue?: DateValue;
  minValue?: DateValue;
  ariaLabel?: string;
}

export default function ReportDateRangeFilter({
  value,
  onChange,
  className,
  size = "md",
  inputWrapperClassName = "h-10",
  maxValue,
  minValue,
  ariaLabel = "Або власний період",
}: ReportDateRangeFilterProps) {
  const visibleMonths = useRangeCalendarMonths();
  return (
    <div className={className ?? "w-fit shrink-0"}>
      <I18nProvider locale="uk-UA">
        <DateRangePicker
          aria-label={ariaLabel}
          value={value}
          onChange={onChange}
          visibleMonths={visibleMonths}
          maxValue={maxValue}
          minValue={minValue}
          size={size}
          selectorButtonPlacement="start"
          selectorIcon={<DynamicIcon name="calendar" size={18} />}
          calendarProps={{ classNames: { cellButton: RANGE_CELL_CLASS } }}
          classNames={{
            // HeroUI default: base/inputWrapper = w-full — розтягує hit-area на всю ширину wrapper.
            base: "w-fit",
            inputWrapper: `${inputWrapperClassName} w-fit`,
            innerWrapper: "gap-x-2 w-fit",
            segment: "rounded",
          }}
        />
      </I18nProvider>
    </div>
  );
}