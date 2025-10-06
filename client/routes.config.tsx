import React from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';

// Import page components
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import WarehouseMovement from './pages/WarehouseMovement';
import Reports from './pages/Reports';
import DesignSystem from './pages/DesignSystem';
import OrderView from './pages/OrderView';
import SettingsTestAuth from "./pages/SettingsTestAuth";
import SettingsProfile from "./pages/SettingsProfile";
import SettingsProductSets from "./pages/SettingsProductSets";
import SettingsOrderAssembly from "./pages/SettingsOrderAssembly";
import SettingsEquipment from "./pages/SettingsEquipment";
import SettingsOrders from "./pages/SettingsOrders";
import SettingsAdmin from "./pages/SettingsAdmin";
import TestSerialCom from "./pages/test-serial-com";

// Определяем роли и их иерархию
export const ROLES = {
  ADMIN: 'admin',
  BOSS: 'boss',
  SHOP_MANAGER: 'shop-manager',
  ADS_MANAGER: 'ads-manager',
  STOREKEEPER: 'storekeeper'
} as const;

export const ROLE_HIERARCHY = {
  [ROLES.STOREKEEPER]: 1,
  [ROLES.ADS_MANAGER]: 2,
  [ROLES.SHOP_MANAGER]: 3,
  [ROLES.BOSS]: 4,
  [ROLES.ADMIN]: 5
};

// Функция проверки доступа по роли
export const hasAccess = (userRole: string, requiredRoles?: string[], minRole?: string): boolean => {
  if (!requiredRoles && !minRole) return true; // Доступ для всех
  
  // Проверка по списку разрешенных ролей
  if (requiredRoles && requiredRoles.includes(userRole)) return true;
  
  // Проверка по минимальной роли
  if (minRole) {
    const userLevel = ROLE_HIERARCHY[userRole as keyof typeof ROLE_HIERARCHY] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole as keyof typeof ROLE_HIERARCHY] || 0;
    return userLevel >= requiredLevel;
  }
  
  return false;
};

// Расширенный интерфейс для поддержки ролей
export interface AppRoute {
  path: string;
  component: React.ComponentType;
  title: string | ((params: Record<string, string>) => string);
  pageTitle: string | ((params: Record<string, string>) => string);
  navLabel: string;
  icon: React.ReactNode;
  inNav: boolean;
  parent?: string; // Для группировки в подменю
  order?: number; // Для сортировки элементов
  roles?: string[]; // Разрешенные роли для доступа
  minRole?: string; // Минимальная роль для доступа
  hasOwnTitle?: boolean; // Флаг для страниц с собственным заголовком
}

