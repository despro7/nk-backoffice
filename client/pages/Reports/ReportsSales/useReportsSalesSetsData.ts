import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "@react-types/datepicker";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import {
  CacheRefreshConfirmModal,
  CachePeriodSelectModal,
} from "@/components/modals/CacheRefreshConfirmModal";
import {
  convertCalendarRangeToReportingRange,
  createStandardDatePresets,
} from "@/lib";
import type { SalesSetReportData } from "./ReportsSalesTypes";
import { buildSalesSetsReportCacheKey } from "./ReportsSalesUtils";
import { getPresetRangeByKey } from "../shared/ReportsSharedUtils";
import useReportCacheValidation from "../shared/useReportCacheValidation";
import useReportClientCache from "../shared/useReportClientCache";
import useReportStatsCacheClear from "../shared/useReportStatsCacheClear";
import useReportingDayStartHour from "../shared/useReportingDayStartHour";

const CACHE_DURATION = 30000;

export default function useReportsSalesSetsData() {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();
  const { dayStartHour } = useReportingDayStartHour({ enabled: !isAuthLoading });
  const [extraFilters, setExtraFilters] = useState<Set<string>>(new Set());
  const [setsData, setSetsData] = useState<SalesSetReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const { cache, clearCache, invalidateCacheKey, setCacheEntry } = useReportClientCache<{
    data: SalesSetReportData[];
    timestamp: number;
  }>();
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("last7Days");
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    getPresetRangeByKey(datePresets, "last7Days"),
  );
  const firstLoadRef = useRef(true);
  const fetchSalesSetsDataRef = useRef<(() => Promise<void>) | null>(null);

  const {
    cacheLoading,
    cacheModals,
    cacheProgress,
    handleRefreshAllCache,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    markCacheUpdated,
  } = useReportCacheValidation({
    apiCall,
    dateRange,
    onCacheValidated: async () => {
      clearCache();
      await fetchSalesSetsDataRef.current?.();
    },
    consoleErrorLabel: "Помилка валідації кешу статистики продажів по наборах:",
    getBaseParams: (mode) => ({
      force: "false",
      mode,
    }),
  });

  const { clearStatsCacheLoading, handleClearStatsCache } = useReportStatsCacheClear({
    apiCall,
    onCacheCleared: async () => {
      clearCache();
      await fetchSalesSetsDataRef.current?.();
    },
    consoleErrorLabel: "Помилка очищення серверного кешу статистики продажів по наборах:",
  });

  const fetchSalesSetsData = useCallback(async (force?: boolean) => {
    if (firstLoadRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      firstLoadRef.current = false;
    }

    if (!dateRange?.start || !dateRange?.end) {
      setSetsData([]);
      return;
    }

    const cacheKey = buildSalesSetsReportCacheKey(statusFilter, dateRange);
    const now = Date.now();

    if (!force && cache[cacheKey] && now - cache[cacheKey].timestamp < CACHE_DURATION) {
      setSetsData(cache[cacheKey].data);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const reportingDates = convertCalendarRangeToReportingRange(dateRange, dayStartHour);
      params.append("startDate", reportingDates.startDate);
      params.append("endDate", reportingDates.endDate);

      const response = await apiCall(`/api/orders/sales/report/sets?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        const validatedData = Array.isArray(data.data) ? data.data : [];
        setSetsData(validatedData);
        setCacheEntry(cacheKey, { data: validatedData, timestamp: now });
        markCacheUpdated();
      } else {
        setSetsData([]);
      }
    } catch (error) {
      console.error("❌ Error fetching sales sets report data:", error);
      setSetsData([]);
    } finally {
      setLoading(false);
    }
  }, [apiCall, cache, dateRange, dayStartHour, markCacheUpdated, setCacheEntry, statusFilter]);

  const handleRefreshData = useCallback(() => {
    const cacheKey = buildSalesSetsReportCacheKey(statusFilter, dateRange);
    invalidateCacheKey(cacheKey);
    fetchSalesSetsData(true).catch(console.error);
  }, [dateRange, fetchSalesSetsData, invalidateCacheKey, statusFilter]);

  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setDatePresetKey("last7Days");
    setDateRange(getPresetRangeByKey(datePresets, "last7Days"));
    setExtraFilters(new Set());
    clearCache();
  }, [clearCache, datePresets]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (dateRange?.start && dateRange?.end) {
      fetchSalesSetsData();
    } else {
      setSetsData([]);
    }
  }, [dateRange?.end, dateRange?.start, fetchSalesSetsData, isAuthLoading]);

  useEffect(() => {
    fetchSalesSetsDataRef.current = () => fetchSalesSetsData(true);
  }, [fetchSalesSetsData]);

  const filteredSetsData = useMemo((): SalesSetReportData[] => {
    if (extraFilters.size === 0) {
      return setsData;
    }

    return setsData
      .map((item) => {
        let filteredOrders = item.orders;

        if (extraFilters.has("noMarketplaces")) {
          filteredOrders = filteredOrders.filter((order) => !["rozetka", "prom.ua"].includes(order.source));
        }

        if (extraFilters.has("noOther")) {
          filteredOrders = filteredOrders.filter((order) => order.source !== "інше" && order.source !== "Інше");
        }

        if (extraFilters.has("noDiscount")) {
          filteredOrders = filteredOrders.filter((order) => !order.hasDiscount && !order.discountReasonCode);
        }

        if (filteredOrders.length === 0) {
          return null;
        }

        const uniqOrdersCount = filteredOrders.length;
        const ordersCount = filteredOrders.reduce((sum, order) => sum + (order.orderedQuantity || 0), 0);
        const ordersBySource: Record<string, number> = {};
        const portionsBySource: Record<string, number> = {};

        filteredOrders.forEach((order) => {
          ordersBySource[order.source] = (ordersBySource[order.source] || 0) + 1;
          portionsBySource[order.source] = (portionsBySource[order.source] || 0) + (order.orderedQuantity || 0);
        });

        const discountOrders = filteredOrders.filter((order) => order.hasDiscount || order.discountReasonCode);

        return {
          ...item,
          orders: filteredOrders,
          ordersCount,
          uniqOrdersCount,
          ordersBySource,
          portionsBySource,
          ordersWithDiscountReason: discountOrders.length,
          portionsWithDiscountReason: discountOrders.reduce((sum, order) => sum + (order.orderedQuantity || 0), 0),
        };
      })
      .filter((item): item is SalesSetReportData => Boolean(item));
  }, [extraFilters, setsData]);

  const totals = useMemo(() => ({
    ordersCount: filteredSetsData.reduce((sum, item) => sum + item.ordersCount, 0),
    uniqOrdersCount: filteredSetsData.reduce((sum, item) => sum + item.uniqOrdersCount, 0),
    sourceWebsite: filteredSetsData.reduce((sum, item) => sum + (item.ordersBySource["nk-food.shop"] || 0), 0),
    sourceRozetka: filteredSetsData.reduce((sum, item) => sum + (item.ordersBySource.rozetka || 0), 0),
    sourceProm: filteredSetsData.reduce((sum, item) => sum + (item.ordersBySource["prom.ua"] || 0), 0),
    sourceChat: filteredSetsData.reduce((sum, item) => sum + ((item.ordersBySource["інше"] || 0) + (item.ordersBySource["Інше"] || 0)), 0),
    discountReason: filteredSetsData.reduce((sum, item) => sum + item.ordersWithDiscountReason, 0),
  }), [filteredSetsData]);

  return {
    cacheLoading,
    cacheModals,
    cacheProgress,
    clearStatsCacheLoading,
    datePresetKey,
    datePresets,
    dateRange,
    extraFilters,
    filteredSetsData,
    handleClearStatsCache,
    handleRefreshAllCache,
    handleRefreshData,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    loading,
    resetFilters,
    setDatePresetKey,
    setDateRange,
    setExtraFilters,
    setStatusFilter,
    statusFilter,
    totals,
  };
}

export type UseReportsSalesSetsDataReturn = ReturnType<typeof useReportsSalesSetsData>;
export {
  CachePeriodSelectModal,
  CacheRefreshConfirmModal,
};