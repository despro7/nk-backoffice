import logo from "/logo.svg";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { getNavGroups, AppRoute } from "@/routes.config";
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
  isChildrenActive: boolean; // Новое состояние
  onToggle: () => void;
}

function NavItem({ to, icon, label, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-3.5 py-4 w-full rounded-md cursor-pointer transition-all duration-300 ease-in-out",
        isActive 
          ? "bg-neutral-200 text-neutral-700" 
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
          "flex items-center gap-2 px-3.5 py-4 w-full rounded-md cursor-pointer transition-colors duration-300 ease-in-out relative z-10 text-neutral-600 hover:text-neutral-700",
          isExpanded && isChildrenActive ? "bg-neutral-200" : isChildrenActive ? "bg-neutral-100" : "hover:bg-neutral-100" 
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
      
      {/* Submenu всегда рендерится, но скрывается/показывается с анимацией */}
      <div 
        className={cn(
          "transition-all duration-300 ease-in-out rounded-lg absolute top-0 left-0 w-full",
          isExpanded
            ? `max-h-96 opacity-100 bg-neutral-100${isChildrenActive ? " bg-neutral-100" : ""}`
            : "max-h-0 opacity-0 overflow-hidden"
        )}
      >
        <div className={cn(
          "pt-15 pb-2 px-2 space-y-1 transition-transform duration-300 ease-in-out",
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
        "flex items-center gap-2 px-3 py-2.5 w-full rounded-md cursor-pointer transition-colors duration-300 ease-in-out",
        isActive 
          ? "bg-neutral-200 text-neutral-700 shadow-inner-sm" 
          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-600"
      )}
    >
      <div className="w-4 h-4 transition-colors duration-300">
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
  const [expandedSubmenus, setExpandedSubmenus] = useState<Set<string>>(new Set());
  
  // Получаем маршруты с учетом роли пользователя
  const { mainRoutes, settingsRoutes } = getNavGroups(user?.role);

  const toggleSubmenu = (submenuKey: string) => {
    const newExpanded = new Set(expandedSubmenus);
    if (newExpanded.has(submenuKey)) {
      newExpanded.delete(submenuKey);
    } else {
      newExpanded.add(submenuKey);
    }
    setExpandedSubmenus(newExpanded);
  };

  // Универсальная функция для проверки активных дочерних элементов любого родительского раздела
  const getActiveChildrenForParent = (parentKey: string, routes: AppRoute[]) => {
    return routes.some(route => route.parent === parentKey && location.pathname === route.path);
  };

  // Универсальная функция для определения состояния expanded любого submenu
  const isSubmenuExpanded = (parentKey: string, routes: AppRoute[]) => {
    const hasActiveChildren = getActiveChildrenForParent(parentKey, routes);
    return expandedSubmenus.has(parentKey) || hasActiveChildren;
  };

  // Проверяем активные дочерние элементы для настроек
  const isSettingsChildrenActive = getActiveChildrenForParent('settings', settingsRoutes);
  const isSettingsExpanded = isSubmenuExpanded('settings', settingsRoutes);

  return (
    <div className={cn("hidden lg:flex w-[250px] flex-col bg-white border-r border-neutral-200 h-auto self-stretch", className)}>
      <div className="sticky top-0">
        <img src={logo} alt="logo" className="p-5" />
        <nav className="flex flex-col items-start gap-1 px-3 py-4 h-auto flex-1">
          {/* Основные маршруты */}
          {mainRoutes.map((route) => (
            <NavItem
              key={route.path}
              to={route.path}
              icon={route.icon}
              label={route.navLabel}
              isActive={location.pathname === route.path}
            />
          ))}

          {/* Налаштування - показываем всем, но дочерние элементы по ролям */}
          <Submenu
            label="Налаштування"
            icon={<DynamicIcon name="settings-2" size={20} />}
            isExpanded={isSettingsExpanded}
            isChildrenActive={isSettingsChildrenActive}
            onToggle={() => toggleSubmenu('settings')}
          >
            {settingsRoutes.map((route) => (
              <SubmenuItem
                key={route.path}
                to={route.path}
                icon={route.icon}
                label={route.navLabel}
                isActive={location.pathname === route.path}
              />
            ))}
          </Submenu>
        </nav>
      </div>
    </div>
  );
}
