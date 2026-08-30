import React from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';

// Import page components
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import WarehouseMovement from './pages/Warehouse/WarehouseMovement';
import WarehouseMovementMob from './pages/Warehouse/WarehouseMovementMob';
import MovementMobDocumentPage from './pages/Warehouse/WarehouseMovementMob/MovementMobDocumentPage';
import MovementMobCreatePage from './pages/Warehouse/WarehouseMovementMob/MovementMobCreatePage';
import WarehouseInventory from './pages/Warehouse/WarehouseInventory';
import WarehouseReturns from './pages/Warehouse/WarehouseReturns';
import WarehouseWriteOff from './pages/Warehouse/WarehouseWriteOff';
import WarehouseReleaseSets from './pages/Warehouse/WarehouseReleaseSets';
import WarehouseMaterials from './pages/WarehouseMaterials';
import Reports from './pages/Reports/ReportsGeneral';
import ReportsSales from './pages/Reports/ReportsSales';
import ReportsShipment from './pages/Reports/ReportsShipment';
import ReportsSalesDynamics from './pages/Reports/ReportsSalesDynamics';
import LalAudiences from './pages/Reports/LalAudiences';
import DesignSystem from './pages/DesignSystem';
import OrderView from './pages/OrderView';
import SettingsTestAuth from "./pages/SettingsTestAuth";
import SettingsProfile from "./pages/SettingsProfile";
import SettingsProductSets from "./pages/SettingsProductSets";
import ProductsPage from "./pages/Products";
import SettingsOrderAssembly from "./pages/SettingsOrderAssembly";
import SettingsEquipment from "./pages/SettingsEquipment";
import SettingsOrders from "./pages/SettingsOrders";
import SettingsAdmin from "./pages/SettingsAdmin";
import SettingsUsers from "./pages/Settings/Users";
import SettingsDilovod from "./pages/SettingsDilovod";
import SettingsWarehouseMovement from "./pages/SettingsWarehouseMovement";
import SalesDriveOrders from "./pages/SalesDriveOrders";
import CashInImport from "./pages/CashInImport";
import BankStatementImport from "./pages/BankStatementImport";
import TestSerialCom from "./pages/test-serial-com";
import MetaLogNotifications from './pages/MetaLogs';

// Определяем роли и их иерархию
import { ROLES, ROLE_HIERARCHY, hasAccess, ROLE_LABELS } from '@shared/constants/roles';
import { canAccessRoute, type RoutePermissionInput } from '@shared/constants/permissions';
export { ROLES, ROLE_HIERARCHY, hasAccess, ROLE_LABELS };

// Метадані для груп-контейнерів без власного маршруту (наприклад, "Налаштування")
export interface NavGroupMeta {
  label: string;
  icon: React.ReactNode;
  /** Порядок групи в навігації серед mainRoutes та груп-контейнерів */
  order?: number;
}

/** Колір бейджа пункту меню (мапиться на Tailwind у Sidebar) */
export type NavBadgeColor =
  | 'danger'
  | 'primary'
  | 'success'
  | 'warning'
  | 'secondary'
  | 'default';

/** Опційний бейдж біля navLabel (напр. NEW) */
export interface NavBadge {
  label: string;
  /** За замовчуванням `danger` (червоний) */
  color?: NavBadgeColor;
  /**
   * Дата актуальності (ISO `YYYY-MM-DD` або повний ISO datetime).
   * Після цієї дати бейдж не показується. Без `until` — показується завжди.
   */
  until?: string;
}

