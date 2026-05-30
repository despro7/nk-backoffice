import { useCallback, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { getValueColor } from "@/lib/utils";
import { ReportCacheProgressCard } from "../../shared/ReportCacheProgressCard";
import { ReportLoadingOverlay } from "../../shared/ReportLoadingOverlay";
import { ReportRefreshCacheActions } from "../../shared/ReportRefreshCacheActions";
import { ReportTableEmptyState } from "../../shared/ReportTableEmptyState";
import type { SalesSetReportData, SalesSetsReportTableProps, SalesSortDescriptor } from "../ReportsSalesTypes";
import { SalesReportTableFilters } from "./SalesReportTableFilters";
import useReportsSalesSetsData, {
  CachePeriodSelectModal,
  CacheRefreshConfirmModal,
} from "../useReportsSalesSetsData";

export default function SalesSetsReportTable({ className }: SalesSetsReportTableProps) {
  const [colored, setColored] = useState(true);
  const { isAdmin } = useRoleAccess();
  const [sortDescriptor, setSortDescriptor] = useState<SalesSortDescriptor>({
    column: "ordersCount",
    direction: "descending",
  });

  const handleSortChange = useCallback((descriptor: SalesSortDescriptor) => {
    setSortDescriptor((current) => {
      if (current.column === descriptor.column && current.direction === descriptor.direction) {
        return current;
      }

      return descriptor;
    });
  }, []);

  const {
    cacheLoading,
    cacheModals,
    cacheProgress,
    clearStatsCacheLoading,
    datePresetKey,
    datePresets,
    dateRange,
    extraFilters,
    filteredSetsData,
    handleClearStatsCache,
    handleRefreshAllCache,
    handleRefreshData,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    loading,
    resetFilters,
    setDatePresetKey,
    setDateRange,
    setExtraFilters,
    setStatusFilter,
    statusFilter,
    totals,
  } = useReportsSalesSetsData();

  const ordersCountValues = useMemo(
    () => filteredSetsData.map((item) => item.ordersCount),
    [filteredSetsData],
  );

  const sortedItems = useMemo(() => {
    const items = [...filteredSetsData];
    items.sort((first, second) => {
      let cmp = 0;

      switch (sortDescriptor.column) {
        case "name":
          cmp = first.name.localeCompare(second.name, "uk-UA");
          break;
        case "sku":
          cmp = first.sku.localeCompare(second.sku, "uk-UA");
          break;
        case "ordersCount":
          cmp = first.ordersCount - second.ordersCount;
          break;
        case "sourceWebsite":
          cmp = (first.ordersBySource["nk-food.shop"] || 0) - (second.ordersBySource["nk-food.shop"] || 0);
          break;
        case "sourceRozetka":
          cmp = (first.ordersBySource.rozetka || 0) - (second.ordersBySource.rozetka || 0);
          break;
        case "sourceProm":
          cmp = (first.ordersBySource["prom.ua"] || 0) - (second.ordersBySource["prom.ua"] || 0);
          break;
        case "sourceChat":
          cmp = ((first.ordersBySource["інше"] || 0) + (first.ordersBySource["Інше"] || 0))
            - ((second.ordersBySource["інше"] || 0) + (second.ordersBySource["Інше"] || 0));
          break;
        case "discountReason":
          cmp = first.ordersWithDiscountReason - second.ordersWithDiscountReason;
          break;
        default:
          cmp = 0;
      }

      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });

    return items;
  }, [filteredSetsData, sortDescriptor]);

  const columns = [
    { key: "name", label: "Назва набору", sortable: true, className: "w-8/12" },
    { key: "sku", label: "SKU", sortable: true, className: "w-2/12" },
    { key: "ordersCount", label: "Замовлення", sortable: true, className: "w-2/12 text-center" },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <SalesReportTableFilters
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        datePresetKey={datePresetKey}
        datePresets={datePresets}
        onDatePresetChange={(presetKey) => {
          setDatePresetKey(presetKey);
          if (presetKey) {
            const preset = datePresets.find((item) => item.key === presetKey);
            if (preset) {
              setDateRange(preset.getRange());
            }
          }
        }}
        dateRange={dateRange}
        onDateRangeChange={(value) => {
          setDateRange(value);
          setDatePresetKey(null);
        }}
        extraFilters={extraFilters}
        onExtraFiltersChange={setExtraFilters}
        colored={colored}
        onColoredToggle={() => setColored((prev) => !prev)}
        loading={loading}
        onReset={resetFilters}
        showExtraFilters={false}
      />

      <ReportCacheProgressCard progress={cacheProgress} />

      <div className="relative">
        <Table
          key={String(colored)}
          aria-label="Звіт продажів по наборах"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) => handleSortChange(descriptor as SalesSortDescriptor)}
          classNames={{
            wrapper: "min-h-80 p-0 pb-1 shadow-none bg-transparent rounded-none",
            th: ["first:rounded-s-md", "last:rounded-e-md"],
          }}
        >
          <TableHeader>
            {columns.map((column) => (
              <TableColumn
                key={column.key}
                allowsSorting={column.sortable}
                className={`${column.className} text-sm`}
              >
                {column.label}
              </TableColumn>
            ))}
          </TableHeader>
          <TableBody
            items={sortedItems}
            emptyContent={<ReportTableEmptyState loading={loading} emptyIconName="package-2" />}
            isLoading={loading}
          >
            {(item) => {
              const setItem = item as SalesSetReportData;
              const ordersCountColor = colored ? getValueColor(setItem.ordersCount, ordersCountValues) : null;

              return (
                <TableRow key={setItem.sku} className="hover:bg-default-100/70 group/tr transition-colors duration-200">
                  <TableCell className="font-medium text-[15px]">{setItem.name}</TableCell>
                  <TableCell className="font-mono text-sm">{setItem.sku}</TableCell>
                  <TableCell className="text-center text-sm font-medium">
                    <span className={ordersCountColor ? `${ordersCountColor.base} ${ordersCountColor.content} rounded-lg px-2 py-1 inline-flex min-w-[44px] justify-center` : ""}>
                      {setItem.ordersCount}
                    </span>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>

        {filteredSetsData.length > 0 && (
          <div className="border-t-1 border-gray-200 py-2">
            <div className="flex items-center justify-between text-center font-bold text-sm text-gray-800">
              <div className="w-8/12"></div>
              <div className="w-2/12"></div>
							<div className="w-2/12">{totals.ordersCount}</div>
              {/* <div className="w-2/12">{totals.sourceWebsite}</div> */}
              {/* <div className="w-2/12">{totals.sourceRozetka}</div> */}
              {/* <div className="w-2/12">{totals.sourceProm}</div> */}
              {/* <div className="w-2/12">{totals.sourceChat}</div> */}
              {/* <div className="w-2/12">{totals.discountReason}</div> */}
            </div>
          </div>
        )}

        <ReportLoadingOverlay loading={loading} />
      </div>

      <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
        <div className="font-bold">{filteredSetsData.length > 0 ? `Наборів у звіті: ${filteredSetsData.length}` : "Немає даних"}</div>
        <div className="flex items-center gap-4">
          <ReportRefreshCacheActions
            lastCacheUpdate={lastCacheUpdate}
            loading={loading}
            cacheLoading={cacheLoading}
            clearStatsCacheLoading={clearStatsCacheLoading}
            canManageCache={isAdmin()}
            onRefreshData={handleRefreshData}
            onRefreshAllCache={handleRefreshAllCache}
            onRefreshPeriodCache={handleRefreshPeriodCache}
            onClearStatsCache={handleClearStatsCache}
          />
          <CacheRefreshConfirmModal {...cacheModals.confirmModalProps} />
          <CachePeriodSelectModal {...cacheModals.periodModalProps} cacheLoading={cacheLoading} />
        </div>
      </div>
    </div>
  );
}