import { Button, DatePicker } from "@heroui/react";
import type { DateValue } from "@internationalized/date";
import { I18nProvider } from "@react-aria/i18n";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

interface ReportSingleDateFilterProps {
  ariaLabel: string;
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  triggerClassName?: string;
  previousButtonClassName?: string;
  nextButtonClassName?: string;
  iconName?: IconName;
  maxValue?: DateValue;
}

export default function ReportSingleDateFilter({
  ariaLabel,
  value,
  onChange,
  className,
  size = "md",
  triggerClassName = "h-10 rounded-none",
  previousButtonClassName = "h-10 rounded-r-none border-r-0",
  nextButtonClassName = "h-10 rounded-l-none border-l-0",
  iconName = "calendar-days",
  maxValue,
}: ReportSingleDateFilterProps) {
  const isNextDisabled = Boolean(value && maxValue && value.compare(maxValue) >= 0);

  return (
    <div className={className}>
      <div className="flex items-center gap-0">
        <Button
          isIconOnly
          size={size}
          variant="flat"
          aria-label="Попередній день"
          onPress={() => {
            if (!value) {
              return;
            }

            onChange(value.subtract({ days: 1 }));
          }}
          disabled={!value}
          className={previousButtonClassName}
        >
          <DynamicIcon name="chevron-left" className="w-4 h-4" />
        </Button>

        <I18nProvider locale="uk-UA">
          <DatePicker
            aria-label={ariaLabel}
            value={value}
            onChange={onChange}
            maxValue={maxValue}
            size={size}
            selectorButtonPlacement="start"
            selectorIcon={<DynamicIcon name={iconName} size={18} className="shrink-0" />}
            classNames={{
              base: "w-auto",
              inputWrapper: triggerClassName,
              segment: "rounded",
            }}
          />
        </I18nProvider>

        <Button
          isIconOnly
          size={size}
          variant="flat"
          aria-label="Наступний день"
          onPress={() => {
            if (!value) {
              return;
            }

            onChange(value.add({ days: 1 }));
          }}
          disabled={!value || isNextDisabled}
          className={nextButtonClassName}
        >
          <DynamicIcon name="chevron-right" className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}