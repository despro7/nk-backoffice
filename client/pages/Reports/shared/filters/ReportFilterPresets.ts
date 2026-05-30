import type { DateValue } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import type { IconName } from "lucide-react/dynamic";
import type {
  ReportActionButtonFilterConfig,
  ReportDateRangeFilterConfig,
  ReportFilterConfig,
  ReportFilterOption,
  ReportFilterProductOption,
  ReportProductSelectFilterConfig,
  ReportResetFilterConfig,
  ReportSingleDateFilterConfig,
  ReportSingleSelectFilterConfig,
} from "./ReportFilterTypes";

type ReportFilterSize = "sm" | "md" | "lg";

interface CreateProductFilterConfigParams {
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  products: ReportFilterProductOption[];
  className?: string;
  baseClassName?: string;
  triggerClassName?: string;
  size?: ReportFilterSize;
  key?: string;
  ariaLabel?: string;
  placeholder?: string;
  iconSize?: number;
}

interface CreateStatusFilterConfigParams {
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  options: ReportFilterOption[];
  className?: string;
  triggerClassName?: string;
  size?: ReportFilterSize;
  key?: string;
  ariaLabel?: string;
  placeholder?: string;
  iconName?: IconName;
  iconSize?: number;
}

interface CreatePeriodFilterConfigParams {
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  options: ReportFilterOption[];
  className?: string;
  triggerClassName?: string;
  size?: ReportFilterSize;
  key?: string;
  ariaLabel?: string;
  placeholder?: string;
  iconName?: IconName;
  iconSize?: number;
}

interface CreateDateRangeFilterConfigParams {
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  className?: string;
  size?: ReportFilterSize;
  key?: string;
  inputWrapperClassName?: string;
  maxValue?: DateValue;
}

interface CreateSingleDateFilterConfigParams {
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
  className?: string;
  size?: ReportFilterSize;
  key?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  previousButtonClassName?: string;
  nextButtonClassName?: string;
  iconName?: IconName;
  maxValue?: DateValue;
}

interface CreateResetFilterConfigParams {
  onPress: () => void;
  disabled?: boolean;
  size?: ReportFilterSize;
  className?: string;
  iconSize?: number;
  key?: string;
}

interface CreateActionButtonFilterConfigParams {
  onPress: () => void;
  label?: string;
  iconName?: IconName;
  disabled?: boolean;
  isIconOnly?: boolean;
  variant?: ReportActionButtonFilterConfig["variant"];
  className?: string;
  size?: ReportFilterSize;
  key: string;
}

interface CreateProductToolbarFilterConfigsParams {
  products: ReportFilterProductOption[];
  selectedProduct: string | null;
  onSelectedProductChange: (key: string | null) => void;
  statusFilter: string | null;
  onStatusFilterChange: (key: string | null) => void;
  statusOptions: ReportFilterOption[];
  periodPresetKey: string | null;
  onPeriodPresetChange: (key: string | null) => void;
  periodPresetOptions: ReportFilterOption[];
  onReset?: () => void;
  loading?: boolean;
  size?: ReportFilterSize;
  productClassName?: string;
  productBaseClassName?: string;
  productTriggerClassName?: string;
  statusClassName?: string;
  statusTriggerClassName?: string;
  periodClassName?: string;
  periodTriggerClassName?: string;
  periodIconName?: IconName;
  resetClassName?: string;
  extraFilters?: ReportFilterConfig[];
  includeReset?: boolean;
}

export function createProductFilterConfig({
  key = "product",
  ariaLabel = "Фільтр по товару",
  placeholder = "Всі товари",
  ...params
}: CreateProductFilterConfigParams): ReportProductSelectFilterConfig {
  return {
    type: "productSelect",
    key,
    ariaLabel,
    placeholder,
    selectedKey: params.selectedKey,
    onChange: params.onChange,
    products: params.products,
    className: params.className,
    baseClassName: params.baseClassName,
    triggerClassName: params.triggerClassName,
    size: params.size,
    iconSize: params.iconSize,
  };
}

