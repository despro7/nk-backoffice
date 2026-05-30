import { useCallback, useEffect, useRef } from "react";
import type { DateRange } from "@react-types/datepicker";

type ProductStatsResponseBase<TItem, TMetadata> = {
  success: boolean;
  data: TItem[];
  metadata: TMetadata;
};

type ProductDateStatsResponseBase<TItem, TProductInfo> = {
  success: boolean;
  data: TItem[];
  product: TProductInfo;
};

interface UseReportProductStatsFetchersOptions<
  TProductItem,
  TDateItem,
  TProductMetadata,
  TProductInfo,
  TCacheEntry extends { data: TProductItem[]; timestamp: number },
> {
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
  buildProductStatsUrl: (dateRange: DateRange | null, statusFilter: string) => string;
  buildDateStatsUrl: (selectedProduct: string, dateRange: DateRange | null, statusFilter: string) => string;
  cache: Record<string, TCacheEntry>;
  cacheDuration: number;
  dateRange: DateRange | null;
  dateStatsErrorMessage: string;
  getCacheKey: (statusFilter: string, dateRange: DateRange | null) => string;
  markCacheUpdated: () => void;
  onDateStatsSuccess: (data: TDateItem[], product: TProductInfo) => void;
  onProductStatsCacheHit: (entry: TCacheEntry) => void;
  onProductStatsNetworkSuccess: (data: TProductItem[], metadata: TProductMetadata) => void;
  productStatsErrorMessage: string;
  selectedProduct: string;
  setCacheEntry: (cacheKey: string, entry: TCacheEntry) => void;
  setLoading: (loading: boolean) => void;
  statusFilter: string;
  toCacheEntry: (data: TProductItem[], metadata: TProductMetadata, timestamp: number) => TCacheEntry;
}

interface UseReportProductStatsFetchersReturn {
  fetchProductDateStats: (force?: boolean) => Promise<void>;
  fetchProductStats: (force?: boolean) => Promise<void>;
}

export default function useReportProductStatsFetchers<
  TProductItem,
  TDateItem,
  TProductMetadata,
  TProductInfo,
  TCacheEntry extends { data: TProductItem[]; timestamp: number },
>({
  apiCall,
  buildProductStatsUrl,
  buildDateStatsUrl,
  cache,
  cacheDuration,
  dateRange,
  dateStatsErrorMessage,
  getCacheKey,
  markCacheUpdated,
  onDateStatsSuccess,
  onProductStatsCacheHit,
  onProductStatsNetworkSuccess,
  productStatsErrorMessage,
  selectedProduct,
  setCacheEntry,
  setLoading,
  statusFilter,
  toCacheEntry,
}: UseReportProductStatsFetchersOptions<
  TProductItem,
  TDateItem,
  TProductMetadata,
  TProductInfo,
  TCacheEntry
>): UseReportProductStatsFetchersReturn {
  const firstProductStatsLoadRef = useRef(true);
  const cacheRef = useRef(cache);
  const onDateStatsSuccessRef = useRef(onDateStatsSuccess);
  const onProductStatsCacheHitRef = useRef(onProductStatsCacheHit);
  const onProductStatsNetworkSuccessRef = useRef(onProductStatsNetworkSuccess);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    onDateStatsSuccessRef.current = onDateStatsSuccess;
  }, [onDateStatsSuccess]);

  useEffect(() => {
    onProductStatsCacheHitRef.current = onProductStatsCacheHit;
  }, [onProductStatsCacheHit]);

  useEffect(() => {
    onProductStatsNetworkSuccessRef.current = onProductStatsNetworkSuccess;
  }, [onProductStatsNetworkSuccess]);

  const fetchProductStats = useCallback(async (force?: boolean) => {
    if (firstProductStatsLoadRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      firstProductStatsLoadRef.current = false;
    }

    const cacheKey = getCacheKey(statusFilter, dateRange);
    const now = Date.now();

    const cachedEntry = cacheRef.current[cacheKey];

    if (!force && cachedEntry && now - cachedEntry.timestamp < cacheDuration) {
      onProductStatsCacheHitRef.current(cachedEntry);
      return;
    }

    setLoading(true);

    try {
      const response = await apiCall(buildProductStatsUrl(dateRange, statusFilter));
      const data: ProductStatsResponseBase<TProductItem, TProductMetadata> = await response.json();

      if (data.success) {
        const validatedData = Array.isArray(data.data) ? data.data : [];
        onProductStatsNetworkSuccessRef.current(validatedData, data.metadata);
        setCacheEntry(cacheKey, toCacheEntry(validatedData, data.metadata, now));
        markCacheUpdated();
      }
    } catch (error) {
      console.error(productStatsErrorMessage, error);
    } finally {
      setLoading(false);
    }
  }, [
    apiCall,
    buildProductStatsUrl,
    cacheDuration,
    dateRange,
    getCacheKey,
    markCacheUpdated,
    productStatsErrorMessage,
    setCacheEntry,
    setLoading,
    statusFilter,
    toCacheEntry,
  ]);

  const fetchProductDateStats = useCallback(async () => {
    if (!selectedProduct) {
      return;
    }

    setLoading(true);

    try {
      const response = await apiCall(buildDateStatsUrl(selectedProduct, dateRange, statusFilter));
      const data: ProductDateStatsResponseBase<TDateItem, TProductInfo> = await response.json();

      if (data.success) {
        const validatedData = Array.isArray(data.data) ? data.data : [];
        onDateStatsSuccessRef.current(validatedData, data.product);
      }
    } catch (error) {
      console.error(dateStatsErrorMessage, error);
    } finally {
      setLoading(false);
    }
  }, [
    apiCall,
    buildDateStatsUrl,
    dateRange,
    dateStatsErrorMessage,
    selectedProduct,
    setLoading,
    statusFilter,
  ]);

  return {
    fetchProductDateStats,
    fetchProductStats,
  };
}