import { useState, useEffect, useCallback } from 'react';

interface ServerStatus {
  isOnline: boolean;
  isLoading: boolean;
  lastChecked: Date | null;
}

export const useServerStatus = (fallbackIntervalMs: number = 30000) => {
  const [status, setStatus] = useState<ServerStatus>({
    isOnline: true,
    isLoading: false,
    lastChecked: null,
  });
  const [intervalMs, setIntervalMs] = useState<number>(fallbackIntervalMs);

  const fetchIntervalSetting = useCallback(async (signal?: AbortSignal) => {
    try {
      // Публичная настройка - не отправляем credentials
      const response = await fetch('/api/settings/server_check_interval', {
        signal
      });

      if (response.ok) {
        const setting = await response.json();
        const intervalValue = parseInt(setting.value, 10);
        if (!isNaN(intervalValue) && intervalValue >= 1000) {
          setIntervalMs(intervalValue);
        } else {
          console.warn(`⚠️ [useServerStatus] Invalid interval value in settings: ${setting.value}, using fallback: ${fallbackIntervalMs}ms`);
          setIntervalMs(fallbackIntervalMs);
        }
      } else {
        setIntervalMs(fallbackIntervalMs);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && process.env.NODE_ENV === 'development') {
        console.error('❌ [useServerStatus] Error fetching interval setting:', error);
      }
      setIntervalMs(fallbackIntervalMs);
    }
  }, [fallbackIntervalMs]);

  const checkServerStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Не используем credentials чтобы избежать CORS проблем при проверке статуса
      });

      const isOnline = response.ok;
      setStatus({
        isOnline,
        isLoading: false,
        lastChecked: new Date(),
      });

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [useServerStatus] Error checking server status:', error);
      }
      setStatus({
        isOnline: false,
        isLoading: false,
        lastChecked: new Date(),
      });
    }
  }, []);

  useEffect(() => {
    // Сначала получаем настройку интервала
    const controller = new AbortController();
    fetchIntervalSetting(controller.signal);

    return () => controller.abort();
  }, [fetchIntervalSetting]);

  useEffect(() => {
    if (intervalMs > 0) {
      // Проверяем статус сразу при монтировании
      checkServerStatus();

      // Устанавливаем периодическую проверку
      const interval = setInterval(checkServerStatus, intervalMs);

      return () => clearInterval(interval);
    }
  }, [intervalMs, checkServerStatus]);

  return {
    ...status,
    checkServerStatus,
  };
};
