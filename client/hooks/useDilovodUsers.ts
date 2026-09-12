import { useCallback, useEffect, useRef, useState } from 'react';
import type { DilovodUser } from '@shared/types/dilovod';

let cachedUsers: DilovodUser[] | null = null;
let inFlight: Promise<DilovodUser[]> | null = null;

export function invalidateDilovodUsersCache() {
  cachedUsers = null;
}

async function fetchDilovodUsers(): Promise<DilovodUser[]> {
  if (cachedUsers) return cachedUsers;
  if (inFlight) return inFlight;

  inFlight = fetch('/api/auth/dilovod-users', { credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const users = await response.json() as DilovodUser[];
      cachedUsers = users;
      return users;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useDilovodUsers(enabled = true) {
  const [users, setUsers] = useState<DilovodUser[]>(cachedUsers ?? []);
  const [loading, setLoading] = useState(enabled && !cachedUsers);
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
      cachedUsers = null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDilovodUsers();
      if (mountedRef.current) {
        setUsers(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Помилка завантаження');
        setUsers([]);
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

  return { users, loading, error, reload: () => load(true) };
}
