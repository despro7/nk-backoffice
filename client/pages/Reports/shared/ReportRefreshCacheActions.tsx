import type { ReactElement, ReactNode } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
} from "@heroui/react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { formatRelativeDate } from "@/lib";
import { useIsMobile } from "@/hooks/useTouchUi";

/** Додаткова дія для компактного меню (на телефоні `trailingActions` замінюється цими пунктами). */
export type ReportMenuAction = {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
};

export type ReportMenuSection = {
  key: string;
  title: string;
  actions: ReportMenuAction[];
};

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
  /** Додаткові розділи компактного меню на телефоні (напр. «Експорт», «Вигляд»). */
  compactMenuSections?: ReportMenuSection[];
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
  compactMenuSections = [],
}: ReportRefreshCacheActionsProps) {
  const isMobile = useIsMobile();
  const disabledKeys = clearStatsCacheLoading ? ["clear-stats-cache"] : [];
  const lastUpdateLabel = lastCacheUpdate
    ? formatRelativeDate(lastCacheUpdate.toISOString()).toLowerCase()
    : "немає даних";

  if (isMobile) {
    const extraSections = compactMenuSections.filter((section) => section.actions.length > 0);
    // На телефоні всі дії в одному меню за іконкою, щоб кнопки не займали пів екрана
    const isBusy = loading || cacheLoading || clearStatsCacheLoading;
    const compactDisabledKeys = [
      ...(loading ? ["refresh-data"] : []),
      ...(cacheLoading || clearStatsCacheLoading ? ["refresh-all", "refresh-period", "clear-stats-cache"] : []),
    ];

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-default-500">
          <DynamicIcon name="database" size={12} className="text-neutral-400" />
          <span>{lastUpdateLabel}</span>
        </div>
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button isIconOnly size="sm" variant="flat" className="h-8 w-8 min-w-8" aria-label="Дії звіту">
              <DynamicIcon
                name={isBusy ? "loader-2" : "ellipsis-vertical"}
                size={16}
                className={isBusy ? "animate-spin" : undefined}
              />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Дії звіту" disabledKeys={compactDisabledKeys}>
            {[
              <DropdownSection key="data" title="Дані" showDivider={canManageCache || extraSections.length > 0}>
                <DropdownItem
                  key="refresh-data"
                  onPress={onRefreshData}
                  startContent={<DynamicIcon name="refresh-cw" size={14} />}
                >
                  Оновити дані
                </DropdownItem>
              </DropdownSection>,
              ...(canManageCache ? [
                <DropdownSection key="cache" title="Кеш" showDivider={extraSections.length > 0}>
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
                    Оновити за період
                  </DropdownItem>
                  {onClearStatsCache ? (
                    <DropdownItem
                      key="clear-stats-cache"
                      onPress={onClearStatsCache}
                      startContent={<DynamicIcon name="trash-2" size={14} />}
                      className="text-danger"
                      color="danger"
                    >
                      Очистити серверний кеш
                    </DropdownItem>
                  ) : null}
                  {extraCacheMenuItems ?? null}
                </DropdownSection>,
              ] : []),
              // Один масив розділів: HeroUI-колекція не приймає вкладені масиви серед дітей
              ...extraSections.map((section, index) => (
                <DropdownSection
                  key={section.key}
                  title={section.title}
                  showDivider={index < extraSections.length - 1}
                >
                  {section.actions.map((action) => (
                    <DropdownItem
                      key={action.key}
                      onPress={action.onPress}
                      startContent={<DynamicIcon name={action.icon} size={14} />}
                    >
                      {action.label}
                    </DropdownItem>
                  ))}
                </DropdownSection>
              )),
            ]}
          </DropdownMenu>
        </Dropdown>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-x-4 gap-y-2">
      <div className="flex gap-1 items-end text-[13px] mb-2 sm:mb-0">
        <DynamicIcon name="database" size={14} className="text-neutral-400" />
        <span className="leading-none">
          Оновлено:{" "}
          <span className="font-medium">
            {lastUpdateLabel}
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