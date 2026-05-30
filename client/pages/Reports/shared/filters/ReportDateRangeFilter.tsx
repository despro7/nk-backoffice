import { DateRangePicker } from "@heroui/react";
import type { DateValue } from "@internationalized/date";
import { I18nProvider } from "@react-aria/i18n";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";

interface ReportDateRangeFilterProps {
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  inputWrapperClassName?: string;
  maxValue?: DateValue;
}

export default function ReportDateRangeFilter({
  value,
  onChange,
  className,
  size = "md",
  inputWrapperClassName = "h-10",
  maxValue,
}: ReportDateRangeFilterProps) {
  return (
    <div className={className ?? "flex-1"}>
      <I18nProvider locale="uk-UA">
        <DateRangePicker
          aria-label="Або власний період"
          value={value}
          onChange={onChange}
          maxValue={maxValue}
          size={size}
          selectorButtonPlacement="start"
          selectorIcon={<DynamicIcon name="calendar" size={18} />}
          classNames={{
            base: "w-auto",
            inputWrapper: inputWrapperClassName,
            segment: "rounded",
          }}
        />
      </I18nProvider>
    </div>
  );
}