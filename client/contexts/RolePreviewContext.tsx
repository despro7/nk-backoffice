import { useEffect, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import { RolePreviewContext, useRolePreview } from './role-preview-context';
import { ROLES } from '@shared/constants/roles';
import { canAccessRoute } from '@shared/constants/permissions';
import {
  installRolePreviewFetch,
  setRolePreviewFetchRole,
  setRolePreviewFetchRoleLabelResolver,
} from '@/lib/rolePreviewFetch';
import { PERMISSIONS_REVISION_EVENT } from '@/lib/notifyPermissionsChanged';
import { findAppRouteByPath } from '@/routes.config';
import { playSoundChoice } from '@/lib/soundUtils';
import { sortRolePreviewOptions } from '@/lib/rolePreviewOptions';
import type { RoleDto } from '@shared/types/role';

const STORAGE_KEY = 'rolePreview';

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

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function RolePreviewHotkeyListener() {
  const { isRealAdmin, effectiveRole, setPreviewRole, previewRoles } = useRolePreview();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isRealAdmin || previewRoles.length === 0) return;

    const options = sortRolePreviewOptions(previewRoles);

    const applyPreviewRole = (slug: string) => {
      const currentSlug = effectiveRole || ROLES.ADMIN;
      if (slug === currentSlug) return;

      setPreviewRole(slug === ROLES.ADMIN ? null : slug);

      const selected = options.find((option) => option.slug === slug);
      const currentRoute = findAppRouteByPath(location.pathname);
      if (currentRoute && !canAccessRoute(selected?.permissions, currentRoute, slug)) {
        navigate('/', { replace: true });
      }

      if (slug === ROLES.ADMIN) {
        playSoundChoice('tick', 'pending');
      } else {
        playSoundChoice('scan', 'success');
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || !event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (!/^[1-9]$/.test(event.key)) return;

      const index = Number.parseInt(event.key, 10) - 1;
      const target = options[index];
      if (!target) return;

      event.preventDefault();
      applyPreviewRole(target.slug);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveRole, isRealAdmin, location.pathname, navigate, previewRoles, setPreviewRole]);

  return null;
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
    setRolePreviewFetchRoleLabelResolver((slug) => {
      const preview = previewRoles.find((item) => item.slug === slug);
      if (preview) return preview.name;
      if (user?.role === slug && user.roleName) return user.roleName;
      return null;
    });
    return () => setRolePreviewFetchRoleLabelResolver(null);
  }, [previewRoles, user?.role, user?.roleName]);

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
      <RolePreviewHotkeyListener />
      {children}
    </RolePreviewContext.Provider>
  );
}
