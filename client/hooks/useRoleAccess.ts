import { useAuth } from "@/contexts/AuthContext";
import { useRolePreview } from "@/contexts/RolePreviewContext";
import { hasAccess, ROLES } from "@/routes.config";

export const useRoleAccess = () => {
  const { user } = useAuth();
  const { effectiveRole } = useRolePreview();

  const canAccess = (requiredRoles?: string[], minRole?: string): boolean => {
    if (!user || !effectiveRole) return false;
    return hasAccess(effectiveRole, requiredRoles, minRole);
  };

  const isAdmin = () => canAccess([ROLES.ADMIN]);
  const isBoss = () => canAccess([ROLES.BOSS, ROLES.ADMIN]);
  const isShopManager = () => canAccess([ROLES.SHOP_MANAGER, ROLES.BOSS, ROLES.ADMIN]);
  const isAdsManager = () => canAccess([ROLES.ADS_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS, ROLES.ADMIN]);
  const isStorekeeper = () => canAccess([ROLES.STOREKEEPER, ROLES.ADS_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS, ROLES.ADMIN]);
  const canEditProducts = () => canAccess([ROLES.STOREKEEPER, ROLES.BOSS, ROLES.ADMIN]);

  return {
    user,
    canAccess,
    isAdmin,
    isBoss,
    isShopManager,
    isAdsManager,
    isStorekeeper,
    canEditProducts,
    ROLES
  };
};
