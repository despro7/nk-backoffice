import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/useApi";
import type { ReportingDayStartHourResponse } from "./ReportsSharedTypes";

interface UseReportingDayStartHourOptions {
  enabled?: boolean;
  initialValue?: number;
}

interface UseReportingDayStartHourReturn {
  dayStartHour: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export default function useReportingDayStartHour(
  options: UseReportingDayStartHourOptions = {},
): UseReportingDayStartHourReturn {
  const { enabled = true, initialValue = 0 } = options;
  const { apiCall } = useApi();
  const [dayStartHour, setDayStartHour] = useState<number>(initialValue);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiCall("/api/settings/reporting-day-start-hour");
      const data: ReportingDayStartHourResponse = await response.json();

      if (data.dayStartHour !== undefined) {
        setDayStartHour(data.dayStartHour);
      }
    } catch (error) {
      console.warn("Failed to fetch dayStartHour, using fallback value:", error);
    } finally {
      setIsLoading(false);
    }
  }, [apiCall, enabled]);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  return {
    dayStartHour,
    isLoading,
    refresh,
  };
}