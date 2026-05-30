import { useCallback, useState } from "react";

interface UseReportClientCacheReturn<TEntry> {
  cache: Record<string, TEntry>;
  clearCache: () => void;
  invalidateCacheKey: (cacheKey: string) => void;
  setCacheEntry: (cacheKey: string, entry: TEntry) => void;
}

export default function useReportClientCache<TEntry>(): UseReportClientCacheReturn<TEntry> {
  const [cache, setCache] = useState<Record<string, TEntry>>({});

  const clearCache = useCallback(() => {
    setCache({});
  }, []);

  const invalidateCacheKey = useCallback((cacheKey: string) => {
    setCache((prev) => {
      const nextCache = { ...prev };
      delete nextCache[cacheKey];
      return nextCache;
    });
  }, []);

  const setCacheEntry = useCallback((cacheKey: string, entry: TEntry) => {
    setCache((prev) => ({
      ...prev,
      [cacheKey]: entry,
    }));
  }, []);

  return {
    cache,
    clearCache,
    invalidateCacheKey,
    setCacheEntry,
  };
}