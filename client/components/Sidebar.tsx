import logo from "/logo.svg";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { getNavGroups, AppRoute, NavGroup } from "@/routes.config";
import React, { useState } from "react";
import { DynamicIcon } from "lucide-react/dynamic";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps {
  className?: string;
}

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
}

interface SubmenuProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isExpanded: boolean;
  isChildrenActive: boolean;
  onToggle: () => void;
}

function NavItem({ to, icon, label, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
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
      <span className="flex-1 font-inter text-base font-medium leading-[125%]">
        {label}
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
          isChildrenActive ? "bg-neutral-100" : "border-transparent" //isChildrenActive ? "bg-neutral-100" : "hover:bg-neutral-100" 
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

function SubmenuItem({ to, icon, label, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
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
      <span className="flex-1 font-inter text-sm font-medium leading-[125%]">
        {label}
      </span>
    </Link>
  );
}

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  
  const { mainRoutes, subGroups } = getNavGroups(user?.role);

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

  // Розгорнуто лише якщо ключ є в сеті (toggle завжди працює)
  const isGroupExpanded = (group: NavGroup) => {
    return expandedSubmenus.has(group.key);
  };

  const isGroupChildActive = (group: NavGroup) => {
    return group.children.some(r => location.pathname === r.path);
  };

  // Рендер підменю для групи
  const renderSubGroup = (group: NavGroup) => {
    const expanded = isGroupExpanded(group);
    const childActive = isGroupChildActive(group);

    // Якщо є маршрут-батько — перший пункт підменю веде на нього
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
        {/* Якщо є власний маршрут-батько — додаємо його першим пунктом */}
        {group.parentRoute && (
          <SubmenuItem
            to={group.parentRoute.path}
            icon={group.parentRoute.icon}
            label={group.parentRoute.navLabel}
            isActive={location.pathname === group.parentRoute.path}
          />
        )}
        {group.children.map((child) => (
          <SubmenuItem
            key={child.path}
            to={child.path}
            icon={child.icon}
            label={child.navLabel}
            isActive={location.pathname === child.path}
          />
        ))}
      </Submenu>
    );
  };

  return (
    <div className={cn("hidden lg:flex w-[250px] flex-col bg-white border-r border-neutral-200 h-auto self-stretch", className)}>
      <div className="sticky top-0 h-screen overflow-y-auto bg-white scrollbar-hide pb-4">
        <img src={logo} alt="logo" className="p-5" />
        <nav className="flex flex-col items-start gap-1 px-3 py-4 h-auto flex-1">
          {/* Об'єднуємо mainRoutes та групи-контейнери в єдиний відсортований список */}
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
              // Якщо для маршруту є дочірня група — рендеримо як підменю
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
                />
              );
            })
          }
        </nav>
      </div>
    </div>
  );
}
