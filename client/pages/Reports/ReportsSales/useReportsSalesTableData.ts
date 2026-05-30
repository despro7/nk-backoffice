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
import type { SalesData } from "./ReportsSalesTypes";
import { buildSalesReportCacheKey } from "./ReportsSalesUtils";
import {
  formatCalendarDateValue,
  getPresetRangeByKey,
} from "../shared/ReportsSharedUtils";
import useReportCacheValidation from "../shared/useReportCacheValidation";
import useReportClientCache from "../shared/useReportClientCache";
import useReportStatsCacheClear from "../shared/useReportStatsCacheClear";
import useReportingDayStartHour from "../shared/useReportingDayStartHour";

const CACHE_DURATION = 30000;

export default function useReportsSalesTableData() {
  const { apiCall } = useApi();
  const { isLoading: isAuthLoading } = useAuth();
  const { dayStartHour } = useReportingDayStartHour({ enabled: !isAuthLoading });
  const [extraFilters, setExtraFilters] = useState<Set<string>>(new Set());
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(false);
  const { cache, clearCache, invalidateCacheKey, setCacheEntry } = useReportClientCache<{
    data: SalesData[];
    timestamp: number;
  }>();
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePresetKey, setDatePresetKey] = useState<string>("last7Days");
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    getPresetRangeByKey(datePresets, "last7Days"),
  );
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const fetchSalesDataRef = useRef<(() => Promise<void>) | null>(null);

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
      await fetchSalesDataRef.current?.();
    },
    consoleErrorLabel: "Помилка валідації кешу статистики продажів:",
    getBaseParams: (mode) => ({
      force: "false",
      mode,
    }),
  });

  const { clearStatsCacheLoading, handleClearStatsCache } = useReportStatsCacheClear({
    apiCall,
    onCacheCleared: async () => {
      clearCache();
      await fetchSalesDataRef.current?.();
    },
    consoleErrorLabel: "Помилка очищення серверного кешу статистики продажів:",
  });

  const fetchSalesData = useCallback(
    async (force?: boolean) => {
      if (firstLoadRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        firstLoadRef.current = false;
      }

      if (!dateRange?.start || !dateRange?.end) {
        setSalesData([]);
        return;
      }

      const cacheKey = buildSalesReportCacheKey(statusFilter, dateRange, selectedProducts);
      const now = Date.now();

      if (!force && cache[cacheKey] && now - cache[cacheKey].timestamp < CACHE_DURATION) {
        setSalesData(cache[cacheKey].data);
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

        const isPresetSingleDay = datePresetKey === "today" || datePresetKey === "yesterday";
        const singleDay = isPresetSingleDay || reportingDates.isSingleDate;
        params.append("singleDay", String(singleDay));

        if (selectedProducts.size > 0) {
          Array.from(selectedProducts).forEach((sku) => {
            params.append("products", sku);
          });
        }

        const response = await apiCall(`/api/orders/sales/report?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
          const validatedData = Array.isArray(data.data) ? data.data : [];
          setSalesData(validatedData);
          setCacheEntry(cacheKey, { data: validatedData, timestamp: now });
          markCacheUpdated();
        } else {
          console.error("❌ Sales report API returned error:", data.error);
          setSalesData([]);
        }
      } catch (error) {
        console.error("❌ Error fetching sales report data:", error);
        setSalesData([]);
      } finally {
        setLoading(false);
      }
    },
    [apiCall, cache, datePresetKey, dateRange, dayStartHour, markCacheUpdated, selectedProducts, setCacheEntry, statusFilter],
  );

  const handleRefreshData = useCallback(() => {
    const cacheKey = buildSalesReportCacheKey(statusFilter, dateRange, selectedProducts);

    invalidateCacheKey(cacheKey);

    fetchSalesData(true).catch(console.error);
  }, [dateRange, fetchSalesData, invalidateCacheKey, selectedProducts, statusFilter]);

  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setDatePresetKey("last7Days");
    setDateRange(getPresetRangeByKey(datePresets, "last7Days"));
    setSelectedProducts(new Set());
    setExtraFilters(new Set());
    clearCache();
  }, [clearCache, datePresets]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (dateRange?.start && dateRange?.end) {
      fetchSalesData();
    } else {
      setSalesData([]);
    }
  }, [dateRange?.end, dateRange?.start, fetchSalesData, isAuthLoading]);

  useEffect(() => {
    fetchSalesDataRef.current = () => fetchSalesData(true);
  }, [fetchSalesData]);

  const filteredSalesData = useMemo((): SalesData[] => {
    if (extraFilters.size === 0) {
      return salesData;
    }

    return salesData
      .map((item) => {
        let filteredOrders = item.orders;
        if (extraFilters.has("noMarketplaces")) {
          filteredOrders = filteredOrders.filter((order) => !["rozetka", "prom.ua"].includes(order.source));
        }
        if (extraFilters.has("noOther")) {
          filteredOrders = filteredOrders.filter((order) => order.source !== "інше");
        }
        if (extraFilters.has("noDiscount")) {
          filteredOrders = filteredOrders.filter((order) => {
            const normalizedOrder = order as typeof order & {
              pricinaZnizki?: string;
            };
            const hasDiscountFlag =
              normalizedOrder.hasDiscount === true ||
              (normalizedOrder.discountReasonCode != null && String(normalizedOrder.discountReasonCode).trim() !== "");
            const legacyReason =
              normalizedOrder.pricinaZnizki != null && String(normalizedOrder.pricinaZnizki).trim() !== "";
            const legacyStatus = normalizedOrder.status === "discount";
            return !(hasDiscountFlag || legacyReason || legacyStatus);
          });
        }

        if (filteredOrders.length === 0) {
          return null;
        }

        const ordersCount = filteredOrders.length;
        const portionsCount = filteredOrders.reduce((sum, order) => sum + (order.portionsCount || 0), 0);
        const anyOrderHasTotalPrice = filteredOrders.some(
          (order) => order.totalPrice !== undefined && order.totalPrice !== null,
        );
        const totalPrice = anyOrderHasTotalPrice
          ? filteredOrders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0)
          : undefined;

        const ordersBySource: Record<string, number> = {};
        const portionsBySource: Record<string, number> = {};
        const priceBySource: Record<string, number> = {};
        const ordersByStatus: Record<string, number> = {};
        const portionsByStatus: Record<string, number> = {};

        filteredOrders.forEach((order) => {
          ordersBySource[order.source] = (ordersBySource[order.source] || 0) + 1;
          portionsBySource[order.source] = (portionsBySource[order.source] || 0) + (order.portionsCount || 0);
          priceBySource[order.source] = (priceBySource[order.source] || 0) + (Number(order.totalPrice) || 0);
          ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
          portionsByStatus[order.status] = (portionsByStatus[order.status] || 0) + (order.portionsCount || 0);
        });

        const explicitDiscountOrders = filteredOrders.filter((order) => {
          const normalizedOrder = order as typeof order & {
            pricinaZnizki?: string;
          };

          return (
            normalizedOrder.hasDiscount === true ||
            (normalizedOrder.discountReasonCode != null &&
              String(normalizedOrder.discountReasonCode).trim() !== "") ||
            (normalizedOrder.pricinaZnizki != null &&
              String(normalizedOrder.pricinaZnizki).trim() !== "") ||
            normalizedOrder.status === "discount"
          );
        });

        const ordersWithDiscountReason = explicitDiscountOrders.length;
        const portionsWithDiscountReason = explicitDiscountOrders.reduce(
          (sum, order) => sum + (order.portionsCount || 0),
          0,
        );

        return {
          ...item,
          orders: filteredOrders,
          ordersCount,
          portionsCount,
          totalPrice,
          ordersBySource,
          portionsBySource,
          priceBySource,
          ordersByStatus,
          portionsByStatus,
          ordersWithDiscountReason,
          portionsWithDiscountReason,
          vidskoduvannaTotal: filteredOrders.filter(
            (order) => order.vidskoduvanna != null && Number(order.vidskoduvanna) > 0,
          ).length,
          vidskoduvannaGrnTotal: filteredOrders.reduce(
            (sum, order) => sum + (Number(order.vidskoduvannaGrn) || 0),
            0,
          ),
          vidskoduvannaPortions: filteredOrders.reduce(
            (sum, order) => sum + (Number(order.vidskoduvanna) || 0),
            0,
          ),
        };
      })
      .filter((item): item is SalesData => Boolean(item));
  }, [extraFilters, salesData]);

  const totals = useMemo(
    () => ({
      ordersCount: filteredSalesData.reduce((sum, item) => sum + item.ordersCount, 0),
      portionsCount: filteredSalesData.reduce((sum, item) => sum + item.portionsCount, 0),
      totalPrice: filteredSalesData.reduce((sum, item) => sum + (item.totalPrice || 0), 0),
      sourceWebsite: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["nk-food.shop"] || 0), 0),
      sourceWebsitePortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["nk-food.shop"] || 0), 0),
      sourceWebsitePrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource["nk-food.shop"] || 0), 0),
      sourceRozetka: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource.rozetka || 0), 0),
      sourceRozetkaPortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource.rozetka || 0), 0),
      sourceRozetkaPrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource.rozetka || 0), 0),
      sourceProm: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["prom.ua"] || 0), 0),
      sourcePromPortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["prom.ua"] || 0), 0),
      sourcePromPrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource["prom.ua"] || 0), 0),
      sourceChat: filteredSalesData.reduce((sum, item) => sum + (item.ordersBySource["інше"] || 0), 0),
      sourceChatPortions: filteredSalesData.reduce((sum, item) => sum + (item.portionsBySource["інше"] || 0), 0),
      sourceChatPrice: filteredSalesData.reduce((sum, item) => sum + (item.priceBySource["інше"] || 0), 0),
      discountReason: filteredSalesData.reduce((sum, item) => sum + item.ordersWithDiscountReason, 0),
      discountReasonPortions: filteredSalesData.reduce((sum, item) => sum + item.portionsWithDiscountReason, 0),
      vidskoduvannaTotal: filteredSalesData.reduce((sum, item) => sum + (item.vidskoduvannaTotal || 0), 0),
      vidskoduvannaGrnTotal: filteredSalesData.reduce((sum, item) => sum + (item.vidskoduvannaGrnTotal || 0), 0),
      vidskoduvannaPortions: filteredSalesData.reduce((sum, item) => sum + (item.vidskoduvannaPortions || 0), 0),
    }),
    [filteredSalesData],
  );

  return {
    cacheLoading,
    cacheModals,
    cacheProgress,
    clearStatsCacheLoading,
    datePresetKey,
    datePresets,
    dateRange,
    extraFilters,
    filteredSalesData,
    handleClearStatsCache,
    handleRefreshAllCache,
    handleRefreshData,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    loading,
    resetFilters,
    salesData,
    selectedProducts,
    setDatePresetKey,
    setDateRange,
    setExtraFilters,
    setSelectedProducts,
    setStatusFilter,
    statusFilter,
    totals,
  };
}

export type UseReportsSalesTableDataReturn = ReturnType<typeof useReportsSalesTableData>;
export {
  CachePeriodSelectModal,
  CacheRefreshConfirmModal,
};