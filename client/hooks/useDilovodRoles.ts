import { useCallback, useEffect, useRef, useState } from 'react';
import type { DilovodRole } from '@shared/types/dilovod';

let cachedRoles: DilovodRole[] | null = null;
let inFlight: Promise<DilovodRole[]> | null = null;

export function invalidateDilovodRolesCache() {
  cachedRoles = null;
}

async function fetchDilovodRoles(): Promise<DilovodRole[]> {
  if (cachedRoles) return cachedRoles;
  if (inFlight) return inFlight;

  inFlight = fetch('/api/auth/dilovod-roles', { credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const roles = await response.json() as DilovodRole[];
      cachedRoles = roles;
      return roles;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useDilovodRoles(enabled = true) {
  const [roles, setRoles] = useState<DilovodRole[]>(cachedRoles ?? []);
  const [loading, setLoading] = useState(enabled && !cachedRoles);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (force = false) => {
    if (!enabled) return;
    if (force) {
      cachedRoles = null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDilovodRoles();
      if (mountedRef.current) {
        setRoles(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Помилка завантаження');
        setRoles([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { roles, loading, error, reload: () => load(true) };
}
