import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

export interface ServerStatus {
  isOnline: boolean;
  isLoading: boolean;
  lastChecked: Date | null;
  serverStartTime: Date | null;
}

interface ServerStatusContextValue extends ServerStatus {
  checkServerStatus: () => void;
}

export const ServerStatusContext = createContext<ServerStatusContextValue | undefined>(undefined);

export const ServerStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ServerStatus>({
    isOnline: true,
    isLoading: false,
    lastChecked: null,
    serverStartTime: null,
  });
  const [intervalMs, setIntervalMs] = useState<number>(15000);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch interval from settings
  const fetchIntervalSetting = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/settings/server_check_interval', { signal });
      if (response.ok) {
        const setting = await response.json();
        const intervalValue = parseInt(setting.value, 10);
        if (!isNaN(intervalValue) && intervalValue >= 1000) {
          setIntervalMs(intervalValue);
        }
      }
    } catch {}
  }, []);

  const checkServerStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true }));
    try {
      const response = await fetch('/api/health', { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        const serverStartTime = data.uptime ? new Date(Date.now() - data.uptime * 1000) : null;
        setStatus({
          isOnline: true,
          isLoading: false,
          lastChecked: new Date(),
          serverStartTime,
        });
      } else {
        setStatus(prev => ({
          isOnline: false,
          isLoading: false,
          lastChecked: new Date(),
          serverStartTime: prev.serverStartTime,
        }));
      }
    } catch {
      setStatus(prev => ({
        isOnline: false,
        isLoading: false,
        lastChecked: new Date(),
        serverStartTime: prev.serverStartTime,
      }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchIntervalSetting(controller.signal);
    return () => controller.abort();
  }, [fetchIntervalSetting]);

  useEffect(() => {
    checkServerStatus();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(checkServerStatus, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs, checkServerStatus]);

  return (
    <ServerStatusContext.Provider value={{ ...status, checkServerStatus }}>
      {children}
    </ServerStatusContext.Provider>
  );
};

export function useServerStatus() {
  const ctx = useContext(ServerStatusContext);
  if (!ctx) throw new Error("useServerStatus must be used within ServerStatusProvider");
  return ctx;
}
