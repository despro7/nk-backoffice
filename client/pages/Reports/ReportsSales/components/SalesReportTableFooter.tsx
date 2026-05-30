import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { ReportRefreshCacheActions } from "../../shared/ReportRefreshCacheActions";

interface SalesReportTableFooterProps {
  salesDaysCount: number;
  lastCacheUpdate: Date | null;
  loading: boolean;
  cacheLoading: boolean;
  clearStatsCacheLoading: boolean;
  canManageCache: boolean;
  onRefreshData: () => void;
  onRefreshAllCache: () => void;
  onRefreshPeriodCache: () => void;
  onClearStatsCache: () => void;
  onExportToExcel: () => void;
  onExportToTxt: () => void;
}

export function SalesReportTableFooter({
  salesDaysCount,
  lastCacheUpdate,
  loading,
  cacheLoading,
  clearStatsCacheLoading,
  canManageCache,
  onRefreshData,
  onRefreshAllCache,
  onRefreshPeriodCache,
  onClearStatsCache,
  onExportToExcel,
  onExportToTxt,
}: SalesReportTableFooterProps) {
  return (
    <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
      <div className="flex items-center gap-4">
        <span className="font-medium">
          Звіт: {salesDaysCount > 0 ? `${salesDaysCount} днів` : "Немає даних"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ReportRefreshCacheActions
          lastCacheUpdate={lastCacheUpdate}
          loading={loading}
          cacheLoading={cacheLoading}
          clearStatsCacheLoading={clearStatsCacheLoading}
          canManageCache={canManageCache}
          onRefreshData={onRefreshData}
          onRefreshAllCache={onRefreshAllCache}
          onRefreshPeriodCache={onRefreshPeriodCache}
          onClearStatsCache={onClearStatsCache}
          trailingActions={
            <Dropdown>
              <DropdownTrigger>
                <Button size="sm" variant="flat" className="h-8">
                  <DynamicIcon name="download" size={14} />
                  Експорт
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Опції експорту">
                <DropdownItem
                  key="export-excel"
                  onPress={onExportToExcel}
                  startContent={<DynamicIcon name="file-spreadsheet" size={14} />}
                >
                  Експорт в Excel
                </DropdownItem>
                <DropdownItem
                  key="export-txt"
                  onPress={onExportToTxt}
                  startContent={<DynamicIcon name="file" size={14} />}
                >
                  Експорт в TXT
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          }
        />
      </div>
    </div>
  );
}