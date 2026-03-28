import React from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';

// Import page components
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import WarehouseMovement from './pages/WarehouseMovement';
import Reports from './pages/Reports';
import ReportsSales from './pages/ReportsSales';
import ReportsShipment from './pages/ReportsShipment';
import DesignSystem from './pages/DesignSystem';
import OrderView from './pages/OrderView';
import SettingsTestAuth from "./pages/SettingsTestAuth";
import SettingsProfile from "./pages/SettingsProfile";
import SettingsProductSets from "./pages/SettingsProductSets";
import SettingsOrderAssembly from "./pages/SettingsOrderAssembly";
import SettingsEquipment from "./pages/SettingsEquipment";
import SettingsOrders from "./pages/SettingsOrders";
import SettingsAdmin from "./pages/SettingsAdmin";
import SettingsDilovod from "./pages/SettingsDilovod";
import SalesDriveOrders from "./pages/SalesDriveOrders";
import TestSerialCom from "./pages/test-serial-com";

// Определяем роли и их иерархию
import { ROLES, ROLE_HIERARCHY, hasAccess } from '@shared/constants/roles';
export { ROLES, ROLE_HIERARCHY, hasAccess };

// Метадані для груп-контейнерів без власного маршруту (наприклад, "Налаштування")
export interface NavGroupMeta {
  label: string;
  icon: React.ReactNode;
  /** Порядок групи в навігації серед mainRoutes та груп-контейнерів */
  order?: number;
}

// Розширений інтерфейс для підтримки ролей
export interface AppRoute {
  path: string;
  component: React.ComponentType;
  title: string | ((params: Record<string, string>) => string);
  pageTitle: string | ((params: Record<string, string>) => string);
  navLabel: string;
  icon: React.ReactNode;
  inNav: boolean;
  parent?: string; // Для розміщення в підменю
  order?: number; // Для сортування елементів
  roles?: string[]; // Дозволені ролі для доступу
  minRole?: string; // Мінімальна роль для доступу
  hasOwnTitle?: boolean; // Флаг для сторінок з власним заголовком
  /** Метадані групи-контейнера. Вказується на будь-якому маршруті з parent === ключ цієї групи.
   *  Потрібне лише для груп БЕЗ власного маршруту (наприклад parent: 'settings').
   *  Достатньо вказати один раз на будь-якому дочірньому елементі. */
  groupMeta?: NavGroupMeta;
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
    // Доступ для всіх ролей, тому не вказуємо roles або minRole
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
    minRole: ROLES.STOREKEEPER // storekeeper і вище
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
    minRole: ROLES.STOREKEEPER // storekeeper і вище
  },
  {
    path: '/reports/sales',
    component: ReportsSales,
    title: 'Звіти по продажам',
    pageTitle: 'Звіти по продажам | NK Backoffice',
    navLabel: 'Статистика продажів',
    icon: <DynamicIcon name="chart-column" size={16} />,
    inNav: true,
    parent: 'reports',
    order: 0,
    groupMeta: {
      label: 'Звіти',
      icon: <DynamicIcon name="chart-spline" size={20} />,
      order: 4,
    },
    minRole: ROLES.ADS_MANAGER // ads-manager і вище
  },
  {
    path: '/reports/shipment',
    component: ReportsShipment,
    title: 'Звіти по відвантаженням',
    pageTitle: 'Звіти по відвантаженням | NK Backoffice',
    navLabel: 'Відвантаження',
    icon: <DynamicIcon name="truck" size={16} />,
    inNav: true,
    parent: 'reports',
    order: 1,
    minRole: ROLES.SHOP_MANAGER // shop-manager і вище
  },
  {
    path: '/reports/general',
    component: Reports,
    title: 'Звіти',
    pageTitle: 'Звіти | NK Backoffice',
    navLabel: 'Загальна статистика',
    icon: <DynamicIcon name="calculator" size={16} />,
    inNav: true,
    parent: 'reports',
    order: 2,
    minRole: ROLES.SHOP_MANAGER // shop-manager і вище
  },
  {
    path: '/salesdrive-to-dilovod',
    component: SalesDriveOrders,
    title: 'Вивантаження замовлень з SalesDrive в Dilovod',
    pageTitle: 'Вивантаження замовлень з SalesDrive в Dilovod | NK Backoffice',
    navLabel: 'SalesDrive -> Dilovod',
    icon: <DynamicIcon name="truck" size={20} />,
    inNav: true,
    order: 5,
    minRole: ROLES.SHOP_MANAGER // shop-manager і вище (admin, boss, shop-manager)
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
    order: 1,
    groupMeta: {
      label: 'Налаштування',
      icon: <DynamicIcon name="settings-2" size={20} />,
      order: 10,
    },
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
    roles: [ROLES.ADMIN] // Тільки admin
  },
  {
    path: '/settings/test-auth',
    component: SettingsTestAuth,
    title: 'Тест системи авторизації (JWT)',
    pageTitle: 'Тестова сторінка | NK Backoffice',
    navLabel: 'Тест авторизації',
    icon: <DynamicIcon name="user-lock" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 6,
    roles: [ROLES.ADMIN] // Тільки admin
  },
  {
    path: '/settings/product-sets',
    component: SettingsProductSets,
    title: 'Товари і комплекти з Dilovod',
    pageTitle: 'Товари і комплекти | NK Backoffice',
    navLabel: 'Товари і комплекти',
    icon: <DynamicIcon name="shopping-bag" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 2,
    minRole: ROLES.STOREKEEPER  // storekeeper і вище
  },
  {
    path: '/settings/order-assembly',
    component: SettingsOrderAssembly,
    title: 'Налаштування комплектування замовлень',
    pageTitle: 'Налаштування комплектування замовлень | NK Backoffice',
    navLabel: 'Комплектування замовлень',
    icon: <DynamicIcon name="settings" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 3,
    minRole: ROLES.STOREKEEPER // storekeeper і вище
  },
  {
    path: '/settings/equipment',
    component: SettingsEquipment,
    title: 'Налаштування обладнання',
    pageTitle: 'Налаштування обладнання | NK Backoffice',
    navLabel: 'Обладнання',
    icon: <DynamicIcon name="scan-barcode" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 4,
    roles: [ROLES.ADMIN, ROLES.BOSS, ROLES.STOREKEEPER] // Тільки admin и boss
  },
  {
    path: '/settings/orders',
    component: SettingsOrders,
    title: 'Налаштування синхронізации замовлень',
    pageTitle: 'Налаштування синхронізації замовлень | NK Backoffice',
    navLabel: 'Синхронізація замовлень',
    icon: <DynamicIcon name="refresh-cw" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 7,
    roles: [ROLES.ADMIN] // Тільки admin
  },
  {
    path: '/settings/dilovod',
    component: SettingsDilovod,
    title: 'Налаштування синхронізації SalesDrive ➝ Dilovod',
    pageTitle: 'Налаштування синхронізації SalesDrive ➝ Dilovod | NK Backoffice',
    navLabel: 'Синхронізація SalesDrive -> Dilovod',
    icon: <DynamicIcon name="building-2" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 8,
    minRole: ROLES.SHOP_MANAGER // shop-manager і вище (admin, boss, shop-manager)
  },
  {
    path: '/settings/admin',
    component: SettingsAdmin,
    title: 'Адмінські налаштування',
    pageTitle: 'Адмінські налаштування | NK Backoffice',
    navLabel: 'Адмінські налаштування',
    icon: <DynamicIcon name="shield" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 9,
    roles: [ROLES.ADMIN] // Тільки admin
  },
  {
    path: '/test-serial-com',
    component: TestSerialCom,
    title: 'Тестування COM порту та обладнання',
    pageTitle: 'Тестування COM порту та обладнання | NK Backoffice',
    navLabel: 'Тест COM порту',
    icon: <DynamicIcon name="test-tube" size={20} />,
    inNav: false, // Не показувати в навігації
    order: 10,
    minRole: ROLES.STOREKEEPER // storekeeper і вище
  },
];

