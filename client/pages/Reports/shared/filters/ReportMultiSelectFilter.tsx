import { Select, SelectItem } from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { ReportFilterOption } from "./ReportFilterTypes";

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
}: ReportMultiSelectFilterProps) {
  return (
    <div className={className}>
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

          onChange(new Set(Array.from(keys) as string[]));
        }}
        size={size}
        startContent={<DynamicIcon name={iconName} className="text-gray-400" size={iconSize} />}
        classNames={{
          base: baseClassName,
          trigger: triggerClassName,
          innerWrapper: "gap-2",
        }}
      >
        {options.map((option) => (
          <SelectItem key={option.key}>{option.label}</SelectItem>
        ))}
      </Select>
    </div>
  );
}