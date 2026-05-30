import type { ReactElement, ReactNode } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatRelativeDate } from "@/lib";

type ReportRefreshCacheActionsProps = {
  lastCacheUpdate: Date | null;
  loading: boolean;
  cacheLoading: boolean;
  clearStatsCacheLoading?: boolean;
  canManageCache: boolean;
  onRefreshData: () => void;
  onRefreshAllCache: () => void;
  onRefreshPeriodCache: () => void;
  onClearStatsCache?: () => void;
  extraCacheMenuItems?: ReactElement | null;
  trailingActions?: ReactNode;
};

export function ReportRefreshCacheActions({
  lastCacheUpdate,
  loading,
  cacheLoading,
  clearStatsCacheLoading = false,
  canManageCache,
  onRefreshData,
  onRefreshAllCache,
  onRefreshPeriodCache,
  onClearStatsCache,
  extraCacheMenuItems,
  trailingActions,
}: ReportRefreshCacheActionsProps) {
  const disabledKeys = clearStatsCacheLoading ? ["clear-stats-cache"] : [];

  return (
    <div className="flex items-center gap-4">
      <div className="flex gap-1 items-end text-[13px]">
        <DynamicIcon name="database" size={14} className="text-neutral-400" />
        <span className="leading-none">
          Оновлено:{" "}
          <span className="font-medium">
            {lastCacheUpdate
              ? formatRelativeDate(lastCacheUpdate.toISOString()).toLowerCase()
              : "немає даних"}
          </span>
        </span>
      </div>

      <Button onPress={onRefreshData} disabled={loading} size="sm" variant="flat" className="h-8">
        <DynamicIcon name="refresh-cw" size={14} />
        Оновити дані
      </Button>

      {canManageCache && (
        <Dropdown>
          <DropdownTrigger>
            <Button disabled={cacheLoading || clearStatsCacheLoading} size="sm" variant="flat" className="h-8">
              <DynamicIcon name="database" size={14} />
              {cacheLoading ? "Оновлення..." : clearStatsCacheLoading ? "Очищення..." : "Оновити кеш"}
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Опції оновлення кеша" disabledKeys={disabledKeys}>
            <DropdownItem
              key="refresh-all"
              onPress={onRefreshAllCache}
              startContent={<DynamicIcon name="database" size={14} />}
            >
              Оновити всі записи
            </DropdownItem>
            <DropdownItem
              key="refresh-period"
              onPress={onRefreshPeriodCache}
              startContent={<DynamicIcon name="calendar" size={14} />}
            >
              За період
            </DropdownItem>
            {onClearStatsCache && (
              <DropdownItem
                key="clear-stats-cache"
                onPress={onClearStatsCache}
                startContent={<DynamicIcon name="trash-2" size={14} />}
                className="text-danger"
                color="danger"
              >
                Очистити серверний кеш
              </DropdownItem>
            )}
            {extraCacheMenuItems}
          </DropdownMenu>
        </Dropdown>
      )}

      {trailingActions}
    </div>
  );
}