import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { ROLES } from '@shared/constants/roles';
import { installRolePreviewFetch, setRolePreviewFetchRole } from '@/lib/rolePreviewFetch';
import { PERMISSIONS_REVISION_EVENT } from '@/lib/notifyPermissionsChanged';
import type { RoleDto } from '@shared/types/role';

const STORAGE_KEY = 'rolePreview';

interface RolePreviewContextType {
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

const RolePreviewContext = createContext<RolePreviewContextType | undefined>(undefined);

function readStoredPreview(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored && stored !== ROLES.ADMIN ? stored : null;
  } catch {
    return null;
  }
}

interface RolePreviewProviderProps {
  children: ReactNode;
}

export function RolePreviewProvider({ children }: RolePreviewProviderProps) {
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [previewRole, setPreviewRoleState] = useState<string | null>(readStoredPreview);
  const [previewRoles, setPreviewRoles] = useState<RoleDto[]>([]);
  const previousPreviewRef = useRef<string | null | undefined>(undefined);

  const isRealAdmin = user?.role === ROLES.ADMIN;

  const refreshPreviewRoles = useCallback(async () => {
    if (!isRealAdmin) {
      setPreviewRoles([]);
      return;
    }
    try {
      const response = await fetch('/api/roles', { credentials: 'include' });
      const data = response.ok ? await response.json() : [];
      setPreviewRoles(Array.isArray(data) ? data : []);
    } catch {
      setPreviewRoles([]);
    }
  }, [isRealAdmin]);

  useEffect(() => {
    if (!isRealAdmin) return;
    void refreshPreviewRoles();
  }, [isRealAdmin, user?.id, refreshPreviewRoles]);

  useEffect(() => {
    if (!isRealAdmin) return;
    const onRolesUpdated = () => {
      void refreshPreviewRoles();
    };
    window.addEventListener(PERMISSIONS_REVISION_EVENT, onRolesUpdated);
    return () => window.removeEventListener(PERMISSIONS_REVISION_EVENT, onRolesUpdated);
  }, [isRealAdmin, refreshPreviewRoles]);

  useEffect(() => {
    if (!isRealAdmin || previewRoles.length === 0 || !previewRole) return;
    if (!previewRoles.some((item) => item.slug === previewRole)) {
      setPreviewRoleState(null);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [isRealAdmin, previewRole, previewRoles]);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      setPreviewRoleState(null);
      setPreviewRoles([]);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    if (!isRealAdmin && previewRole) {
      setPreviewRoleState(null);
    }
  }, [isLoading, user, isRealAdmin, previewRole]);

  const setPreviewRole = (role: string | null) => {
    if (!isRealAdmin) return;

    const known = !role || role === ROLES.ADMIN || previewRoles.some((item) => item.slug === role);
    const next = role && role !== ROLES.ADMIN && known ? role : null;
    setPreviewRoleState(next);
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, next);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const activePreview = isRealAdmin ? previewRole : null;
  const effectiveRole = activePreview ?? user?.role;
  const isPreviewing = Boolean(activePreview);
  const isAdminView = effectiveRole === ROLES.ADMIN;

  const effectivePermissions = useMemo(() => {
    if (isPreviewing && activePreview) {
      const preview = previewRoles.find((item) => item.slug === activePreview);
      return preview?.permissions ?? [];
    }
    return user?.permissions ?? [];
  }, [activePreview, isPreviewing, previewRoles, user?.permissions]);

  installRolePreviewFetch();
  setRolePreviewFetchRole(activePreview);

  useEffect(() => {
    if (previousPreviewRef.current === undefined) {
      previousPreviewRef.current = activePreview;
      return;
    }
    if (previousPreviewRef.current === activePreview) return;
    previousPreviewRef.current = activePreview;
    void queryClient.resetQueries();
  }, [activePreview, queryClient]);

  return (
    <RolePreviewContext.Provider
      value={{
        previewRole: activePreview,
        setPreviewRole,
        effectiveRole,
        effectivePermissions,
        previewRoles,
        refreshPreviewRoles,
        isPreviewing,
        isRealAdmin,
        isAdminView,
      }}
    >
      {children}
    </RolePreviewContext.Provider>
  );
}

export function useRolePreview() {
  const context = useContext(RolePreviewContext);
  if (context === undefined) {
    throw new Error('useRolePreview must be used within a RolePreviewProvider');
  }
  return context;
}
