import { Button, Chip, Select, SelectItem } from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { ReportFilterOption } from "./ReportFilterTypes";
import {
  REPORT_FILTER_ITEM_CLASS_NAMES,
  REPORT_FILTER_LISTBOX_HEIGHT,
  ReportFilterSelectedMark,
} from "./ReportMultiSelectFilter";

interface ReportSingleSelectFilterProps {
  ariaLabel: string;
  placeholder: string;
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  options: ReportFilterOption[];
  iconName: IconName;
  className?: string;
  triggerClassName?: string;
  iconSize?: number;
  size?: "sm" | "md" | "lg";
  showTags?: boolean;
  onReset?: () => void;
  onRemoved?: (removedKeys: string[], source: "chip" | "reset" | "list") => void;
  maxListboxHeight?: number;
}

export default function ReportSingleSelectFilter({
  ariaLabel,
  placeholder,
  selectedKey,
  onChange,
  options,
  iconName,
  className,
  triggerClassName = "h-10",
  iconSize = 19,
  size = "md",
  showTags = false,
  onReset,
  onRemoved,
  maxListboxHeight = REPORT_FILTER_LISTBOX_HEIGHT,
}: ReportSingleSelectFilterProps) {
  const selectedLabel = selectedKey
    ? (options.find((option) => option.key === selectedKey)?.label ?? selectedKey)
    : null;

  const emitClear = (source: "chip" | "reset" | "list") => {
    if (selectedKey && onRemoved) {
      onRemoved([selectedKey], source);
    }
  };

  return (
    <div className={className ?? ""}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <Select
            aria-label={ariaLabel}
            placeholder={placeholder}
            selectedKeys={selectedKey ? [selectedKey] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys) as string[];
              const next = selected.length > 0 ? selected[0] : null;
              if (!next && selectedKey) {
                emitClear("list");
              }
              onChange(next);
            }}
            size={size}
            maxListboxHeight={maxListboxHeight}
            startContent={<DynamicIcon name={iconName} className="text-gray-400" size={iconSize} />}
            classNames={{
              trigger: triggerClassName,
              innerWrapper: "gap-2",
            }}
          >
            {options.map((option) => (
              <SelectItem
                key={option.key}
                hideSelectedIcon
                endContent={
                  option.key === selectedKey ? <ReportFilterSelectedMark /> : null
                }
                classNames={REPORT_FILTER_ITEM_CLASS_NAMES}
              >
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </div>
        {onReset ? (
          <Button
            isIconOnly
            size={size}
            variant="flat"
            className="h-10 w-10 min-w-10 shrink-0"
            aria-label={`Скинути ${ariaLabel}`}
            isDisabled={!selectedKey}
            onPress={() => {
              emitClear("reset");
              onReset();
            }}
          >
            <DynamicIcon name="rotate-ccw" size={16} />
          </Button>
        ) : null}
      </div>
      {showTags && selectedKey && selectedLabel ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip size="sm" variant="flat" onClose={() => {
            emitClear("chip");
            onChange(null);
          }}>
            {selectedLabel}
          </Chip>
        </div>
      ) : null}
    </div>
  );
}
