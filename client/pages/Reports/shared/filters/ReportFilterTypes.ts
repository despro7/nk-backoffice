import type { DateValue } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import type { IconName } from "lucide-react/dynamic";

export interface ReportFilterOption {
  key: string;
  label: string;
  /** Вкладеність у дереві (для груп товарів). */
  depth?: number;
}

export interface ReportFilterProductOption {
  sku: string;
  name: string;
}

type ReportFilterSize = "sm" | "md" | "lg";

/** HeroUI Select / Autocomplete popoverProps (placement, offset тощо). */
export type ReportFilterPopoverProps = Record<string, unknown>;

interface ReportFilterBaseConfig {
  key: string;
  className?: string;
  size?: ReportFilterSize;
}

interface ReportSelectPopoverConfig {
  /** Клас для popover — може бути ширшим за trigger (`w-auto min-w-max`). */
  popoverClassName?: string;
  popoverProps?: ReportFilterPopoverProps;
}

export interface ReportSingleSelectFilterConfig extends ReportFilterBaseConfig, ReportSelectPopoverConfig {
  type: "singleSelect";
  ariaLabel: string;
  placeholder: string;
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  options: ReportFilterOption[];
  iconName: IconName;
  triggerClassName?: string;
  iconSize?: number;
}

export interface ReportMultiSelectFilterConfig extends ReportFilterBaseConfig, ReportSelectPopoverConfig {
  type: "multiSelect";
  ariaLabel: string;
  placeholder: string;
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  options: ReportFilterOption[];
  iconName: IconName;
  triggerClassName?: string;
  baseClassName?: string;
  iconSize?: number;
  /** Компактний trigger: «Плейсхолдер (N)» замість переліку обраних. */
  compactTrigger?: boolean;
  showTags?: boolean;
}

export interface ReportProductSelectFilterConfig extends ReportFilterBaseConfig {
  type: "productSelect";
  ariaLabel: string;
  placeholder: string;
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  products: ReportFilterProductOption[];
  triggerClassName?: string;
  baseClassName?: string;
  iconSize?: number;
}

export interface ReportDateRangeFilterConfig extends ReportFilterBaseConfig {
  type: "dateRange";
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  inputWrapperClassName?: string;
  maxValue?: DateValue;
}

export interface ReportSingleDateFilterConfig extends ReportFilterBaseConfig {
  type: "singleDate";
  ariaLabel: string;
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
  maxValue?: DateValue;
  triggerClassName?: string;
  previousButtonClassName?: string;
  nextButtonClassName?: string;
  iconName?: IconName;
}

export interface ReportActionButtonFilterConfig extends ReportFilterBaseConfig {
  type: "actionButton";
  label?: string;
  onPress: () => void;
  iconName?: IconName;
  disabled?: boolean;
  isIconOnly?: boolean;
  variant?: "solid" | "bordered" | "light" | "flat" | "faded" | "shadow" | "ghost";
}

export interface ReportResetFilterConfig extends ReportFilterBaseConfig {
  type: "reset";
  onPress: () => void;
  disabled?: boolean;
  iconSize?: number;
}

export interface ReportCustomFilterConfig extends ReportFilterBaseConfig {
  type: "custom";
  render: () => React.ReactNode;
}

export type ReportFilterConfig =
  | ReportSingleSelectFilterConfig
  | ReportMultiSelectFilterConfig
  | ReportProductSelectFilterConfig
  | ReportDateRangeFilterConfig
  | ReportSingleDateFilterConfig
  | ReportActionButtonFilterConfig
  | ReportResetFilterConfig
  | ReportCustomFilterConfig;