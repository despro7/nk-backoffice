import logo from "/logo.svg";
import favicon from "/favicon.svg";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import {
  getNavGroups,
  NavGroup,
  NavBadge,
  NavBadgeColor,
  isNavBadgeVisible,
} from "@/routes.config";
import React, { useState } from "react";
import { DynamicIcon } from "lucide-react/dynamic";
import { useSidebar } from "@/contexts/SidebarContext";
import { SidebarAdminFooter } from "@/components/SidebarAdminFooter";
import { useRolePreview } from "@/contexts/RolePreviewContext";

interface SidebarProps {
  className?: string;
}

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  badge?: NavBadge | null;
  onNavigate?: () => void;
}

interface SubmenuProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isExpanded: boolean;
  isChildrenActive: boolean;
  onToggle: () => void;
}

const NAV_BADGE_COLOR_CLASS: Record<NavBadgeColor, string> = {
  danger: 'bg-danger text-danger-foreground',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  default: 'bg-default-500 text-white',
};

function NavBadgePill({ badge }: { badge: NavBadge }) {
  if (!isNavBadgeVisible(badge)) return null;
  const color = badge.color ?? 'danger';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide leading-none',
        NAV_BADGE_COLOR_CLASS[color] ?? NAV_BADGE_COLOR_CLASS.danger
      )}
    >
      {badge.label}
    </span>
  );
}

function NavItem({ to, icon, label, isActive, badge, onNavigate }: NavItemProps) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 px-2.5 py-3 w-full rounded-md cursor-pointer transition-all duration-300 ease-in-out",
        "hover:bg-neutral-100 text-neutral-600 hover:text-neutral-700",
        isActive 
          ? "bg-neutral-200/70 text-neutral-600" 
          : "hover:bg-neutral-100 text-neutral-600 hover:text-neutral-700"
      )}
    >
      <div className="w-5 h-5">
        {icon}
      </div>
      <span className="flex-1 font-inter text-base font-medium leading-[125%] flex items-center gap-1.5">
        {label}
        {badge ? <NavBadgePill badge={badge} /> : null}
      </span>
    </Link>
  );
}

function Submenu({ label, icon, children, isExpanded, isChildrenActive, onToggle }: SubmenuProps) {
  return (
    <div className="w-full relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 px-2.5 py-3 w-full rounded-md cursor-pointer transition-colors duration-300 ease-in-out relative z-10",
          "text-neutral-600 hover:text-neutral-700 hover:bg-neutral-100",
          isChildrenActive ? "bg-neutral-100" : "border-transparent"
        )}
      >
        <div className="w-5 h-5">
          {icon}
        </div>
        <span className="flex-1 font-inter text-base font-medium leading-[125%] text-left">
          {label}
        </span>
        <DynamicIcon 
          name="chevron-right" 
          size={16} 
          className={cn(
            "transition-transform duration-300 ease-in-out",
            isExpanded && "rotate-90"
          )}
        />
      </button>
      
      <div 
        className={cn(
          "transition-all duration-300 ease-in-out w-full px-5",
          isExpanded
            ? `max-h-dvh opacity-100`
            : "max-h-0 opacity-0 overflow-hidden"
        )}
      >
        <div className={cn(
          "p-2 pb-0 space-y-1 transition-transform duration-300 ease-in-out border-l-1",
          isExpanded ? "translate-y-0" : "-translate-y-2"
        )}>
          {children}
        </div>
      </div>
    </div>
  );
}

