import React from 'react';
import { appRoutes, getNavGroups, type AppRoute, type NavBadge, type NavGroup } from '@/routes.config';

export interface MobileNavItem {
  label: string;
  icon: React.ReactNode | null;
  path?: string;
  navBadge?: NavBadge;
}

/** Знайти найкращий match маршруту за pathname (включно з динамічними :params). */
function matchRoute(pathname: string): AppRoute | null {
  let best: AppRoute | null = null;
  let bestScore = -1;

  for (const route of appRoutes) {
    if (!route.path.includes(':')) {
      if (route.path === pathname) {
        return route;
      }
      // prefix match для вкладених шляхів (напр. /orders/123 → /orders лише якщо немає точнішого)
      continue;
    }

    const paramNames: string[] = [];
    const regexPattern = route.path.replace(/:[^/]+/g, (match) => {
      paramNames.push(match.slice(1));
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexPattern}$`);
    if (regex.test(pathname)) {
      const score = route.path.length;
      if (score > bestScore) {
        best = route;
        bestScore = score;
      }
    }
  }

  if (best) return best;

  // Exact static match already handled; try longest static prefix among inNav routes
  const staticMatches = appRoutes
    .filter((r) => !r.path.includes(':') && (pathname === r.path || pathname.startsWith(r.path + '/')))
    .sort((a, b) => b.path.length - a.path.length);

  return staticMatches[0] ?? null;
}

/** Поточний пункт меню для MobileHeader (navLabel + icon, не page title). */
export function resolveMobileNavLabel(
  pathname: string,
  userRole?: string
): MobileNavItem {
  const route = matchRoute(pathname);
  if (route) {
    // Для маршрутів поза nav (напр. деталі замовлення) — показуємо parent nav якщо є
    if (!route.inNav && pathname.startsWith('/orders')) {
      const orders = appRoutes.find((r) => r.path === '/orders');
      if (orders) {
        return {
          label: orders.navLabel,
          icon: orders.icon,
          path: orders.path,
          navBadge: orders.navBadge,
        };
      }
    }
    return {
      label: route.navLabel || (typeof route.title === 'string' ? route.title : 'Сторінка'),
      icon: route.icon,
      path: route.path,
      navBadge: route.navBadge,
    };
  }

  const { subGroups } = getNavGroups(userRole);
  for (const group of Object.values(subGroups) as NavGroup[]) {
    const childHit = group.children.some(
      (c) => pathname === c.path || pathname.startsWith(c.path + '/')
    );
    if (childHit) {
      return {
        label: group.parentRoute?.navLabel ?? group.groupMeta?.label ?? group.key,
        icon: group.parentRoute?.icon ?? group.groupMeta?.icon ?? null,
        navBadge: group.parentRoute?.navBadge,
      };
    }
  }

  return { label: 'Сторінка', icon: null };
}

/** Чи pathname належить групі (warehouse / reports / …). */
export function isPathInNavGroup(pathname: string, group: NavGroup | undefined): boolean {
  if (!group) return false;
  if (group.parentRoute && (pathname === group.parentRoute.path || pathname.startsWith(group.parentRoute.path + '/'))) {
    return true;
  }
  return group.children.some(
    (c) => pathname === c.path || pathname.startsWith(c.path + '/')
  );
}
