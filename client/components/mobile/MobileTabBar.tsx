import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { getNavGroups } from '@/routes.config';
import { isPathInNavGroup } from '@/components/mobile/resolveMobileNavLabel';
import { MobileGroupDrawer } from '@/components/mobile/MobileGroupDrawer';
import { NavBadgePill } from '@/components/NavBadgePill';
import { cn } from '@/lib/utils';
import type { NavGroup } from '@/routes.config';
import {
  SALESDRIVE_ORDERS_PATH,
  buildNotShippedNavBadge,
  resolveSalesdriveNavTo,
  useNotShippedOrdersCount,
} from '@/hooks/useNotShippedOrdersCount';

interface TabDef {
  id: string;
  label: string;
  icon: Parameters<typeof DynamicIcon>[0]['name'];
  kind: 'link' | 'group' | 'more';
  path?: string;
  groupKey?: string;
  visible: boolean;
}

export function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveRole, effectivePermissions } = useRolePreview();
  const { open: sidebarOpen, toggle } = useSidebar();
  const { mainRoutes, subGroups } = getNavGroups(effectiveRole, effectivePermissions);

  const [groupDrawerKey, setGroupDrawerKey] = useState<'warehouse' | 'reports' | null>(null);

  const warehouseGroup = subGroups.warehouse as NavGroup | undefined;
  const reportsGroup = subGroups.reports as NavGroup | undefined;

  const hasHome = mainRoutes.some((r) => r.path === '/');
  const hasShipment = mainRoutes.some((r) => r.path === SALESDRIVE_ORDERS_PATH);
  const notShippedCount = useNotShippedOrdersCount(hasShipment);
  const notShippedBadge = buildNotShippedNavBadge(notShippedCount);
  const hasWarehouse = Boolean(warehouseGroup?.children?.length);
  const hasReports = Boolean(reportsGroup?.children?.length);

  const tabs: TabDef[] = useMemo(
    () => [
      {
        id: 'home',
        label: 'Головна',
        icon: 'home',
        kind: 'link',
        path: '/',
        visible: hasHome,
      },
      {
        id: 'warehouse',
        label: 'Склад',
        icon: 'warehouse',
        kind: 'group',
        groupKey: 'warehouse',
        visible: hasWarehouse,
      },
      {
        id: 'reports',
        label: 'Звіти',
        icon: 'chart-spline',
        kind: 'group',
        groupKey: 'reports',
        visible: hasReports,
      },
      {
        id: 'shipment',
        label: 'Стан замовлень',
        icon: 'clipboard-check',
        kind: 'link',
        path: SALESDRIVE_ORDERS_PATH,
        visible: hasShipment,
      },
      {
        id: 'more',
        label: 'Більше',
        icon: 'ellipsis',
        kind: 'more',
        visible: true,
      },
    ],
    [hasHome, hasWarehouse, hasReports, hasShipment]
  );

  const visibleTabs = tabs.filter((t) => t.visible);

  const isPrimaryTabPath =
    location.pathname === '/' ||
    location.pathname === SALESDRIVE_ORDERS_PATH ||
    isPathInNavGroup(location.pathname, warehouseGroup) ||
    isPathInNavGroup(location.pathname, reportsGroup);

  const isTabActive = (tab: TabDef): boolean => {
    if (tab.kind === 'link' && tab.path) {
      return location.pathname === tab.path;
    }
    if (tab.kind === 'group' && tab.groupKey === 'warehouse') {
      return isPathInNavGroup(location.pathname, warehouseGroup);
    }
    if (tab.kind === 'group' && tab.groupKey === 'reports') {
      return isPathInNavGroup(location.pathname, reportsGroup);
    }
    if (tab.kind === 'more') {
      return sidebarOpen || !isPrimaryTabPath;
    }
    return false;
  };

  const handlePress = (tab: TabDef) => {
    if (tab.kind === 'link' && tab.path) {
      navigate(tab.id === 'shipment' ? resolveSalesdriveNavTo(notShippedCount) : tab.path);
      return;
    }
    if (tab.kind === 'group' && tab.groupKey === 'warehouse') {
      setGroupDrawerKey('warehouse');
      return;
    }
    if (tab.kind === 'group' && tab.groupKey === 'reports') {
      setGroupDrawerKey('reports');
      return;
    }
    if (tab.kind === 'more') {
      toggle();
    }
  };

  const activeGroup: NavGroup | null =
    groupDrawerKey === 'warehouse'
      ? warehouseGroup ?? null
      : groupDrawerKey === 'reports'
        ? reportsGroup ?? null
        : null;

  return (
    <>
      <nav
        className={cn(
          'lg:hidden fixed bottom-6 left-0 right-0 z-20',
          'rounded-lg ring-1 ring-white bg-white/75 shadow-[0_15px_50px_-12px_theme(colors.gray.400),inset_0_1px_4px_0_theme(colors.white)] backdrop-blur-sm',
          'mx-3'
        )}
        aria-label="Мобільна навігація"
      >
        <div className="flex items-stretch justify-around px-1 pt-1 pb-1 h-[56px]">
          {visibleTabs.map((tab) => {
            const active = isTabActive(tab);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handlePress(tab)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 px-0.5 min-w-0 relative',
                  'transition-colors duration-150',
                  active ? 'text-sky-600' : 'text-neutral-500',
                )}
              >
                <span className="relative">
                  <DynamicIcon
                    name={tab.icon}
                    size={22}
                    strokeWidth={active ? 2 : 1.75}
                  />
                  {tab.id === 'shipment' && notShippedBadge ? (
                    <span className="absolute -top-1.5 -right-2.5">
                      <NavBadgePill badge={notShippedBadge} tooltipPlacement="top" />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'font-inter text-[10px] leading-tight truncate max-w-full',
                    active ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <MobileGroupDrawer
        isOpen={groupDrawerKey !== null}
        onOpenChange={(open) => {
          if (!open) setGroupDrawerKey(null);
        }}
        group={activeGroup}
        activePath={location.pathname}
      />
    </>
  );
}