// Define all routes with role-based access control
export const appRoutes: AppRoute[] = [
  {
    path: '/',
    component: Dashboard,
    title: 'Головна панель',
    pageTitle: 'Головна панель | NK Backoffice',
    navLabel: 'Головна панель',
    icon: <DynamicIcon name="home" size={20} />,
    inNav: true,
    order: 1,
    // Доступ для всех ролей
  },
  {
    path: '/orders',
    component: Orders,
    title: 'Комплектування замовлень',
    pageTitle: 'Комплектування замовлень | NK Backoffice',
    navLabel: 'Замовлення',
    icon: <DynamicIcon name="layout-list" size={20} />,
    inNav: true,
    order: 2,
    minRole: ROLES.STOREKEEPER // storekeeper и выше
  },
  {
    path: '/orders/:externalId',
    component: OrderView,
    title: (params) => `Замовлення №${params.externalId}`,
    pageTitle: (params) => `Замовлення №${params.externalId} | NK Backoffice`,
    navLabel: 'Деталі замовлення',
    icon: null,
    inNav: false,
    minRole: ROLES.STOREKEEPER,
    hasOwnTitle: true,
  },
  {
    path: '/warehouse',
    component: WarehouseMovement,
    title: 'Переміщення складу',
    pageTitle: 'Переміщення складу | NK Backoffice',
    navLabel: 'Переміщення складу',
    icon: <DynamicIcon name="combine" size={20} />,
    inNav: true,
    order: 3,
    minRole: ROLES.STOREKEEPER // storekeeper и выше
  },
  {
    path: '/reports',
    component: Reports,
    title: 'Звіти',
    pageTitle: 'Звіти | NK Backoffice',
    navLabel: 'Звіти',
    icon: <DynamicIcon name="chart-spline" size={20} />,
    inNav: true,
    order: 4,
    minRole: ROLES.ADS_MANAGER // ads-manager и выше
  },
  {
    path: '/profile',
    component: SettingsProfile,
    title: 'Мій профіль',
    pageTitle: 'Мій профіль | NK Backoffice',
    navLabel: 'Мій профіль',
    icon: <DynamicIcon name="user" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 1
  },
  {
    path: '/settings/design',
    component: DesignSystem,
    title: 'Дизайн-система',
    pageTitle: 'Дизайн-система | NK Backoffice',
    navLabel: 'Дизайн система',
    icon: <DynamicIcon name="palette" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 5,
    roles: [ROLES.ADMIN] // Только admin
  },
  {
    path: "/settings/test-auth",
    component: SettingsTestAuth,
    title: 'Тест системи авторизації (JWT)',
    pageTitle: 'Тестова сторінка | NK Backoffice',
    navLabel: 'Тест авторизації',
    icon: <DynamicIcon name="user-lock" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 6,
    roles: [ROLES.ADMIN] // Только admin
  },
  {
    path: "/settings/product-sets",
    component: SettingsProductSets,
    title: 'Товари з Dilovod',
    pageTitle: 'Товари з Dilovod | NK Backoffice',
    navLabel: 'Товари з Dilovod',
    icon: <DynamicIcon name="shopping-bag" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 2,
    // roles: [ROLES.ADMIN, ROLES.BOSS] // Только admin и boss
  },
  {
    path: "/settings/order-assembly",
    component: SettingsOrderAssembly,
    title: 'Налаштування комплектування замовлень',
    pageTitle: 'Налаштування комплектування замовлень | NK Backoffice',
    navLabel: 'Комплектування замовлень',
    icon: <DynamicIcon name="settings" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 3,
    minRole: ROLES.STOREKEEPER // storekeeper и выше
  },
  {
    path: "/settings/equipment",
    component: SettingsEquipment,
    title: 'Налаштування обладнання',
    pageTitle: 'Налаштування обладнання | NK Backoffice',
    navLabel: 'Обладнання',
    icon: <DynamicIcon name="scan-barcode" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 4,
    minRole: ROLES.STOREKEEPER // storekeeper и выше
  },
  {
    path: "/settings/orders",
    component: SettingsOrders,
    title: 'Налаштування синхронізации замовлень',
    pageTitle: 'Налаштування синхронізації замовлень | NK Backoffice',
    navLabel: 'Синхронізація замовлень',
    icon: <DynamicIcon name="refresh-cw" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 7,
    roles: [ROLES.ADMIN] // Только admin
  },
  {
    path: "/settings/admin",
    component: SettingsAdmin,
    title: 'Адмінські налаштування',
    pageTitle: 'Адмінські налаштування | NK Backoffice',
    navLabel: 'Адмінські налаштування',
    icon: <DynamicIcon name="shield" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 8,
    roles: [ROLES.ADMIN] // Только admin
  },
  {
    path: "/test-serial-com",
    component: TestSerialCom,
    title: 'Тестування COM порту та обладнання',
    pageTitle: 'Тестування COM порту та обладнання | NK Backoffice',
    navLabel: 'Тест COM порту',
    icon: <DynamicIcon name="test-tube" size={20} />,
    inNav: false, // Не показывать в навигации
    order: 9
    // Без указания roles или minRole - доступ без авторизации
  },
];

// Обновленная группировка с учетом ролей
export const getNavGroups = (userRole?: string) => {
  const filterByRole = (route: AppRoute) => {
    if (!userRole) return false;
    return hasAccess(userRole, route.roles, route.minRole);
  };

  const mainRoutes = appRoutes
    .filter(route => route.inNav && !route.parent && filterByRole(route))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
    
  const settingsRoutes = appRoutes
    .filter(route => route.inNav && route.parent === 'settings' && filterByRole(route))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  
  return {
    mainRoutes,
    settingsRoutes,
    hasSettingsAccess: settingsRoutes.length > 0
  };
};