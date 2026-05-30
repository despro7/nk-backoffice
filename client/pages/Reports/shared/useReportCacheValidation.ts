import { useCallback, useEffect, useState } from "react";
import type { DateRange } from "@react-types/datepicker";
import {
  useCacheRefreshModals,
} from "@/components/modals/CacheRefreshConfirmModal";
import { ToastService } from "@/services/ToastService";
import type { ReportCacheProgress } from "./ReportsSharedTypes";

type CacheValidationMode = "full" | "period";

interface UseReportCacheValidationOptions {
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
  dateRange: DateRange | null;
  onCacheValidated: () => Promise<void>;
  consoleErrorLabel: string;
  buildRangeParams?: (range: DateRange) => Record<string, string>;
  getBaseParams?: (mode: CacheValidationMode) => Record<string, string>;
}

interface UseReportCacheValidationReturn {
  cacheLoading: boolean;
  cacheModals: ReturnType<typeof useCacheRefreshModals>;
  cacheProgress: ReportCacheProgress | null;
  handleRefreshAllCache: () => void;
  handleRefreshPeriodCache: () => void;
  lastCacheUpdate: Date | null;
  markCacheUpdated: () => void;
}

export default function useReportCacheValidation({
  apiCall,
  dateRange,
  onCacheValidated,
  consoleErrorLabel,
  buildRangeParams,
  getBaseParams,
}: UseReportCacheValidationOptions): UseReportCacheValidationReturn {
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<ReportCacheProgress | null>(null);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  const markCacheUpdated = useCallback(() => {
    setLastCacheUpdate(new Date());
  }, []);

  const refreshCache = useCallback(async (mode: CacheValidationMode = "full", periodRange?: DateRange | null) => {
    setCacheLoading(true);
    setCacheProgress(null);

    try {
      const modeText = mode === "full" ? "всі записи" : "період";
      ToastService.show({
        title: "Початок оновлення",
        description: `Початок валідації та оновлення кешу (${modeText}). Використовується метод з інтелектуальною перевіркою.`,
        color: "primary",
        icon: "refresh-cw",
        iconSpin: true,
        timeout: 3000,
      });

      const params: Record<string, string> = getBaseParams
        ? getBaseParams(mode)
        : {
            force: "true",
            mode,
          };

      const rangeToUse = periodRange || (mode === "period" ? dateRange : null);
      if (rangeToUse?.start && rangeToUse?.end) {
        const rangeParams = buildRangeParams
          ? buildRangeParams(rangeToUse)
          : {
              startDate: `${rangeToUse.start.year}-${String(rangeToUse.start.month).padStart(2, "0")}-${String(rangeToUse.start.day).padStart(2, "0")}`,
              endDate: `${rangeToUse.end.year}-${String(rangeToUse.end.month).padStart(2, "0")}-${String(rangeToUse.end.day).padStart(2, "0")}`,
            };

        params.startDate = rangeParams.startDate;
        params.endDate = rangeParams.endDate;
        params.mode = "period";
      }

      const response = await apiCall("/api/orders/cache/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (response.status === 403) {
        throw new Error("Недостатньо прав доступу. Необхідні права адміністратора.");
      }

      if (!response.ok) {
        throw new Error("Failed to validate cache");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Cache validation failed");
      }

      markCacheUpdated();
      await onCacheValidated();

      ToastService.show({
        title: "Успішно оновлено",
        description: "Кеш статистики успішно провалідовано та оновлено!",
        color: "success",
        icon: "circle-check-big",
        timeout: 10000,
      });
    } catch (error) {
      console.error(consoleErrorLabel, error);
      ToastService.show({
        title: "Помилка",
        description: "Помилка при валідації кешу: " + error,
        color: "danger",
        icon: "triangle-alert",
        timeout: 7000,
      });
    } finally {
      setCacheLoading(false);
      setCacheProgress(null);
    }
  }, [apiCall, buildRangeParams, consoleErrorLabel, dateRange, getBaseParams, markCacheUpdated, onCacheValidated]);

  const cacheModals = useCacheRefreshModals({
    apiCall,
    onRefreshAll: () => refreshCache("full"),
    onRefreshPeriod: (range) => refreshCache("period", range),
  });

  const handleRefreshAllCache = useCallback(() => {
    cacheModals.openRefreshAll();
  }, [cacheModals]);

  const handleRefreshPeriodCache = useCallback(() => {
    cacheModals.openRefreshPeriod();
  }, [cacheModals]);

  useEffect(() => {
    if (!lastCacheUpdate) {
      setLastCacheUpdate(new Date());
    }
  }, [lastCacheUpdate]);

  return {
    cacheLoading,
    cacheModals,
    cacheProgress,
    handleRefreshAllCache,
    handleRefreshPeriodCache,
    lastCacheUpdate,
    markCacheUpdated,
  };
}