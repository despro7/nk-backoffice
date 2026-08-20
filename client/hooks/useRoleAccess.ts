import { useAuth } from "@/contexts/AuthContext";
import { useRolePreview } from "@/contexts/RolePreviewContext";
import { hasAccess, ROLES } from "@/routes.config";
import { hasPermission as hasPermissionKey } from "@shared/constants/permissions";

export const useRoleAccess = () => {
  const { user } = useAuth();
  const { effectiveRole, effectivePermissions } = useRolePreview();

  const canAccess = (requiredRoles?: string[], minRole?: string): boolean => {
    if (!user || !effectiveRole) return false;
    return hasAccess(effectiveRole, requiredRoles, minRole);
  };

  const hasPermission = (key: string): boolean => {
    if (!user) return false;
    return hasPermissionKey(effectivePermissions, key);
  };

  const isAdmin = () => user?.role === ROLES.ADMIN && effectiveRole === ROLES.ADMIN;
  const isBoss = () => canAccess([ROLES.BOSS, ROLES.ADMIN]);
  const isShopManager = () => canAccess([ROLES.SHOP_MANAGER, ROLES.BOSS, ROLES.ADMIN]);
  const isAdsManager = () => canAccess([ROLES.ADS_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS, ROLES.ADMIN]);
  const isStorekeeper = () => canAccess([ROLES.STOREKEEPER, ROLES.ADS_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS, ROLES.ADMIN]);
  const canEditProducts = () => hasPermission('action.products.edit');

  return {
    user,
    canAccess,
    hasPermission,
    isAdmin,
    isBoss,
    isShopManager,
    isAdsManager,
    isStorekeeper,
    canEditProducts,
    ROLES
  };
};
