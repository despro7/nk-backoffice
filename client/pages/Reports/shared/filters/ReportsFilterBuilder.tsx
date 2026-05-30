import { Button } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import ReportDateRangeFilter from "./ReportDateRangeFilter";
import type { ReportFilterConfig } from "./ReportFilterTypes";
import ReportMultiSelectFilter from "./ReportMultiSelectFilter";
import ReportProductSelectFilter from "./ReportProductSelectFilter";
import ReportResetFiltersButton from "./ReportResetFiltersButton";
import ReportSingleDateFilter from "./ReportSingleDateFilter";
import ReportSingleSelectFilter from "./ReportSingleSelectFilter";

interface ReportsFilterBuilderProps {
  filters: ReportFilterConfig[];
  className?: string;
}

export default function ReportsFilterBuilder({
  filters,
  className = "flex flex-wrap gap-4 items-end",
}: ReportsFilterBuilderProps) {
  return (
    <div className={className}>
      {filters.map((filter) => {
        switch (filter.type) {
          case "singleSelect":
            return (
              <ReportSingleSelectFilter
                key={filter.key}
                ariaLabel={filter.ariaLabel}
                placeholder={filter.placeholder}
                selectedKey={filter.selectedKey}
                onChange={filter.onChange}
                options={filter.options}
                iconName={filter.iconName}
                className={filter.className}
                triggerClassName={filter.triggerClassName}
                iconSize={filter.iconSize}
                size={filter.size}
              />
            );

          case "multiSelect":
            return (
              <ReportMultiSelectFilter
                key={filter.key}
                ariaLabel={filter.ariaLabel}
                placeholder={filter.placeholder}
                selectedKeys={filter.selectedKeys}
                onChange={filter.onChange}
                options={filter.options}
                iconName={filter.iconName}
                className={filter.className}
                baseClassName={filter.baseClassName}
                triggerClassName={filter.triggerClassName}
                iconSize={filter.iconSize}
                size={filter.size}
              />
            );

          case "productSelect":
            return (
              <ReportProductSelectFilter
                key={filter.key}
                ariaLabel={filter.ariaLabel}
                placeholder={filter.placeholder}
                selectedKey={filter.selectedKey}
                onChange={filter.onChange}
                products={filter.products}
                className={filter.className}
                baseClassName={filter.baseClassName}
                triggerClassName={filter.triggerClassName}
                iconSize={filter.iconSize}
                size={filter.size}
              />
            );

          case "dateRange":
            return (
              <ReportDateRangeFilter
                key={filter.key}
                value={filter.value}
                onChange={filter.onChange}
                className={filter.className}
                size={filter.size}
                inputWrapperClassName={filter.inputWrapperClassName}
                maxValue={filter.maxValue}
              />
            );

          case "singleDate":
            return (
              <ReportSingleDateFilter
                key={filter.key}
                ariaLabel={filter.ariaLabel}
                value={filter.value}
                onChange={filter.onChange}
                className={filter.className}
                size={filter.size}
                triggerClassName={filter.triggerClassName}
                previousButtonClassName={filter.previousButtonClassName}
                nextButtonClassName={filter.nextButtonClassName}
                iconName={filter.iconName}
                maxValue={filter.maxValue}
              />
            );

          case "actionButton":
            return (
              <Button
                key={filter.key}
                onPress={filter.onPress}
                disabled={filter.disabled}
                size={filter.size}
                variant={filter.variant ?? "flat"}
                isIconOnly={filter.isIconOnly}
                className={filter.className}
                startContent={filter.iconName ? <DynamicIcon name={filter.iconName} size={18} className="shrink-0" /> : undefined}
              >
                {filter.label}
              </Button>
            );

          case "reset":
            return (
              <ReportResetFiltersButton
                key={filter.key}
                onPress={filter.onPress}
                disabled={filter.disabled}
                size={filter.size}
                className={filter.className}
                iconSize={filter.iconSize}
              />
            );

          case "custom":
            return (
              <div key={filter.key} className={filter.className}>
                {filter.render()}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
