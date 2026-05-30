import { useCallback, useState } from "react";
import { ToastService } from "@/services/ToastService";

interface UseReportStatsCacheClearOptions {
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
  onCacheCleared: () => Promise<void> | void;
  consoleErrorLabel: string;
}

interface UseReportStatsCacheClearReturn {
  clearStatsCacheLoading: boolean;
  handleClearStatsCache: () => Promise<void>;
}

export default function useReportStatsCacheClear({
  apiCall,
  onCacheCleared,
  consoleErrorLabel,
}: UseReportStatsCacheClearOptions): UseReportStatsCacheClearReturn {
  const [clearStatsCacheLoading, setClearStatsCacheLoading] = useState(false);

  const handleClearStatsCache = useCallback(async () => {
    setClearStatsCacheLoading(true);

    try {
      ToastService.show({
        title: "Очищення кешу",
        description: "Початок очищення серверного кешу статистики...",
        color: "primary",
        icon: "trash-2",
        timeout: 3000,
      });

      const response = await apiCall("/api/orders/cache/stats/clear", {
        method: "POST",
      });

      if (response.status === 403) {
        throw new Error("Недостатньо прав доступу. Необхідні права адміністратора.");
      }

      if (!response.ok) {
        throw new Error("Failed to clear statistics cache");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to clear statistics cache");
      }

      ToastService.show({
        title: "Успішно очищено",
        description: `Серверний кеш статистики очищено (${result.data.entriesCleared} записів)`,
        color: "success",
        icon: "circle-check-big",
        timeout: 5000,
      });

      await onCacheCleared();
    } catch (error) {
      console.error(consoleErrorLabel, error);
      ToastService.show({
        title: "Помилка",
        description: `Помилка при очищенні серверного кешу: ${error}`,
        color: "danger",
        icon: "triangle-alert",
        timeout: 7000,
      });
    } finally {
      setClearStatsCacheLoading(false);
    }
  }, [apiCall, consoleErrorLabel, onCacheCleared]);

  return {
    clearStatsCacheLoading,
    handleClearStatsCache,
  };
}