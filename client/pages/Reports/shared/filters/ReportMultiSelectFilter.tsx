import { Autocomplete, AutocompleteItem, Button, Chip, Select, SelectItem } from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { ReportFilterOption } from "./ReportFilterTypes";

/** HeroUI default 256px + 30%. */
export const REPORT_FILTER_LISTBOX_HEIGHT = Math.round(256 * 1.3);

interface ReportMultiSelectFilterProps {
  ariaLabel: string;
  placeholder: string;
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  options: ReportFilterOption[];
  iconName: IconName;
  className?: string;
  baseClassName?: string;
  triggerClassName?: string;
  iconSize?: number;
  size?: "sm" | "md" | "lg";
  mode?: "select" | "autocomplete";
  showTags?: boolean;
  chipColor?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  onReset?: () => void;
  /** Викликається перед onChange / onReset, коли зникають обрані ключі. */
  onRemoved?: (removedKeys: string[], source: "chip" | "reset" | "list") => void;
  maxListboxHeight?: number;
}

function optionLabel(options: ReportFilterOption[], key: string): string {
  return options.find((option) => option.key === key)?.label ?? key;
}

export const REPORT_FILTER_ITEM_CLASS_NAMES = {
  base: "data-[selectable=true]:focus:bg-secondary/15 data-[selected=true]:bg-secondary/20 data-[selected=true]:text-foreground",
};

export function ReportFilterSelectedMark() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-white shadow-sm">
      <DynamicIcon name="check" size={12} />
    </span>
  );
}

function FilterOptionLabel({ option }: { option: ReportFilterOption }) {
  return (
    <span
      className="min-w-0 flex-1 truncate"
      style={{ paddingLeft: `${(option.depth ?? 0) * 14}px` }}
    >
      {option.depth ? (
        <span className="text-default-400 mr-1">{'└'}</span>
      ) : null}
      {option.label}
    </span>
  );
}

export default function ReportMultiSelectFilter({
  ariaLabel,
  placeholder,
  selectedKeys,
  onChange,
  options,
  iconName,
  className,
  baseClassName,
  triggerClassName = "h-10",
  iconSize = 19,
  size = "md",
  mode = "select",
  showTags = false,
  chipColor = "default",
  onReset,
  onRemoved,
  maxListboxHeight = REPORT_FILTER_LISTBOX_HEIGHT,
}: ReportMultiSelectFilterProps) {
  const selectedList = options.filter((option) => selectedKeys.has(option.key));
  const extraSelected = Array.from(selectedKeys).filter(
    (key) => !options.some((option) => option.key === key),
  );
  const hasSelection = selectedKeys.size > 0;
  const countPlaceholder = `${placeholder.replace(/\s*\(.*\)$/, "")} (${selectedKeys.size})`;

  const emitRemoved = (next: Set<string>, source: "chip" | "reset" | "list") => {
    if (!onRemoved) {
      return;
    }
    const removed = Array.from(selectedKeys).filter((key) => !next.has(key));
    if (removed.length > 0) {
      onRemoved(removed, source);
    }
  };

  const removeKey = (key: string) => {
    const next = new Set(selectedKeys);
    next.delete(key);
    emitRemoved(next, "chip");
    onChange(next);
  };

  const control =
    mode === "autocomplete" ? (
      <Autocomplete
        aria-label={ariaLabel}
        placeholder={hasSelection ? countPlaceholder : placeholder}
        selectedKey={null}
        onSelectionChange={(key) => {
          if (key == null || key === "") {
            return;
          }
          const id = String(key);
          const next = new Set(selectedKeys);
          if (next.has(id)) {
            next.delete(id);
            emitRemoved(next, "list");
          } else {
            next.add(id);
          }
          onChange(next);
        }}
        items={options}
        allowsCustomValue={false}
        menuTrigger="focus"
        isClearable={false}
        size={size}
        maxListboxHeight={maxListboxHeight}
        startContent={<DynamicIcon name={iconName} className="text-gray-400" size={iconSize} />}
        inputProps={{
          classNames: {
            inputWrapper: triggerClassName,
            innerWrapper: "gap-2",
          },
        }}
        classNames={{
          base: baseClassName,
        }}
      >
        {(option) => {
          const isSelected = selectedKeys.has(option.key);
          return (
            <AutocompleteItem
              key={option.key}
              textValue={option.label}
              className={
                isSelected
                  ? "bg-secondary/20 data-[hover=true]:bg-secondary/30"
                  : undefined
              }
              endContent={isSelected ? <ReportFilterSelectedMark /> : null}
            >
              <FilterOptionLabel option={option} />
            </AutocompleteItem>
          );
        }}
      </Autocomplete>
    ) : (
      <Select
        aria-label={ariaLabel}
        placeholder={placeholder}
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => {
          if (keys === "all") {
            onChange(new Set(options.map((option) => option.key)));
            return;
          }
          const next = new Set(Array.from(keys) as string[]);
          emitRemoved(next, "list");
          onChange(next);
        }}
        size={size}
        maxListboxHeight={maxListboxHeight}
        startContent={<DynamicIcon name={iconName} className="text-gray-400" size={iconSize} />}
        renderValue={
          showTags
            ? () => (
                <span className="truncate text-default-500">
                  {hasSelection ? `${placeholder.replace(/\s*\(.*\)$/, "")}: ${selectedKeys.size}` : placeholder}
                </span>
              )
            : undefined
        }
        classNames={{
          base: baseClassName,
          trigger: triggerClassName,
          innerWrapper: "gap-2",
        }}
      >
        {options.map((option) => (
          <SelectItem
            key={option.key}
            textValue={option.label}
            hideSelectedIcon
            endContent={
              selectedKeys.has(option.key) ? <ReportFilterSelectedMark /> : null
            }
            classNames={REPORT_FILTER_ITEM_CLASS_NAMES}
          >
            <FilterOptionLabel option={option} />
          </SelectItem>
        ))}
      </Select>
    );

  return (
    <div className={className}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{control}</div>
        {onReset ? (
          <Button
            isIconOnly
            size={size}
            variant="flat"
            className="h-10 w-10 min-w-10 shrink-0"
            aria-label={`Скинути ${ariaLabel}`}
            isDisabled={!hasSelection}
            onPress={() => {
              emitRemoved(new Set(), "reset");
              onReset();
            }}
          >
            <DynamicIcon name="rotate-ccw" size={16} />
          </Button>
        ) : null}
      </div>
      {showTags && hasSelection ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedList.map((option) => (
            <Chip
              key={option.key}
              size="sm"
              variant="flat"
              color={chipColor}
              onClose={() => removeKey(option.key)}
            >
              {option.label}
            </Chip>
          ))}
          {extraSelected.map((key) => (
            <Chip
              key={key}
              size="sm"
              variant="flat"
              color={chipColor}
              onClose={() => removeKey(key)}
            >
              {optionLabel(options, key)}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
