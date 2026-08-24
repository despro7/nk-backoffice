import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { permissionsFingerprint } from '@shared/constants/permissions';
import {
  PERMISSIONS_REVISION_EVENT,
  PERMISSIONS_REVISION_STORAGE_KEY,
} from '@/lib/notifyPermissionsChanged';

const POLL_INTERVAL_MS = 30_000;

interface EffectivePermissionsResponse {
  role: string;
  permissions: string[];
}

/**
 * Порівнює ефективні права з сервером. Якщо матрицю ролі змінено —
 * пропонує оновити сторінку (як банер після деплою).
 */
export function usePermissionsRevisionCheck() {
  const { user } = useAuth();
  const { effectiveRole, isRealAdmin } = useRolePreview();
  const [permissionsChanged, setPermissionsChanged] = useState(false);
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    baselineRef.current = null;
    setPermissionsChanged(false);
  }, [user?.id, effectiveRole]);

  useEffect(() => {
    if (!user || isRealAdmin) return;

    let cancelled = false;

    const pull = async () => {
      try {
        const response = await fetch('/api/auth/effective-permissions', { credentials: 'include' });
        if (!response.ok) return;
        const data: EffectivePermissionsResponse = await response.json();
        const fingerprint = permissionsFingerprint(data.role, data.permissions);
        if (baselineRef.current === null) {
          baselineRef.current = fingerprint;
          return;
        }
        if (baselineRef.current !== fingerprint) {
          if (!cancelled) setPermissionsChanged(true);
        }
      } catch {
        // ignore network blips
      }
    };

    const onSignal = () => {
      void pull();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === PERMISSIONS_REVISION_STORAGE_KEY) onSignal();
    };

    void pull();
    const interval = window.setInterval(onSignal, POLL_INTERVAL_MS);
    window.addEventListener(PERMISSIONS_REVISION_EVENT, onSignal);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onSignal);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(PERMISSIONS_REVISION_EVENT, onSignal);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onSignal);
    };
  }, [user, isRealAdmin, effectiveRole]);

  return { permissionsChanged };
}
