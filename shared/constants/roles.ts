// Ролі користувачів (shared між клієнтом і сервером)

export const ROLES = {
  ADS_MANAGER: 'ads-manager',
  STOREKEEPER: 'storekeeper',
  WAREHOUSE_MANAGER: 'warehouse-manager',
  SHOP_MANAGER: 'shop-manager',
  BOSS: 'boss',
  ADMIN: 'admin'
} as const;

export type RoleValue = typeof ROLES[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<RoleValue, number> = {
  [ROLES.ADS_MANAGER]: 1,
  [ROLES.STOREKEEPER]: 2,
  [ROLES.WAREHOUSE_MANAGER]: 3,
  [ROLES.SHOP_MANAGER]: 4,
  [ROLES.BOSS]: 5,
  [ROLES.ADMIN]: 6
};

/**
 * Перевіряє доступ користувача за роллю.
 * @param userRole - роль поточного користувача
 * @param requiredRoles - список допустимих ролей (OR-логіка)
 * @param minRole - мінімальна роль в ієрархії
 */
export const hasAccess = (userRole: string, requiredRoles?: string[], minRole?: string): boolean => {
  if (!requiredRoles && !minRole) return true;

  if (requiredRoles && requiredRoles.includes(userRole)) return true;

  if (minRole) {
    const userLevel = ROLE_HIERARCHY[userRole as RoleValue] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole as RoleValue] || 0;
    return userLevel >= requiredLevel;
  }

  return false;
};

// Зручні набори ролей для серверних перевірок (тільки для нестандартних випадків)
export const ROLE_SETS = {
  /** Тільки адміністратор — використовується з requireRole() */
  ADMIN_ONLY: [ROLES.ADMIN] as string[],
} as const;