/** Чи показувати navBadge зараз (з урахуванням `until`) */
export function isNavBadgeVisible(
  badge: NavBadge | undefined | null,
  now: Date = new Date()
): boolean {
  if (!badge?.label?.trim()) return false;
  if (!badge.until) return true;

  const untilRaw = String(badge.until).trim();
  const until = new Date(untilRaw);
  if (Number.isNaN(until.getTime())) return true;

  // Для дати без часу — видимий до кінця локального дня `until` включно
  if (/^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) {
    until.setHours(23, 59, 59, 999);
  }

  return now.getTime() <= until.getTime();
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
  permission?: RoutePermissionInput;
  roles?: string[]; // Дозволені ролі для доступу
  minRole?: string; // Мінімальна роль для доступу
  hasOwnTitle?: boolean; // Флаг для сторінок з власним заголовком
  /** Бейдж біля пункту меню (колір + опційна дата зникнення) */
  navBadge?: NavBadge;
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
    title: 'Пакування замовлень',
    pageTitle: 'Пакування замовлень | NK Backoffice',
    navLabel: 'Обробка замовлень',
    icon: <DynamicIcon name="layout-list" size={20} />,
    inNav: true,
    order: 2,
    permission: { name: 'orders' },
  },
  {
    path: '/orders/:externalId',
    component: OrderView,
    title: (params) => `Замовлення №${params.externalId}`,
    pageTitle: (params) => `Замовлення №${params.externalId} | NK Backoffice`,
    navLabel: 'Деталі замовлення',
    icon: null,
    inNav: false,
    permission: { name: 'orders' },
    hasOwnTitle: true,
  },
  {
    path: '/warehouse/movement',
    component: WarehouseMovement,
    title: 'Переміщення між складами',
    pageTitle: 'Переміщення між складами | NK Backoffice',
    navLabel: 'Переміщення між складами',
    icon: <DynamicIcon name="combine" size={16} />,
    inNav: true,
    order: 3,
    parent: 'warehouse',
    groupMeta: {
      label: 'Склад',
      icon: <DynamicIcon name="warehouse" size={20} />,
      order: 3,
    },
    permission: { name: 'movement' },
  },
  {
    path: '/warehouse/movement-mob',
    component: WarehouseMovementMob,
    title: 'Переміщення між складами',
    pageTitle: 'Переміщення | NK Backoffice',
    navLabel: 'Переміщення',
    icon: <DynamicIcon name="combine" size={16} />,
    inNav: true,
    order: 3.1,
    parent: 'warehouse',
    permission: { name: 'movementMob' },
    navBadge: { label: 'NEW', color: 'danger' },
    hasOwnTitle: true,
  },
  {
    path: '/warehouse/movement-mob/new',
    component: MovementMobCreatePage,
    title: 'Нове переміщення',
    pageTitle: 'Нове переміщення | NK Backoffice',
    navLabel: 'Нове переміщення',
    icon: <DynamicIcon name="combine" size={16} />,
    inNav: false,
    parent: 'warehouse',
    permission: { name: 'movementMob' },
    hasOwnTitle: true,
  },
  {
    path: '/warehouse/movement-mob/:id',
    component: MovementMobDocumentPage,
    title: (params) => `Переміщення №${params.id}`,
    pageTitle: (params) => `Переміщення №${params.id} | NK Backoffice`,
    navLabel: 'Деталі переміщення',
    icon: null,
    inNav: false,
    parent: 'warehouse',
    permission: { name: 'movementMob' },
    hasOwnTitle: true,
  },
  {
    path: '/warehouse/inventory',
    component: WarehouseInventory,
    title: 'Інвентаризація залишків на складах',
    pageTitle: 'Інвентаризація залишків | NK Backoffice',
    navLabel: 'Інвентаризація залишків',
    icon: <DynamicIcon name="clipboard-list" size={16} />,
    inNav: true,
    order: 3,
    parent: 'warehouse',
    permission: { name: 'inventory' },
  },
  {
    path: '/warehouse/returns',
    component: WarehouseReturns,
    title: 'Повернення замовлень',
    pageTitle: 'Повернення замовлень | NK Backoffice',
    navLabel: 'Повернення',
    icon: <DynamicIcon name="undo-2" size={16} />,
    inNav: true,
    order: 4,
    parent: 'warehouse',
    permission: { name: 'returns' },
  },
  {
    path: '/warehouse/writeoff',
    component: WarehouseWriteOff,
    title: 'Списання зі складу',
    pageTitle: 'Списання зі складу | NK Backoffice',
    navLabel: 'Списання',
    icon: <DynamicIcon name="trash-2" size={16} />,
    inNav: true,
    order: 5,
    parent: 'warehouse',
    permission: { name: 'writeoff' },
  },
  {
    path: '/warehouse/releases',
    component: WarehouseReleaseSets,
    title: 'Комплектація та розукомплектування наборів',
    pageTitle: 'Комплектація + Розкомплектація | NK Backoffice',
    navLabel: 'Комплектація + Розкомплектація',
    icon: <DynamicIcon name="package-open" size={16} />,
    inNav: true,
    order: 6,
    parent: 'warehouse',
    permission: { name: 'releases' },
  },
  {
    path: '/warehouse/materials',
    component: WarehouseMaterials,
    title: 'Матеріали',
    pageTitle: 'Матеріали | NK Backoffice',
    navLabel: 'Матеріали',
    icon: <DynamicIcon name="arrows-up-from-line" size={16} />,
    inNav: true,
    order: 7,
    parent: 'warehouse',
    permission: { name: 'materials' },
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
    permission: { name: 'sales' },
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
    permission: { name: 'shipment' },
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
    permission: { name: 'general' },
  },
  {
    path: '/reports/sales-dynamics',
    component: ReportsSalesDynamics,
    title: 'Динаміка продажів по тижнях',
    pageTitle: 'Динаміка продажів | NK Backoffice',
    navLabel: 'Динаміка продажів',
    icon: <DynamicIcon name="trending-up" size={16} />,
    inNav: true,
    parent: 'reports',
    order: 3,
    permission: { name: 'salesDynamics' },
  },
  {
    path: '/reports/lal-audiences',
    component: LalAudiences,
    title: 'Lookalike Аудиторії',
    pageTitle: 'LAL Аудиторії | NK Backoffice',
    navLabel: 'LAL Аудиторії',
    icon: <DynamicIcon name="users" size={16} />,
    inNav: true,
    parent: 'reports',
    order: 4,
    permission: { name: 'lalAudiences' },
    navBadge: {
      label: 'NEW',
      color: 'danger',
      until: '2026-08-25',
    },
  },
  {
    path: '/reports/meta-logs',
    component: MetaLogNotifications,
    title: 'Звіт по помилкам',
    pageTitle: 'Звіт по помилкам | NK Backoffice',
    navLabel: 'Звіт по помилкам',
    icon: <DynamicIcon name="alert-triangle" size={16} />,
    inNav: true,
    parent: 'reports',
    order: 9,
    permission: { name: 'metaLogs' },
    hasOwnTitle: true,
  },
  {
    path: '/accounting/cash-in',
    component: CashInImport,
    title: 'Імпорт реєстру переказів НП',
    pageTitle: 'Імпорт реєстру переказів НП | NK Backoffice',
    navLabel: 'Реєстр переказів НП',
    icon: <DynamicIcon name="file-input" size={16} />,
    inNav: true,
    parent: 'accounting',
    order: 0,
    groupMeta: {
      label: 'Бухгалтерія',
      icon: <DynamicIcon name="banknote" size={20} />,
      order: 5,
    },
    permission: { name: 'cashIn' },
  },
  {
    path: '/accounting/bank-statements',
    component: BankStatementImport,
    title: 'Завантаження банківських виписок',
    pageTitle: 'Завантаження банківських виписок | NK Backoffice',
    navLabel: 'Банківські виписки',
    icon: <DynamicIcon name="landmark" size={16} />,
    inNav: true,
    parent: 'accounting',
    order: 1,
    permission: { name: 'bankStatements' },
  },
  {
    path: '/salesdrive-to-dilovod',
    component: SalesDriveOrders,
    title: 'Статуси всіх замовлень',
    pageTitle: 'Статуси всіх замовлень | NK Backoffice',
    navLabel: 'Стан замовлень',
    icon: <DynamicIcon name="clipboard-check" size={20} />,
    inNav: true,
    order: 6,
    permission: { name: 'salesdriveOrders' },
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
    path: '/settings/order-assembly',
    component: SettingsOrderAssembly,
    title: 'Налаштування комплектування замовлень',
    pageTitle: 'Налаштування комплектування замовлень | NK Backoffice',
    navLabel: 'Комплектування замовлень',
    icon: <DynamicIcon name="settings" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 3,
    permission: { name: 'orderAssembly' },
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
    permission: { name: 'equipment' },
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
    permission: { name: 'orders' },
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
    permission: { name: 'dilovod' },
  },
  {
    path: '/settings/warehouse-movement',
    component: SettingsWarehouseMovement,
    title: 'Налаштування переміщень між складами',
    pageTitle: 'Налаштування переміщень між складами | NK Backoffice',
    navLabel: 'Переміщення між складами',
    icon: <DynamicIcon name="combine" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 9,
    permission: { name: 'warehouseMovement' },
  },
  {
    path: '/settings/users',
    component: SettingsUsers,
    title: 'Користувачі і ролі',
    pageTitle: 'Користувачі | NK Backoffice',
    navLabel: 'Користувачі',
    icon: <DynamicIcon name="users" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    parent: 'settings',
    order: 9.5,
    permission: { name: 'users' },
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
    order: 20,
    permission: { name: 'design' },
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
    order: 25,
    permission: { name: 'testAuth' },
  },
  {
    path: '/products',
    component: ProductsPage,
    title: 'Товари 2.0',
    pageTitle: 'Товари 2.0 | NK Backoffice',
    navLabel: 'Товари 2.0',
    icon: <DynamicIcon name="package" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    order: 8,
    permission: { name: 'products' },
    // roles: [ROLES.ADMIN], // тимчасово лише admin (приховати від інших до релізу)
    navBadge: {
      label: 'NEW',
      color: 'danger',
      until: '2026-08-25',
    },
  },
  {
    path: '/product-sets',
    component: SettingsProductSets,
    title: 'Товари і комплекти з Dilovod',
    pageTitle: 'Товари і комплекти | NK Backoffice',
    navLabel: 'Товари і комплекти',
    icon: <DynamicIcon name="shopping-bag" size={20} className="max-w-full max-h-full" />,
    inNav: true,
    // parent: 'settings',
    order: 9,
    permission: { name: 'productSets' },
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
    order: 10,
    permission: { name: 'admin' },
  },
  {
    path: '/test-serial-com',
    component: TestSerialCom,
    title: 'Тестування COM порту та обладнання',
    pageTitle: 'Тестування COM порту та обладнання | NK Backoffice',
    navLabel: 'Тест COM порту',
    icon: <DynamicIcon name="test-tube" size={20} />,
    inNav: false, // Не показувати в навігації
    permission: { name: 'testSerialCom' },
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
export const getNavGroups = (userRole?: string, permissions?: Iterable<string>) => {
  const filterByRole = (route: AppRoute) => {
    if (!userRole && permissions == null) return false;
    return canAccessRoute(permissions, route, userRole);
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

/** Знайти маршрут за pathname (включно з динамічними :params). */
export function findAppRouteByPath(pathname: string): AppRoute | undefined {
  const exact = appRoutes.find((route) => route.path === pathname);
  if (exact) return exact;

  return appRoutes.find((route) => {
    if (!route.path.includes(':')) return false;
    const regexPattern = route.path.replace(/:[^/]+/g, '[^/]+');
    return new RegExp(`^${regexPattern}$`).test(pathname);
  });
}