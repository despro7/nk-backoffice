import { Select, SelectItem } from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { ReportFilterOption } from "./ReportFilterTypes";

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
}: ReportSingleSelectFilterProps) {
  return (
    <div className={`flex-1 ${className ?? ""}`}>
      <Select
        aria-label={ariaLabel}
        placeholder={placeholder}
        selectedKeys={selectedKey ? [selectedKey] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys) as string[];
          onChange(selected.length > 0 ? selected[0] : null);
        }}
        size={size}
        startContent={<DynamicIcon name={iconName} className="text-gray-400" size={iconSize} />}
        classNames={{
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