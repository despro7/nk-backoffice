import { createContext, useContext } from 'react';
import type { RoleDto } from '@shared/types/role';

export interface RolePreviewContextType {
  previewRole: string | null;
  setPreviewRole: (role: string | null) => void;
  effectiveRole: string | undefined;
  effectivePermissions: string[];
  previewRoles: RoleDto[];
  refreshPreviewRoles: () => Promise<void>;
  isPreviewing: boolean;
  isRealAdmin: boolean;
  isAdminView: boolean;
}

export const RolePreviewContext = createContext<RolePreviewContextType | undefined>(undefined);

export function useRolePreview() {
  const context = useContext(RolePreviewContext);
  if (context === undefined) {
    throw new Error('useRolePreview must be used within a RolePreviewProvider');
  }
  return context;
}
