import { useCallback, useMemo, useState } from "react";
import { Table, TableHeader, TableBody, TableColumn } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useExportFunctions } from "@/hooks/useExportFunctions";
import { ReportCacheProgressCard } from "../../shared/ReportCacheProgressCard";
import { ReportLoadingOverlay } from "../../shared/ReportLoadingOverlay";
import { ReportTableEmptyState } from "../../shared/ReportTableEmptyState";
import type { SalesData, SalesReportTableProps, SalesSortDescriptor } from "../ReportsSalesTypes";
import { SalesDateDetailsModal } from "./SalesDateDetailsModal";
import { SalesReportTableFooter } from "./SalesReportTableFooter";
import { SalesReportTableFilters } from "./SalesReportTableFilters";
import { renderSalesReportTableRow } from "./SalesReportTableRow";
import { SalesReportTableTotalsRow } from "./SalesReportTableTotalsRow";
import useReportsSalesTableData, {
  CachePeriodSelectModal,
  CacheRefreshConfirmModal,
} from "../useReportsSalesTableData";
import { useSalesReportTableMetrics } from "../useSalesReportTableMetrics";

export default function SalesReportTable({ className }: SalesReportTableProps) {
  // Кольорове форматування таблиці
  const [colored, setColored] = useState(true);
  const { isAdmin } = useRoleAccess();
  const [sortDescriptor, setSortDescriptor] = useState<SalesSortDescriptor>({
    column: "date",
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

  // Модальне вікно з деталями
  const [selectedDateDetails, setSelectedDateDetails] = useState<SalesData | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const {
    cacheLoading,
    cacheModals,
    cacheProgress,
    clearStatsCacheLoading,
    datePresetKey,
    datePresets,
    dateRange,
    extraFilters,
    filteredSalesData,
    handleClearStatsCache,
    handleRefreshAllCache,
    handleRefreshData,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    loading,
    resetFilters,
    salesData,
    selectedProducts,
    setDatePresetKey,
    setDateRange,
    setExtraFilters,
    setSelectedProducts,
    setStatusFilter,
    statusFilter,
    totals,
  } = useReportsSalesTableData();

  // Використовуємо хук для функцій експорту
  const { exportToExcel, exportToTXT } = useExportFunctions({
    filteredSalesData,
    dateRange,
  });

  // Сортування даних
  const sortedItems = useMemo(() => {
    const items = [...filteredSalesData];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortDescriptor.column === "date") {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortDescriptor.column === "ordersCount") {
        cmp = a.ordersCount - b.ordersCount;
      } else if (sortDescriptor.column === "portionsCount") {
        cmp = a.portionsCount - b.portionsCount;
      } else if (sortDescriptor.column === "totalPrice") {
        cmp = a.totalPrice - b.totalPrice;
      }
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });
    return items;
  }, [filteredSalesData, sortDescriptor]);

  // Обробник відкриття модального вікна з деталями
  const handleOpenDetails = (dateData: SalesData) => {
    setSelectedDateDetails(dateData);
    setIsDetailsModalOpen(true);
  };

  const rowMetrics = useSalesReportTableMetrics(filteredSalesData);

  const columns = [
    { key: "date", label: "Дата", sortable: true, className: "w-3/19" },
    {
      key: "ordersCount",
      label: "Замовл.",
      sortable: true,
      className: "w-2/19 text-center",
    },
    {
      key: "portionsCount",
      label: "Порції",
      sortable: true,
      className: "w-2/19 text-center",
    },
    {
      key: "totalPrice",
      label: "Сума, ₴",
      sortable: true,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceWebsite",
      label: "Сайт",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceRozetka",
      label: "Розетка",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceProm",
      label: "Пром",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "sourceChat",
      label: "Інше",
      sortable: false,
      className: "w-2/19 text-center",
    },
    {
      key: "discountReason",
      label: "Зі знижкою",
      sortable: false,
      className: "w-2/19 text-center",
    },
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
      />

      <ReportCacheProgressCard progress={cacheProgress} />

      {/* Таблиця */}
      <div className="relative">
        <Table
          key={String(colored)}
          aria-label="Звіт продажів"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) => {
            handleSortChange(descriptor as SalesSortDescriptor);
          }}
          classNames={{
            wrapper: "min-h-80 p-0 pb-1 shadow-none bg-transparent rounded-none",
            th: "bg-default-200/60 first:rounded-s-sm last:rounded-e-sm",
            td: [
              "py-2 text-default-700 cursor-pointer",
              "[&>*]:z-1 [&>*]:relative",
              "before:pointer-events-none before:content-[''] before:absolute before:z-0 before:inset-0 before:opacity-0 before:bg-default/40",
              "group-hover/tr:before:opacity-40",
              "first:before:rounded-s-sm last:before:rounded-e-sm",
            ],
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
            emptyContent={
              <ReportTableEmptyState
                loading={loading}
                emptyIconName="bar-chart-3"
              />
            }
            isLoading={loading}
          >
            {(item) => (
              renderSalesReportTableRow({
                item,
                colored,
                metrics: rowMetrics,
                onOpenDetails: handleOpenDetails,
              })
            )}
          </TableBody>
        </Table>

        <SalesReportTableTotalsRow
          totals={totals}
          visible={filteredSalesData.length > 0}
        />

        {/* Напівпрозорий бекдроп лоадера з анімацією */}
        <ReportLoadingOverlay loading={loading} />
      </div>

        <SalesReportTableFooter
          salesDaysCount={salesData.length}
          lastCacheUpdate={lastCacheUpdate}
          loading={loading}
          cacheLoading={cacheLoading}
          clearStatsCacheLoading={clearStatsCacheLoading}
          canManageCache={isAdmin()}
          onRefreshData={handleRefreshData}
          onRefreshAllCache={handleRefreshAllCache}
          onRefreshPeriodCache={handleRefreshPeriodCache}
          onClearStatsCache={handleClearStatsCache}
          onExportToExcel={exportToExcel}
          onExportToTxt={exportToTXT}
        />

        {/* Модальне вікно деталей по даті */}
        <SalesDateDetailsModal
          isOpen={isDetailsModalOpen}
          onOpenChange={setIsDetailsModalOpen}
          details={selectedDateDetails}
        />

        {/* Модальне вікно підтвердження та вибору періоду для оновлення кеша */}
        <CacheRefreshConfirmModal {...cacheModals.confirmModalProps} />
        <CachePeriodSelectModal
          {...cacheModals.periodModalProps}
          cacheLoading={cacheLoading}
        />
    </div>
  );
}
