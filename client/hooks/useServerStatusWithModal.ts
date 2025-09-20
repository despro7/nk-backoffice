import { useState, useEffect, useCallback, useRef } from 'react';
import { useServerStatus } from './useServerStatus';

interface ServerStatusWithModal {
  isOnline: boolean;
  isLoading: boolean;
  lastChecked: Date | null;
  showModal: boolean;
  isOffline: boolean;
  serverStartTime: Date | null;
  uptime: string | null;
  onCloseModal: () => void;
}

export const useServerStatusWithModal = (fallbackIntervalMs: number = 30000) => {
  const { isOnline, isLoading, lastChecked, checkServerStatus } = useServerStatus(fallbackIntervalMs);
  const [showModal, setShowModal] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [serverStartTime, setServerStartTime] = useState<Date | null>(null);
  const [uptime, setUptime] = useState<string | null>(null);
  const previousStatusRef = useRef<boolean | null>(null);
  const hasShownOfflineModalRef = useRef(false);

  // Функция для форматирования времени работы
  const formatUptime = useCallback((startTime: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays}д ${diffHours}г ${diffMinutes}хв`;
    } else if (diffHours > 0) {
      return `${diffHours}г ${diffMinutes}хв`;
    } else {
      return `${diffMinutes}хв`;
    }
  }, []);

  // Обновляем uptime каждую минуту
  useEffect(() => {
    if (!serverStartTime) return;

    const updateUptime = () => {
      setUptime(formatUptime(serverStartTime));
    };

    updateUptime(); // Обновляем сразу
    const interval = setInterval(updateUptime, 60000); // Каждую минуту

    return () => clearInterval(interval);
  }, [serverStartTime, formatUptime]);

  // Отслеживаем изменения статуса сервера
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    
    // Если статус изменился с online на offline
    if (previousStatus === true && isOnline === false && !isLoading) {
      setIsOffline(true);
      setShowModal(true);
      hasShownOfflineModalRef.current = true;
    }
    // Если статус изменился с offline на online
    else if (previousStatus === false && isOnline === true && !isLoading) {
      setIsOffline(false);
      setShowModal(true);
      hasShownOfflineModalRef.current = false; // Сбрасываем флаг для следующего отключения
      
      // Устанавливаем время начала работы сервера
      setServerStartTime(new Date());
    }
    // Если сервер онлайн и это первая проверка
    else if (previousStatus === null && isOnline === true && !isLoading) {
      setServerStartTime(new Date());
    }

    previousStatusRef.current = isOnline;
  }, [isOnline, isLoading]);

  const onCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return {
    isOnline,
    isLoading,
    lastChecked,
    showModal,
    isOffline,
    serverStartTime,
    uptime,
    onCloseModal,
    checkServerStatus,
  };
};
