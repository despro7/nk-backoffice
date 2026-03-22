import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppNotification, NotificationsResponse } from '../../shared/types/notifications';
import { useApi } from './useApi';

const POLL_INTERVAL_MS = 30_000;
const BASE_SEVERITY = 'severity=error,warning';

export interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** [debug] Позначити прочитаними для ВСІХ юзерів через readBy["_all"]. offset — пропустити N найновіших. */
  markAllReadGlobal: (offset?: number) => Promise<{ markedCount: number; skipped: number } | null>;
  /** Сховати всі сповіщення для поточного юзера (hiddenBy[userId]) */
  hideAll: () => Promise<void>;
  /** [debug] Сховати для ВСІХ юзерів через hiddenBy["_all"]. offset — пропустити N найновіших. */
  hideAllGlobal: (offset?: number) => Promise<{ hiddenCount: number; skipped: number } | null>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const { apiCall } = useApi();
  // Store apiCall in ref so useCallback/useEffect don't re-fire on every render
  const apiCallRef = useRef(apiCall);
  useEffect(() => { apiCallRef.current = apiCall; });

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable function — deps=[] so useEffect polling doesn't loop
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiCallRef.current('/api/notifications?' + BASE_SEVERITY + '&limit=50');
      if (!response.ok) return;
      const json: NotificationsResponse = await response.json();
      setNotifications(json.data);
      setUnreadCount(json.unreadCount);
    } catch {
      // silently fail — bell keeps last known state
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + polling
  useEffect(() => {
    fetchNotifications();
    timerRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: number) => {
    try {
      const response = await apiCallRef.current('/api/notifications/' + id + '/read', { method: 'PUT' });
      if (!response.ok) return;
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const response = await apiCallRef.current('/api/notifications/read-all', { method: 'PUT' });
      if (!response.ok) return;
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  const markAllReadGlobal = useCallback(async (offset = 0) => {
    try {
      const response = await apiCallRef.current(
        `/api/notifications/read-all-global?offset=${offset}`,
        { method: 'PUT' },
      );
      if (!response.ok) return null;
      const json = await response.json();
      await fetchNotifications();
      return json as { markedCount: number; skipped: number };
    } catch { return null; }
  }, [fetchNotifications]);

  const clearAll = useCallback(async () => {
    try {
      const response = await apiCallRef.current('/api/notifications/read-state', { method: 'DELETE' });
      if (!response.ok) return;
      await fetchNotifications();
    } catch { /* ignore */ }
  }, [fetchNotifications]);

  const hideAll = useCallback(async () => {
    try {
      const response = await apiCallRef.current('/api/notifications/hide-all', { method: 'PUT' });
      if (!response.ok) return;
      await fetchNotifications();
    } catch { /* ignore */ }
  }, [fetchNotifications]);

  const hideAllGlobal = useCallback(async (offset = 0) => {
    try {
      const response = await apiCallRef.current(
        `/api/notifications/hide-all-global?offset=${offset}`,
        { method: 'PUT' },
      );
      if (!response.ok) return null;
      const json = await response.json();
      await fetchNotifications();
      return json as { hiddenCount: number; skipped: number };
    } catch { return null; }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    markAllReadGlobal,
    hideAll,
    hideAllGlobal,
    clearAll,
    refresh: fetchNotifications,
  };
}
