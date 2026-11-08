import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  NotificationFeedCounts,
  NotificationFeedItem,
  NotificationFeedResponse,
  NotificationTab,
} from '@shared/types/notifications';
import { useApi } from './useApi';

const POLL_INTERVAL_MS = 30_000;
const EMPTY_COUNTS: NotificationFeedCounts = { all: 0, mine: 0, errors: 0, archive: 0 };

export interface UseNotificationFeedReturn {
  items: NotificationFeedItem[];
  counts: NotificationFeedCounts;
  tab: NotificationTab;
  setTab: (tab: NotificationTab) => void;
  loading: boolean;
  /** Перший запит вкладки ще не повернувся. */
  initialLoading: boolean;
  refresh: () => Promise<void>;
  markRead: (item: NotificationFeedItem) => Promise<void>;
  archive: (item: NotificationFeedItem) => Promise<void>;
  unarchive: (item: NotificationFeedItem) => Promise<void>;
  resolve: (item: NotificationFeedItem) => Promise<void>;
  /** [debug] глобальні дії зі старого API. */
  debug: {
    readAllGlobal: (offset: number) => Promise<string | null>;
    hideAllGlobal: (offset: number) => Promise<string | null>;
    resetOwnRead: () => Promise<string | null>;
  };
}

/**
 * Notification Centre feed. When the dropdown is closed only counters are polled (limit=1);
 * when it is open the active tab is loaded in full.
 */
export function useNotificationFeed(isOpen: boolean): UseNotificationFeedReturn {
  const { apiCall } = useApi();
  const apiRef = useRef(apiCall);
  useEffect(() => {
    apiRef.current = apiCall;
  });

  const [tab, setTabState] = useState<NotificationTab>('all');
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [counts, setCounts] = useState<NotificationFeedCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(false);
  const [loadedTab, setLoadedTab] = useState<NotificationTab | null>(null);
  const requestRef = useRef(0);
  const tabRef = useRef(tab);
  const openRef = useRef(isOpen);
  tabRef.current = tab;
  openRef.current = isOpen;

  const fetchFeed = useCallback(async () => {
    const requestId = ++requestRef.current;
    const activeTab = tabRef.current;
    const full = openRef.current;
    try {
      if (full) setLoading(true);
      const res = await apiRef.current(`/api/notifications/feed?tab=${activeTab}&limit=${full ? 100 : 1}`);
      if (!res.ok) return;
      const json: NotificationFeedResponse = await res.json();
      if (requestId !== requestRef.current) return;
      setCounts(json.counts);
      if (full) {
        setItems(json.data);
        setLoadedTab(activeTab);
      }
    } catch {
      // keep last known state
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const timer = setInterval(fetchFeed, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchFeed]);

  useEffect(() => {
    if (isOpen) fetchFeed();
  }, [isOpen, tab, fetchFeed]);

  const setTab = useCallback((next: NotificationTab) => {
    setTabState(next);
    setItems([]);
    setLoadedTab(null);
  }, []);

  const send = useCallback(async (path: string, ids: number[]) => {
    try {
      const res = await apiRef.current(`/api/notifications/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const decCounts = useCallback((item: NotificationFeedItem) => {
    if (item.read) return;
    setCounts((prev) => ({
      ...prev,
      all: Math.max(0, prev.all - 1),
      mine: item.mine ? Math.max(0, prev.mine - 1) : prev.mine,
      errors: item.level === 'error' || item.level === 'warning' ? Math.max(0, prev.errors - 1) : prev.errors,
    }));
  }, []);

  const markRead = useCallback(async (item: NotificationFeedItem) => {
    if (item.read) return;
    decCounts(item);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    await send('read', item.ids);
  }, [decCounts, send]);

  const removeFromList = useCallback((item: NotificationFeedItem) => {
    decCounts(item);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }, [decCounts]);

  const archive = useCallback(async (item: NotificationFeedItem) => {
    removeFromList(item);
    setCounts((prev) => ({ ...prev, archive: prev.archive + 1 }));
    await send('archive', item.ids);
  }, [removeFromList, send]);

  const resolve = useCallback(async (item: NotificationFeedItem) => {
    removeFromList(item);
    setCounts((prev) => ({ ...prev, archive: prev.archive + 1 }));
    await send('resolve', item.ids);
  }, [removeFromList, send]);

  const unarchive = useCallback(async (item: NotificationFeedItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setCounts((prev) => ({ ...prev, archive: Math.max(0, prev.archive - 1) }));
    await send('unarchive', item.ids);
    fetchFeed();
  }, [send, fetchFeed]);

  const debugCall = useCallback(async (url: string, method: 'PUT' | 'DELETE', format: (json: any) => string) => {
    try {
      const res = await apiRef.current(url, { method });
      if (!res.ok) return null;
      const json = await res.json();
      await fetchFeed();
      return format(json);
    } catch {
      return null;
    }
  }, [fetchFeed]);

  return {
    items,
    counts,
    tab,
    setTab,
    loading,
    initialLoading: isOpen && loadedTab !== tab,
    refresh: fetchFeed,
    markRead,
    archive,
    unarchive,
    resolve,
    debug: {
      readAllGlobal: (offset) =>
        debugCall(`/api/notifications/read-all-global?offset=${offset}`, 'PUT', (j) => `read: ${j.markedCount}, skip: ${j.skipped}`),
      hideAllGlobal: (offset) =>
        debugCall(`/api/notifications/hide-all-global?offset=${offset}`, 'PUT', (j) => `hidden: ${j.hiddenCount}, skip: ${j.skipped}`),
      resetOwnRead: () => debugCall('/api/notifications/read-state', 'DELETE', (j) => `reset: ${j.clearedCount}`),
    },
  };
}