function SubmenuItem({ to, icon, label, isActive, badge, onNavigate }: NavItemProps) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 w-full rounded-sm cursor-pointer transition-colors duration-300 ease-in-out",
        isActive 
          ? "bg-neutral-100 text-neutral-600" 
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-600"
      )}
    >
      <div className="w-4 h-4 transition-colors duration-300 hidden">
        {icon}
      </div>
      <span className="flex-1 font-inter text-sm font-medium leading-[125%] flex items-center gap-1.5">
        {label}
        {badge ? <NavBadgePill badge={badge} /> : null}
      </span>
    </Link>
  );
}

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation();
  const { effectiveRole } = useRolePreview();
  const { open, isMobile, setOpen } = useSidebar();
  
  const { mainRoutes, subGroups } = getNavGroups(effectiveRole);

  const handleNavigate = () => {
    if (isMobile) {
      setOpen(false);
    }
  };

  // Ініціалізуємо сет із ключами груп, де є активний дочірній маршрут
  const [expandedSubmenus, setExpandedSubmenus] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const group of Object.values(subGroups)) {
      const hasActiveChild =
        group.children.some(r => location.pathname === r.path) ||
        (group.parentRoute && location.pathname === group.parentRoute.path);
      if (hasActiveChild) initial.add(group.key);
    }
    return initial;
  });

  const toggleSubmenu = (key: string) => {
    setExpandedSubmenus(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const isGroupExpanded = (group: NavGroup) => {
    return expandedSubmenus.has(group.key);
  };

  const isGroupChildActive = (group: NavGroup) => {
    return group.children.some(r => location.pathname === r.path);
  };

  const renderSubGroup = (group: NavGroup) => {
    const expanded = isGroupExpanded(group);
    const childActive = isGroupChildActive(group);

    const label = group.parentRoute?.navLabel ?? group.groupMeta?.label ?? group.key;
    const icon = group.parentRoute?.icon ?? group.groupMeta?.icon ?? null;

    return (
      <Submenu
        key={group.key}
        label={label}
        icon={icon}
        isExpanded={expanded}
        isChildrenActive={childActive}
        onToggle={() => toggleSubmenu(group.key)}
      >
        {group.parentRoute && (
          <SubmenuItem
            to={group.parentRoute.path}
            icon={group.parentRoute.icon}
            label={group.parentRoute.navLabel}
            isActive={location.pathname === group.parentRoute.path}
            badge={group.parentRoute.navBadge}
            onNavigate={handleNavigate}
          />
        )}
        {group.children.map((child) => (
          <SubmenuItem
            key={child.path}
            to={child.path}
            icon={child.icon}
            label={child.navLabel}
            isActive={location.pathname === child.path}
            badge={child.navBadge}
            onNavigate={handleNavigate}
          />
        ))}
      </Submenu>
    );
  };

  const brandHeader = (
    <div className="flex items-center gap-1.5 px-4 py-4 select-none shrink-0">
      <img src={favicon} alt="favicon" className="w-8 h-8" />
      <div className="flex items-end gap-1 font-[Nunito] text-2xl font-bold text-slate-600 leading-none">
        <span>Backoffice</span>
        <div className="text-sm text-slate-400/80 bg-gray-100 px-1.5 py-1 rounded leading-none">2.0</div>
      </div>
    </div>
  );

  const nav = (
    <nav className="flex flex-col items-start gap-1 px-3 py-4">
      {[
        ...mainRoutes.map(route => ({ type: 'route' as const, order: route.order ?? 0, route })),
        ...Object.values(subGroups)
          .filter(group => !group.parentRoute)
          .map(group => ({ type: 'group' as const, order: group.order, group })),
      ]
        .sort((a, b) => a.order - b.order)
        .map(item => {
          if (item.type === 'group') {
            return renderSubGroup(item.group);
          }
          const group = subGroups[item.route.path.replace(/^\//, '')];
          if (group) {
            return renderSubGroup(group);
          }
          return (
            <NavItem
              key={item.route.path}
              to={item.route.path}
              icon={item.route.icon}
              label={item.route.navLabel}
              isActive={location.pathname === item.route.path}
              badge={item.route.navBadge}
              onNavigate={handleNavigate}
            />
          );
        })
      }
    </nav>
  );

  const footer = <SidebarAdminFooter />;

  // Mobile: fixed overlay + backdrop
  if (isMobile) {
    return (
      <>
        <div
          aria-hidden={!open}
          className={cn(
            'fixed inset-0 z-[70] bg-black/40 transition-opacity duration-300 lg:hidden',
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-[70] w-[280px] max-w-[85vw] flex flex-col bg-white border-r border-neutral-200',
            'transition-transform duration-300 ease-in-out lg:hidden',
            open ? 'translate-x-0' : '-translate-x-full',
            className
          )}
        >
          {brandHeader}
          <div className="flex-1 min-h-0 overflow-y-auto bg-white scrollbar-hide">
            {nav}
          </div>
          {footer}
        </aside>
      </>
    );
  }

  // Desktop: wrapper закріплений у в'юпорті, скрол лише в навігації
  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col bg-white border-r border-neutral-200 self-start shrink-0',
        'sticky top-0 h-screen overflow-hidden transition-[width] duration-300 ease-in-out',
        open ? 'w-[250px]' : 'w-0 border-r-0',
        className
      )}
    >
      <div
        className={cn(
          'h-full bg-white flex flex-col',
          'w-[250px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {brandHeader}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          {nav}
        </div>
        {footer}
      </div>
    </aside>
  );
}
