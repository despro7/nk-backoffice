import { useMemo, type ReactNode } from "react";
import type { IconName } from "lucide-react/dynamic";
import type { ReportFilterConfig, ReportFilterOption } from "./ReportFilterTypes";
import { createProductToolbarFilterConfigs } from "./ReportFilterPresets";
import ReportsFilterBuilder from "./ReportsFilterBuilder";

type ProductFilterProduct = {
  sku: string;
  name: string;
};

type ReportProductFiltersToolbarProps = {
  products: ProductFilterProduct[];
  selectedProduct: string | null;
  onSelectedProductChange: (key: string | null) => void;
  statusFilter: string | null;
  onStatusFilterChange: (key: string | null) => void;
  statusOptions: ReportFilterOption[];
  periodPresetKey: string | null;
  onPeriodPresetChange: (key: string | null) => void;
  periodPresetOptions: ReportFilterOption[];
  onReset: () => void;
  loading: boolean;
  children?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  productClassName?: string;
  productBaseClassName?: string;
  productTriggerClassName?: string;
  statusClassName?: string;
  statusTriggerClassName?: string;
  periodClassName?: string;
  periodTriggerClassName?: string;
  periodIconName?: IconName;
  resetClassName?: string;
};

export default function ReportProductFiltersToolbar({
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
  children,
  className = "flex gap-4 items-end",
  size = "md",
  productClassName,
  productBaseClassName,
  productTriggerClassName,
  statusClassName,
  statusTriggerClassName,
  periodClassName,
  periodTriggerClassName,
  periodIconName = "calendar",
  resetClassName,
}: ReportProductFiltersToolbarProps) {
  const filters = useMemo<ReportFilterConfig[]>(() => createProductToolbarFilterConfigs({
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
    extraFilters: children
      ? [{ type: "custom", key: "children", render: () => children }]
      : [],
  }), [
    children,
    loading,
    onPeriodPresetChange,
    onReset,
    onSelectedProductChange,
    onStatusFilterChange,
    periodClassName,
    periodIconName,
    periodPresetKey,
    periodPresetOptions,
    periodTriggerClassName,
    productBaseClassName,
    productClassName,
    productTriggerClassName,
    products,
    resetClassName,
    selectedProduct,
    size,
    statusClassName,
    statusFilter,
    statusOptions,
    statusTriggerClassName,
  ]);

  return (
    <ReportsFilterBuilder filters={filters} className={className} />
  );
}