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

export const ROLE_LABELS: Record<RoleValue, string> = {
  [ROLES.ADS_MANAGER]: 'Менеджер реклами',
  [ROLES.STOREKEEPER]: 'Комірник',
  [ROLES.WAREHOUSE_MANAGER]: 'Керівник складу',
  [ROLES.SHOP_MANAGER]: 'Менеджер магазину',
  [ROLES.BOSS]: 'Директор',
  [ROLES.ADMIN]: 'Адміністратор'
};

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

export function isRoleValue(value: string | null | undefined): value is RoleValue {
  return Boolean(value) && (Object.values(ROLES) as string[]).includes(value as string);
}

/** Заголовок UI-preview: адмін просить сервер перевіряти доступ як нижча роль. */
export const ROLE_PREVIEW_HEADER = 'X-Role-Preview';
export const ROLE_PREVIEW_APPLIED_HEADER = 'X-Role-Preview-Applied';
/** Відповідь requireRole / requireMinRole: клієнт показує toast, не читаючи body. */
export const INSUFFICIENT_ROLE_HEADER = 'X-Insufficient-Role';

/**
 * Ендпоінти сесії/ідентичності завжди йдуть від реальної ролі,
 * щоб адмін не втратив профіль, logout і refresh під час прев’ю.
 */
export function isRolePreviewExemptPath(path: string): boolean {
  const pathname = path.split('?')[0];
  if (pathname === '/api/auth/settings') return true;
  if (pathname === '/api/roles' || pathname.startsWith('/api/roles/')) return true;
  return [
    '/api/auth/profile',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/login',
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * true якщо реальна роль — admin, а preview — існуючий slug строго не admin.
 * `roleExists` передає сервер після перевірки таблиці roles; без нього — лише відомі системні ролі.
 */
export function canApplyRolePreview(
  realRole: string,
  previewRole: string,
  roleExists?: boolean
): boolean {
  if (realRole !== ROLES.ADMIN) return false;
  if (!previewRole || previewRole === ROLES.ADMIN) return false;
  if (typeof roleExists === 'boolean') return roleExists;
  return isRoleValue(previewRole);
}

// Зручні набори ролей для серверних перевірок (тільки для нестандартних випадків)
export const ROLE_SETS = {
  /** Тільки адміністратор — використовується з requireRole() */
  ADMIN_ONLY: [ROLES.ADMIN] as string[],
} as const;