export interface NavGroup {
  key: string;               // Ключ групи (збігається з parent або шляхом маршруту)
  parentRoute: AppRoute | null; // Маршрут-батько (якщо існує в appRoutes), або null
  groupMeta: NavGroupMeta | null; // Метадані для груп без власного маршруту
  /** Порядок групи в навігації: береться з parentRoute.order або groupMeta.order */
  order: number;
  children: AppRoute[];      // Дочірні маршрути
}

// Повністю динамічна групировка навігації з урахуванням ролей
export const getNavGroups = (userRole?: string) => {
  const filterByRole = (route: AppRoute) => {
    if (!userRole) return false;
    return hasAccess(userRole, route.roles, route.minRole);
  };

  // Маршрути верхнього рівня (без parent), доступні за роллю
  const mainRoutes = appRoutes
    .filter(route => route.inNav && !route.parent && filterByRole(route))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Знаходимо всі унікальні parent-ключі серед доступних дочірніх маршрутів
  const allParentKeys = Array.from(
    new Set(
      appRoutes
        .filter(route => route.inNav && route.parent && filterByRole(route))
        .map(route => route.parent as string)
    )
  );

  // Будуємо map груп: key → { parentRoute, groupMeta, children }
  const subGroups: Record<string, NavGroup> = {};
  for (const key of allParentKeys) {
    const parentRoute = appRoutes.find(r => r.path === `/${key}` || r.path === key) ?? null;
    const children = appRoutes
      .filter(route => route.inNav && route.parent === key && filterByRole(route))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    // Підхоплюємо groupMeta з будь-якого дочірнього маршруту (достатньо одного)
    const groupMeta = appRoutes.find(r => r.parent === key && r.groupMeta)?.groupMeta ?? null;
    const order = parentRoute?.order ?? groupMeta?.order ?? 999;
    subGroups[key] = { key, parentRoute, groupMeta, order, children };
  }

  return { mainRoutes, subGroups };
};