export function createStatusFilterConfig({
  key = "status",
  ariaLabel = "Статус замовлення",
  placeholder = "Всі статуси",
  iconName = "filter",
  ...params
}: CreateStatusFilterConfigParams): ReportSingleSelectFilterConfig {
  return {
    type: "singleSelect",
    key,
    ariaLabel,
    placeholder,
    selectedKey: params.selectedKey,
    onChange: params.onChange,
    options: params.options,
    iconName,
    className: params.className,
    triggerClassName: params.triggerClassName,
    size: params.size,
    iconSize: params.iconSize,
  };
}

export function createPeriodFilterConfig({
  key = "periodPreset",
  ariaLabel = "Швидкий вибір періоду",
  placeholder = "Оберіть період",
  iconName = "calendar",
  ...params
}: CreatePeriodFilterConfigParams): ReportSingleSelectFilterConfig {
  return {
    type: "singleSelect",
    key,
    ariaLabel,
    placeholder,
    selectedKey: params.selectedKey,
    onChange: params.onChange,
    options: params.options,
    iconName,
    className: params.className,
    triggerClassName: params.triggerClassName,
    size: params.size,
    iconSize: params.iconSize,
  };
}

export function createDateRangeFilterConfig({
  key = "dateRange",
  ...params
}: CreateDateRangeFilterConfigParams): ReportDateRangeFilterConfig {
  return {
    type: "dateRange",
    key,
    value: params.value,
    onChange: params.onChange,
    className: params.className,
    size: params.size,
    inputWrapperClassName: params.inputWrapperClassName,
    maxValue: params.maxValue,
  };
}

export function createSingleDateFilterConfig({
  key = "singleDate",
  ariaLabel = "Вибір дати",
  ...params
}: CreateSingleDateFilterConfigParams): ReportSingleDateFilterConfig {
  return {
    type: "singleDate",
    key,
    ariaLabel,
    value: params.value,
    onChange: params.onChange,
    className: params.className,
    size: params.size,
    triggerClassName: params.triggerClassName,
    previousButtonClassName: params.previousButtonClassName,
    nextButtonClassName: params.nextButtonClassName,
    iconName: params.iconName,
    maxValue: params.maxValue,
  };
}

export function createResetFilterConfig({
  key = "reset",
  ...params
}: CreateResetFilterConfigParams): ReportResetFilterConfig {
  return {
    type: "reset",
    key,
    onPress: params.onPress,
    disabled: params.disabled,
    size: params.size,
    className: params.className,
    iconSize: params.iconSize,
  };
}

export function createActionButtonFilterConfig(
  params: CreateActionButtonFilterConfigParams,
): ReportActionButtonFilterConfig {
  return {
    type: "actionButton",
    key: params.key,
    onPress: params.onPress,
    label: params.label,
    iconName: params.iconName,
    disabled: params.disabled,
    isIconOnly: params.isIconOnly,
    variant: params.variant,
    className: params.className,
    size: params.size,
  };
}

export function createProductToolbarFilterConfigs({
  products,
  selectedProduct,
  onSelectedProductChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  periodPresetKey,
  onPeriodPresetChange,
  periodPresetOptions,
  onReset,
  loading,
  size,
  productClassName,
  productBaseClassName,
  productTriggerClassName,
  statusClassName,
  statusTriggerClassName,
  periodClassName,
  periodTriggerClassName,
  periodIconName,
  resetClassName,
  extraFilters = [],
  includeReset = true,
}: CreateProductToolbarFilterConfigsParams): ReportFilterConfig[] {
  const filters: ReportFilterConfig[] = [
    createProductFilterConfig({
      selectedKey: selectedProduct,
      onChange: onSelectedProductChange,
      products,
      className: productClassName,
      baseClassName: productBaseClassName,
      triggerClassName: productTriggerClassName,
      size,
    }),
    createStatusFilterConfig({
      selectedKey: statusFilter,
      onChange: onStatusFilterChange,
      options: statusOptions,
      className: statusClassName,
      triggerClassName: statusTriggerClassName,
      size,
    }),
    createPeriodFilterConfig({
      selectedKey: periodPresetKey,
      onChange: onPeriodPresetChange,
      options: periodPresetOptions,
      iconName: periodIconName,
      className: periodClassName,
      triggerClassName: periodTriggerClassName,
      size,
    }),
    ...extraFilters,
  ];

  if (includeReset && onReset) {
    filters.push(
      createResetFilterConfig({
        onPress: onReset,
        disabled: loading,
        size,
        className: resetClassName,
      }),
    );
  }

  return filters;
}